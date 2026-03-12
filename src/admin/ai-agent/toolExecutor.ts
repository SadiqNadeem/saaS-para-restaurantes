// SECURITY: This module NEVER accepts restaurant_id from the AI response.
// restaurant_id and userId are ALWAYS injected from the authenticated session
// (AdminRestaurantContext + AuthContext), not from any AI-provided parameter.

import { supabase } from "../../lib/supabase";
import type { ToolName } from "./agentTools";

export type ToolResult = {
  success: boolean;
  result: unknown;
  error?: string;
};

// ── Date helpers ────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function periodDates(period: "today" | "week" | "month"): { from: string; to: string } {
  const now = new Date();
  const to = todayISO();
  if (period === "today") return { from: to, to };
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().split("T")[0], to };
  }
  const d = new Date(now);
  d.setDate(d.getDate() - 29);
  return { from: d.toISOString().split("T")[0], to };
}

// ── Main executor ───────────────────────────────────────────────────────────

export async function executeToolSecurely(
  toolName: ToolName,
  toolParams: Record<string, unknown>,
  restaurantId: string, // ALWAYS from AdminRestaurantContext — never from AI
  _userId: string // ALWAYS from AuthContext — never from AI
): Promise<ToolResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("No hay sesión activa. Por favor inicia sesión de nuevo.");
  }

  try {
    switch (toolName) {
      case "get_orders_today":
        return await getOrdersToday(restaurantId, toolParams);
      case "get_sales_summary":
        return await getSalesSummary(restaurantId, toolParams);
      case "get_top_products":
        return await getTopProducts(restaurantId, toolParams);
      case "get_menu_status":
        return await getMenuStatus(restaurantId);
      case "create_tables":
        return await createTables(restaurantId, toolParams);
      case "create_category":
        return await createCategory(restaurantId, toolParams);
      case "update_delivery_settings":
        return await updateDeliverySettings(restaurantId, toolParams);
      case "toggle_accepting_orders":
        return await toggleAcceptingOrders(restaurantId, toolParams);
      case "hide_product":
        return await hideProduct(restaurantId, toolParams);
      case "create_coupon":
        return await createCoupon(restaurantId, toolParams);
      case "delete_product":
        return await deleteProduct(restaurantId, toolParams);
      case "delete_category":
        return await deleteCategory(restaurantId, toolParams);
      case "update_product_prices":
        return await updateProductPrices(restaurantId, toolParams);
      case "delete_tables":
        return await deleteTables(restaurantId, toolParams);
      default:
        return { success: false, result: null, error: `Tool desconocida: ${String(toolName)}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, result: null, error: message };
  }
}

// ── READ TOOLS ──────────────────────────────────────────────────────────────

async function getOrdersToday(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const today = todayISO();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, status, total, order_type, created_at, payment_method")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  if (error) return { success: false, result: null, error: error.message };

  const list = orders ?? [];
  const total_orders = list.length;
  const total_revenue = list.reduce((sum, o) => sum + Number(o.total ?? 0), 0);

  const by_status: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  const by_hour: Record<number, number> = {};

  for (const o of list) {
    by_status[o.status] = (by_status[o.status] ?? 0) + 1;
    by_type[o.order_type] = (by_type[o.order_type] ?? 0) + 1;
    const hour = new Date(o.created_at).getHours();
    by_hour[hour] = (by_hour[hour] ?? 0) + 1;
  }

  const group_by = String(params.group_by ?? "status");
  const grouping =
    group_by === "hour" ? by_hour : group_by === "type" ? by_type : by_status;

  return {
    success: true,
    result: {
      total_orders,
      total_revenue: Math.round(total_revenue * 100) / 100,
      pending: by_status["pending"] ?? 0,
      by_status,
      by_type,
      grouping_key: group_by,
      grouping
    }
  };
}

async function getSalesSummary(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const period = (params.period as "today" | "week" | "month") ?? "today";
  const { from, to } = periodDates(period);

  const { data, error } = await supabase
    .from("orders")
    .select("total, order_type, payment_method, created_at")
    .eq("restaurant_id", restaurantId)
    .neq("status", "cancelled")
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59`);

  if (error) return { success: false, result: null, error: error.message };

  const list = data ?? [];
  const total_orders = list.length;
  const total_revenue = list.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const avg_ticket = total_orders > 0 ? total_revenue / total_orders : 0;

  const by_type: Record<string, { count: number; revenue: number }> = {};
  for (const o of list) {
    const t = o.order_type ?? "unknown";
    if (!by_type[t]) by_type[t] = { count: 0, revenue: 0 };
    by_type[t].count += 1;
    by_type[t].revenue += Number(o.total ?? 0);
  }

  return {
    success: true,
    result: {
      period,
      from,
      to,
      total_orders,
      total_revenue: Math.round(total_revenue * 100) / 100,
      avg_ticket: Math.round(avg_ticket * 100) / 100,
      by_type
    }
  };
}

async function getTopProducts(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const period = (params.period as "today" | "week" | "month") ?? "week";
  const limit = Math.min(Number(params.limit ?? 5), 10);
  const { from, to } = periodDates(period);

  // Use the view if period is not today, otherwise query directly
  const { data, error } = await supabase.rpc("admin_top_products_range", {
    p_restaurant_id: restaurantId,
    p_from: from,
    p_to: to,
    p_limit: limit
  });

  if (error) {
    // Fallback: manual query
    const { data: items, error: err2 } = await supabase
      .from("order_items")
      .select("snapshot_name, qty, line_total, orders!inner(restaurant_id, created_at, status)")
      .eq("orders.restaurant_id", restaurantId)
      .neq("orders.status", "cancelled")
      .gte("orders.created_at", `${from}T00:00:00`)
      .lte("orders.created_at", `${to}T23:59:59`);

    if (err2) return { success: false, result: null, error: err2.message };

    const agg: Record<string, { qty: number; revenue: number }> = {};
    for (const item of items ?? []) {
      const name = item.snapshot_name ?? "Producto";
      if (!agg[name]) agg[name] = { qty: 0, revenue: 0 };
      agg[name].qty += Number(item.qty ?? 1);
      agg[name].revenue += Number(item.line_total ?? 0);
    }
    const top = Object.entries(agg)
      .map(([name, v]) => ({ product_name: name, total_quantity: v.qty, total_revenue: Math.round(v.revenue * 100) / 100 }))
      .sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, limit);

    return { success: true, result: { period, top_products: top } };
  }

  return {
    success: true,
    result: { period, top_products: data ?? [] }
  };
}

