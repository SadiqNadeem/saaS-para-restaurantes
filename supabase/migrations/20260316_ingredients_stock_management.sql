-- ============================================================
-- Gestión de ingredientes para stock/administración
-- Los ingredientes existentes (con group_id) son para el
-- storefront (opciones de modificadores con price_delta).
-- Los nuevos ingredientes (group_id IS NULL) son a nivel de
-- restaurante para gestión de stock interna.
-- ============================================================

-- 1. Hacer group_id nullable para permitir ingredientes de nivel restaurante
ALTER TABLE ingredients
  ALTER COLUMN group_id DROP NOT NULL;

-- 2. Añadir campo de disponibilidad de stock
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

-- 3. Tabla bridge: relación directa producto ↔ ingrediente de stock
CREATE TABLE IF NOT EXISTS product_ingredients (
  product_id   uuid NOT NULL REFERENCES products(id)     ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id)  ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id)  ON DELETE CASCADE,
  PRIMARY KEY (product_id, ingredient_id)
);

-- 4. RLS en product_ingredients
ALTER TABLE product_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pi_read" ON product_ingredients
  FOR SELECT TO authenticated
  USING (is_restaurant_member(restaurant_id));

CREATE POLICY "pi_write" ON product_ingredients
  FOR ALL TO authenticated
  USING (is_restaurant_admin(restaurant_id))
  WITH CHECK (is_restaurant_admin(restaurant_id));

-- 5. Índice para consultas por producto o por ingrediente
CREATE INDEX IF NOT EXISTS product_ingredients_product_id_idx    ON product_ingredients (product_id);
CREATE INDEX IF NOT EXISTS product_ingredients_ingredient_id_idx ON product_ingredients (ingredient_id);

-- 6. Índice en ingredients para filtrar los de stock (group_id IS NULL)
CREATE INDEX IF NOT EXISTS ingredients_restaurant_stock_idx
  ON ingredients (restaurant_id)
  WHERE group_id IS NULL;
