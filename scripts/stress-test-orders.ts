/**
 * Stress Test — 100 concurrent orders
 * =====================================
 * Tests that create_order_safe_v2 handles load without errors.
 *
 * HOW TO FIND restaurant_id AND product_id:
 *   Run this SQL in Supabase SQL Editor:
 *     SELECT r.id as restaurant_id, r.slug,
 *            p.id as product_id, p.name, p.price
 *     FROM restaurants r
 *     JOIN products p ON p.restaurant_id = r.id
 *     WHERE p.is_active = true
 *     LIMIT 5;
 *
 * HOW TO RUN:
 *   npm run stress-test
 *
 * REQUIREMENTS:
 *   - tsx must be available (installed as dep of this project via npx)
 *   - The restaurant and product IDs below must exist in the DB
 *   - The RPC create_order_safe_v2 must accept p_source = 'stress_test'
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://ewxarutpvgelwdswjolz.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? (
  // Fallback to hardcoded key (same as src/lib/supabase.ts — dev only)
  (() => { throw new Error('Set VITE_SUPABASE_ANON_KEY env var or update the fallback here'); })()
);

// ── Update these IDs before running ────────────────────────────────────────
const TEST_RESTAURANT_ID = 'aa473567-3ecb-491b-863d-050e394af38a';
const TEST_PRODUCT_ID    = '531a6c48-a009-4fa7-ab03-5a77d55bf3ef';
const TEST_PRODUCT_PRICE = 4.00;
// ───────────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface TestResult {
  index: number;
  success: boolean;
  orderId?: string;
  error?: string;
  ms: number;
}

async function createTestOrder(index: number): Promise<TestResult> {
  const start = Date.now();

  const { data, error } = await supabase.rpc('create_order_safe_v2', {
    p_restaurant_id:   TEST_RESTAURANT_ID,
    p_client_order_key: `stress-test-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    p_payment_method:  'cash',
    p_order_type:      'pickup',
    p_delivery_fee:    0,
    p_cash_given:      15,
    p_customer_name:   `Test Cliente ${index}`,
    p_customer_phone:  '612345678',
    p_delivery_address: '',
    p_notes:           `Pedido de prueba #${index}`,
    p_items: JSON.stringify([
      {
        product_id: TEST_PRODUCT_ID,
        quantity: 1,
        unit_price: TEST_PRODUCT_PRICE,
        modifiers: [],
      },
    ]),
    p_source:          'stress_test',
    p_tip_amount:      0,
  });

  const ms = Date.now() - start;

  if (error) {
    return { index, success: false, error: error.message, ms };
  }

  return { index, success: true, orderId: data as string, ms };
}

async function runStressTest(): Promise<void> {
  console.log('🚀 Starting stress test: 100 orders in batches of 10...\n');

  const results: TestResult[] = [];
  const startTime = Date.now();

  for (let batch = 0; batch < 10; batch++) {
    const batchStart = Date.now();
    const batchPromises = Array.from({ length: 10 }, (_, i) =>
      createTestOrder(batch * 10 + i + 1)
    );
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    const batchOk = batchResults.filter(r => r.success).length;
    const batchMs = Date.now() - batchStart;
    console.log(`  Batch ${String(batch + 1).padStart(2, '0')}/10 — ${batchOk}/10 ok — ${batchMs}ms`);
  }

  const elapsed = Date.now() - startTime;
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const avgMs = successful.length > 0
    ? (successful.reduce((sum, r) => sum + r.ms, 0) / successful.length).toFixed(0)
    : 'n/a';

  console.log('\n📊 STRESS TEST RESULTS:');
  console.log(`  ✅ Successful : ${successful.length}/100`);
  console.log(`  ❌ Failed     : ${failed.length}/100`);
  console.log(`  ⏱  Total time : ${elapsed}ms`);
  console.log(`  ⚡ Avg/order  : ${avgMs}ms`);

  if (failed.length > 0) {
    console.log('\n❌ ERRORS:');
    for (const r of failed) {
      console.log(`  Order ${r.index}: ${r.error}`);
    }
  }

  // Cleanup: delete test orders
  console.log('\n🧹 Cleaning up test orders...');
  const { error: cleanError } = await supabase
    .from('orders')
    .delete()
    .eq('source', 'stress_test')
    .eq('restaurant_id', TEST_RESTAURANT_ID);

  if (cleanError) {
    console.warn(`  ⚠️ Cleanup failed: ${cleanError.message}`);
    console.warn('  Manual cleanup: DELETE FROM orders WHERE source = \'stress_test\';');
  } else {
    console.log('  ✅ Cleanup done');
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

runStressTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