async function getMenuStatus(restaurantId: string): Promise<ToolResult> {
  const [{ data: categories, error: catErr }, { data: products, error: prodErr }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name, is_active, sort_order")
        .eq("restaurant_id", restaurantId)
        .order("sort_order"),
      supabase
        .from("products")
        .select("id, name, price, is_active, category_id")
        .eq("restaurant_id", restaurantId)
    ]);

  if (catErr) return { success: false, result: null, error: catErr.message };
  if (prodErr) return { success: false, result: null, error: prodErr.message };

  const cats = categories ?? [];
  const prods = products ?? [];

  const summary = cats.map((cat) => {
    const catProducts = prods.filter((p) => p.category_id === cat.id);
    return {
      id: cat.id,
      name: cat.name,
      is_active: cat.is_active,
      total_products: catProducts.length,
      active_products: catProducts.filter((p) => p.is_active).length,
      inactive_products: catProducts.filter((p) => !p.is_active).length,
      avg_price:
        catProducts.length > 0
          ? Math.round((catProducts.reduce((s, p) => s + Number(p.price ?? 0), 0) / catProducts.length) * 100) / 100
          : 0
    };
  });

  const uncategorized = prods.filter((p) => !p.category_id);

  return {
    success: true,
    result: {
      total_categories: cats.length,
      active_categories: cats.filter((c) => c.is_active).length,
      total_products: prods.length,
      active_products: prods.filter((p) => p.is_active).length,
      inactive_products: prods.filter((p) => !p.is_active).length,
      uncategorized_products: uncategorized.length,
      categories: summary
    }
  };
}

// ── ACTION TOOLS ────────────────────────────────────────────────────────────

async function createTables(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const count = Math.min(Math.max(1, Number(params.count ?? 1)), 20);
  const zone = String(params.zone ?? "Sala");
  const prefix = String(params.prefix ?? "Mesa");

  // Get current max position
  const { data: existing } = await supabase
    .from("restaurant_tables")
    .select("position, name")
    .eq("restaurant_id", restaurantId)
    .order("position", { ascending: false })
    .limit(1);

  const startPos = (existing?.[0]?.position ?? 0) + 1;

  // Get existing names to avoid duplicates
  const { data: allNames } = await supabase
    .from("restaurant_tables")
    .select("name")
    .eq("restaurant_id", restaurantId);

  const existingNames = new Set((allNames ?? []).map((t) => t.name));

  const rows: { restaurant_id: string; name: string; zone: string; position: number; is_active: boolean }[] = [];
  let nameCounter = 1;

  for (let i = 0; i < count; i++) {
    let name: string;
    do {
      name = `${prefix} ${nameCounter}`;
      nameCounter++;
    } while (existingNames.has(name));
    existingNames.add(name);
    rows.push({ restaurant_id: restaurantId, name, zone, position: startPos + i, is_active: true });
  }

  const { data, error } = await supabase
    .from("restaurant_tables")
    .insert(rows)
    .select("id, name, zone");

  if (error) return { success: false, result: null, error: error.message };

  return {
    success: true,
    result: { created: (data ?? []).length, tables: data ?? [] }
  };
}

async function createCategory(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const name = String(params.name ?? "").trim();
  if (!name || name.length < 2) {
    return { success: false, result: null, error: "El nombre debe tener al menos 2 caracteres" };
  }

  // Get next sort_order
  const { data: existing } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const sort_order = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("categories")
    .insert({ restaurant_id: restaurantId, name, sort_order, is_active: true })
    .select("id, name, sort_order")
    .single();

  if (error) return { success: false, result: null, error: error.message };
  return { success: true, result: { created: true, category: data } };
}

async function updateDeliverySettings(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const updates: Record<string, unknown> = {};

  if (params.delivery_radius_km !== undefined)
    updates.delivery_radius_km = Math.max(0, Number(params.delivery_radius_km));
  if (params.delivery_fee !== undefined)
    updates.delivery_fee = Math.max(0, Number(params.delivery_fee));
  if (params.minimum_order !== undefined)
    updates.min_order_amount = Math.max(0, Number(params.minimum_order));

  if (Object.keys(updates).length === 0) {
    return { success: false, result: null, error: "No se especificó ningún cambio" };
  }

  const { data, error } = await supabase
    .from("restaurant_settings")
    .update(updates)
    .eq("restaurant_id", restaurantId)
    .select("delivery_radius_km, delivery_fee, min_order_amount, is_accepting_orders")
    .single();

  if (error) return { success: false, result: null, error: error.message };
  return { success: true, result: { updated: true, settings: data } };
}

async function toggleAcceptingOrders(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const accepting = Boolean(params.accepting);

  const { data, error } = await supabase
    .from("restaurant_settings")
    .update({ is_accepting_orders: accepting })
    .eq("restaurant_id", restaurantId)
    .select("is_accepting_orders")
    .single();

  if (error) return { success: false, result: null, error: error.message };
  return {
    success: true,
    result: {
      is_accepting_orders: data?.is_accepting_orders ?? accepting,
      message: accepting
        ? "El restaurante está ahora aceptando pedidos"
        : "El restaurante ha dejado de aceptar pedidos"
    }
  };
}

async function hideProduct(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const product_name = String(params.product_name ?? "").trim();
  if (!product_name) return { success: false, result: null, error: "Nombre de producto requerido" };

  const { data: found, error: findErr } = await supabase
    .from("products")
    .select("id, name, is_active")
    .eq("restaurant_id", restaurantId)
    .ilike("name", `%${product_name}%`)
    .limit(1)
    .single();

  if (findErr || !found) {
    return { success: false, result: null, error: `Producto no encontrado: ${product_name}` };
  }

  if (!found.is_active) {
    return { success: true, result: { hidden: false, already_hidden: true, product: { id: found.id, name: found.name } } };
  }

  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", found.id)
    .eq("restaurant_id", restaurantId);

  if (error) return { success: false, result: null, error: error.message };
  return { success: true, result: { hidden: true, product: { id: found.id, name: found.name } } };
}

async function createCoupon(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const code = String(params.code ?? "").trim().toUpperCase();
  const discount_type = String(params.discount_type ?? "percent");
  const discount_value = Number(params.discount_value ?? 0);
  const min_order_amount = params.min_order_amount !== undefined ? Number(params.min_order_amount) : null;

  if (!code) return { success: false, result: null, error: "Código de cupón requerido" };
  if (!["percent", "fixed"].includes(discount_type)) {
    return { success: false, result: null, error: "discount_type debe ser 'percent' o 'fixed'" };
  }
  if (discount_value <= 0) {
    return { success: false, result: null, error: "El valor del descuento debe ser mayor que 0" };
  }

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      restaurant_id: restaurantId,
      code,
      discount_type,
      discount_value,
      min_order_amount,
      is_active: true
    })
    .select("id, code, discount_type, discount_value, min_order_amount")
    .single();

  if (error) return { success: false, result: null, error: error.message };
  return { success: true, result: { created: true, coupon: data } };
}

// ── CONFIRMATION-REQUIRED TOOLS ─────────────────────────────────────────────

async function deleteProduct(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const product_name = String(params.product_name ?? "").trim();

  const { data: found, error: findErr } = await supabase
    .from("products")
    .select("id, name")
    .eq("restaurant_id", restaurantId)
    .ilike("name", `%${product_name}%`)
    .limit(1)
    .single();

  if (findErr || !found) {
    return { success: false, result: null, error: `Producto no encontrado: ${product_name}` };
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", found.id)
    .eq("restaurant_id", restaurantId);

  if (error) return { success: false, result: null, error: error.message };
  return { success: true, result: { deleted: true, product_name: found.name } };
}

async function deleteCategory(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const category_name = String(params.category_name ?? "").trim();

  const { data: found, error: findErr } = await supabase
    .from("categories")
    .select("id, name")
    .eq("restaurant_id", restaurantId)
    .ilike("name", `%${category_name}%`)
    .limit(1)
    .single();

  if (findErr || !found) {
    return { success: false, result: null, error: `Categoría no encontrada: ${category_name}` };
  }

  const { count: productCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", found.id)
    .eq("restaurant_id", restaurantId);

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", found.id)
    .eq("restaurant_id", restaurantId);

  if (error) return { success: false, result: null, error: error.message };
  return {
    success: true,
    result: { deleted: true, category_name: found.name, products_deleted: productCount ?? 0 }
  };
}

async function updateProductPrices(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const change_type = String(params.change_type ?? "");
  const value = Number(params.value ?? 0);
  const product_name = String(params.product_name ?? "").trim();

  if (value <= 0) {
    return { success: false, result: null, error: "El valor debe ser mayor que 0" };
  }

  let products: { id: string; name: string; price: number }[] = [];

  if (product_name === "all") {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, price")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true);

    if (error) return { success: false, result: null, error: error.message };
    products = (data ?? []) as typeof products;
  } else {
    const { data: found, error } = await supabase
      .from("products")
      .select("id, name, price")
      .eq("restaurant_id", restaurantId)
      .ilike("name", `%${product_name}%`)
      .limit(1)
      .single();

    if (error || !found) {
      return { success: false, result: null, error: `Producto no encontrado: ${product_name}` };
    }
    products = [found as { id: string; name: string; price: number }];
  }

  const changes: { name: string; old_price: number; new_price: number }[] = [];

  for (const p of products) {
    let new_price: number;
    const old_price = Number(p.price);

    if (change_type === "percent_increase") {
      new_price = Math.round(old_price * (1 + value / 100) * 100) / 100;
    } else if (change_type === "percent_decrease") {
      new_price = Math.round(old_price * (1 - value / 100) * 100) / 100;
    } else {
      new_price = Math.round(value * 100) / 100;
    }

    if (new_price < 0) new_price = 0;

    await supabase
      .from("products")
      .update({ price: new_price })
      .eq("id", p.id)
      .eq("restaurant_id", restaurantId);

    changes.push({ name: p.name, old_price, new_price });
  }

  return { success: true, result: { updated: changes.length, changes } };
}

async function deleteTables(
  restaurantId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const table_names = Array.isArray(params.table_names)
    ? (params.table_names as string[]).map(String)
    : [];

  if (table_names.length === 0) {
    return { success: false, result: null, error: "Lista de mesas vacía" };
  }

  const { error, count } = await supabase
    .from("restaurant_tables")
    .delete({ count: "exact" })
    .eq("restaurant_id", restaurantId)
    .in("name", table_names);

  if (error) return { success: false, result: null, error: error.message };
  return { success: true, result: { deleted: count ?? 0, table_names } };
}
