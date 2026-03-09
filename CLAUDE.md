# CLAUDE.md — Kebab SaaS V1

> Este archivo se carga automáticamente al inicio de cada sesión de Claude Code.
> Mantenerlo conciso y actualizado cuando cambie la base de código.

---

## 1. Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript 5.9 + Vite 7 |
| Routing | React Router v7 |
| Estado global | Zustand v5 (solo checkout) |
| Backend/DB | Supabase (PostgreSQL 17 + PostgREST + Auth + Storage) |
| Validación | Zod v4 |
| Gráficos | Recharts v3 |
| Drag & Drop | @dnd-kit (reordenamiento de productos/categorías) |
| Iconos | lucide-react |
| Pagos | Stripe (flujo `card_online`) |

**Comandos:**
```bash
npm run dev      # http://localhost:5173 (host 0.0.0.0, port 5173)
npm run build    # tsc -b && vite build
npx tsc --noEmit # type-check sin compilar
```

**Supabase:**
- Project ID: `ewxarutpvgelwdswjolz`
- URL: `https://ewxarutpvgelwdswjolz.supabase.co`
- Región: eu-west-1
- Anon key hardcodeada en `src/lib/supabase.ts` (deuda técnica, debería ser env var)

**Acceso directo a Supabase (Management API):**
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/ewxarutpvgelwdswjolz/database/query" \
  -H "Authorization: Bearer sbp_a0ba96f60525f84e0903c069f1be42d227e367bd" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT 1"}'
```

---

## 2. Arquitectura multi-tenant

### Resolución del restaurante

Toda página pertenece a un restaurante. La lógica está en `src/restaurant/getRestaurantSlug.ts`:

1. **Subdominio** (`mirestaurante.platform.com`) → `slug = "mirestaurante"`, `usesSubdomain = true`
2. **Path** (`platform.com/r/mirestaurante`) → `slug = "mirestaurante"`, `usesSubdomain = false`
3. **Localhost** → `slug = "default"` (fallback hardcodeado)

Subdominios reservados que NO se tratan como slugs: `www`, `app`, `admin`.

### URLs por modo

| Módulo | Subdomain | Path |
|--------|-----------|------|
| Storefront | `/` | `/r/:slug` |
| Admin | `/admin` | `/r/:slug/admin` |
| POS/TPV | `/pos` | `/r/:slug/pos` |
| Superadmin | `/superadmin` | `/superadmin` (siempre) |

`RestaurantContext` expone `menuPath` y `adminPath` que resuelven correctamente ambos modos.
**Siempre usar estas propiedades, nunca hardcodear rutas.**

### Árbol de providers (simplificado)

```
AuthProvider
  AdminRestaurantProvider       ← qué restaurante ve el admin
    BrowserRouter
      RestaurantProvider        ← resuelve restaurante para la ruta actual
        RequireAuth             ← redirige a /login si no hay sesión
          AdminGate             ← verifica restaurant_members y establece rol
            AdminMembershipProvider
              AdminLayout       ← sidebar + topbar + <Outlet />
                <página>
```

### Aislamiento de datos por tenant

- **Todas** las tablas multi-tenant tienen `restaurant_id uuid`.
- Toda query DEBE incluir `.eq("restaurant_id", restaurantId)`.
- Obtener `restaurantId` de `useRestaurant()`.
- RLS refuerza esto a nivel BD, pero el filtro a nivel app es siempre obligatorio.

```ts
const { restaurantId } = useRestaurant();
const { data } = await supabase
  .from("products")
  .select("...")
  .eq("restaurant_id", restaurantId); // ← SIEMPRE
```

---

## 3. Estructura de carpetas

```
src/
├── App.tsx                        # Storefront: menú, carrito, checkout
├── main.tsx                       # Todas las rutas y árbol de providers
├── index.css                      # CSS custom properties (design tokens)
│
├── lib/
│   ├── supabase.ts                # createClient (anon key hardcodeada)
│   └── images/
│       ├── prepareImageWebp.ts    # Convierte File → WebP Blob
│       └── uploadProductImage.ts  # Sube blob a Supabase Storage
│
├── auth/
│   ├── AuthContext.tsx            # useAuth → { session, loading }
│   └── RequireAuth.tsx            # Redirige a /login si no hay sesión
│
├── restaurant/
│   ├── RestaurantContext.tsx      # useRestaurant → { restaurantId, slug, name,
│   │                              #   menuPath, adminPath, isSuperadmin, ... }
│   └── getRestaurantSlug.ts       # Lógica de resolución de slug
│
├── admin/
│   ├── AdminLayout.tsx            # Layout ACTIVO: sidebar colapsable + topbar
│   ├── components/
│   │   ├── AdminGate.tsx          # Verifica restaurant_members, establece rol
│   │   ├── AdminLayout.tsx        # ⚠ MUERTO — no importado desde ningún sitio
│   │   ├── AdminMembershipContext.tsx  # role, canManage
│   │   └── SupabaseError.tsx
│   ├── context/
│   │   └── AdminRestaurantContext.tsx  # Restaurante activo para superadmin
│   └── pages/
│       ├── AdminDashboardPage.tsx      # KPIs del día, últimos pedidos, gráfico horario
│       ├── AdminMetricsPage.tsx        # Métricas: selector de rango, 4 gráficos, 2 tablas
│       ├── AdminOrdersPage.tsx         # Lista de pedidos + gestión de estado
│       ├── AdminOrderDetailPage.tsx    # Pedido individual con items y historial
│       ├── AdminPosPage.tsx            # Enlace/redirección al TPV
│       ├── AdminCategoriesPage.tsx     # CRUD categorías + drag-to-reorder
│       ├── AdminProductsPage.tsx       # CRUD productos + reorder + asignación modifiers
│       ├── AdminProductModifiersPage.tsx  # Bridge producto↔modifier groups
│       ├── AdminModifiersPage.tsx      # CRUD modifier groups + opciones
│       ├── AdminSettingsPage.tsx       # Settings completos (ver sección 4)
│       └── AdminLogsPage.tsx           # Auditoría (v_order_status_history_admin)
│
├── superadmin/
│   ├── SuperAdminLayout.tsx
│   ├── components/SuperAdminGate.tsx  # Verifica profiles.role = 'superadmin'
│   └── pages/
│       ├── SuperAdminRestaurantsPage.tsx  # CRUD restaurantes + custom domain
│       ├── SuperAdminMembersPage.tsx      # Asignación de staff entre restaurantes
│       ├── SuperAdminMetricsPage.tsx      # Métricas cross-tenant
│       └── SuperAdminLogsPage.tsx         # Logs cross-tenant
│
├── pos/
│   ├── PosLayout.tsx
│   ├── components/
│   │   ├── PosGate.tsx            # Verifica membresía para TPV
│   │   └── PosModifierModal.tsx
│   └── pages/
│       ├── PosCajaPage.tsx        # Gestión de caja (cierre de caja)
│       └── PosOrdersPage.tsx      # Pedidos en TPV
│
├── features/
│   ├── checkout/
│   │   ├── checkoutStore.ts        # Zustand: step, draft, clientOrderKey
│   │   ├── checkoutValidation.ts   # canProceed, validateAddress, validateDetails
│   │   ├── types.ts                # CheckoutDraft, CheckoutStep, CartItem, etc.
│   │   ├── services/orderService.ts # createOrderFromCheckout → create_order_safe_v2
│   │   └── ui/
│   │       ├── CheckoutPage.tsx     # Orquesta pasos
│   │       ├── StripeCheckoutReturnPage.tsx
│   │       └── steps/
│   │           ├── StepCustomer.tsx, StepType.tsx, StepDelivery.tsx
│   │           ├── StepPayment.tsx, StepReview.tsx
│   └── admin/pages/
│       └── AdminOrderDetailPage.tsx  # Versión ACTIVA del detalle de pedido
│
├── constants/
│   └── orderStatus.ts             # OrderStatus type, ALL_ORDER_STATUSES, isOrderStatus()
│
└── pages/
    ├── Login.tsx
    ├── Register.tsx               # Registro de nuevo restaurante
    └── Onboarding.tsx             # Onboarding post-registro (requiere sesión)
```

---

## 4. Módulos principales

### Admin panel (`/admin` o `/r/:slug/admin`)

Gate: `AdminGate.tsx` lee `restaurant_members.role`.

| Ruta | Página |
|------|--------|
| `/admin` o `/admin/dashboard` | `AdminDashboardPage` — KPIs del día |
| `/admin/metrics` | `AdminMetricsPage` — gráficos y tablas |
| `/admin/orders` | `AdminOrdersPage` — lista + cambio de estado |
| `/admin/orders/:id` | `AdminOrderDetailPage` |
| `/admin/categories` | `AdminCategoriesPage` — CRUD + DnD |
| `/admin/products` | `AdminProductsPage` — CRUD + DnD |
| `/admin/products/:id/modifiers` | `AdminProductModifiersPage` |
| `/admin/modifiers` | `AdminModifiersPage` |
| `/admin/settings` | `AdminSettingsPage` |
| `/admin/logs` | `AdminLogsPage` |
| `/admin/pos` | `AdminPosPage` |

**`AdminSettingsPage` secciones:**
1. Estado del restaurante (toggle inmediato → `is_accepting_orders`)
2. Información general (nombre → `restaurants.name`, dirección → `restaurant_settings.restaurant_address`)
3. Reparto (radio slider, modo fijo/distancia, gastos, envío gratis, pedido mínimo)
4. Métodos de pago (efectivo, tarjeta en puerta, Stripe)
5. Horario de apertura (Lun-Dom, toggle + horas, "Copiar a todos")
6. Zona de reparto (base_lat, base_lng + enlace a OpenStreetMap)

### Superadmin panel (`/superadmin`)

Gate: `SuperAdminGate.tsx` — llama `is_superadmin()` RPC, fallback a `profiles.role`.
Si no es superadmin → redirect a `/login`.

### POS / TPV (`/pos` o `/r/:slug/pos`)

Gate: `PosGate.tsx` — sin sesión redirige a `/login?next=...`.
Roles permitidos: `owner`, `admin`, `staff`.

### Storefront (`/` o `/r/:slug`)

Acceso público (anon). Lógica en `App.tsx`.
El checkout está dentro del carrito lateral (no es ruta separada).
Detecta apertura del restaurante via `restaurant_hours` + `is_accepting_orders`.

### Onboarding (`/register` + `/onboarding`)

Un trigger de Supabase (`20260228_onboarding_trigger.sql`) crea automáticamente una fila en `profiles` al registrarse cualquier usuario.

---

## 5. Base de datos — tablas principales

### Core

| Tabla | Columnas clave | Propósito |
|-------|---------------|-----------|
| `restaurants` | `id`, `name`, `slug` (unique), `delivery_radius_m`, `custom_domain` | Un row por tenant |
| `categories` | `id`, `restaurant_id`, `name`, `sort_order`, `is_active` | Secciones del menú |
| `products` | `id`, `restaurant_id`, `category_id`, `name`, `price`, `description`, `image_url`, `sort_order`, `is_active` | Items del menú |
| `modifier_groups` | `id`, `restaurant_id`, `name`, `min_select`, `max_select`, `is_active`, `position` | Grupos de opciones |
| `modifier_options` | `id`, `restaurant_id`, `group_id`, `name`, `price`, `is_active`, `position` | Opciones individuales |
| `product_modifier_groups` | `product_id`, `group_id`, `sort_order`, `position` | Bridge producto↔grupo |

### Pedidos

| Tabla | Columnas clave | Propósito |
|-------|---------------|-----------|
| `orders` | `id`, `restaurant_id`, `status`, `total`, `subtotal`, `delivery_fee`, `customer_name`, `customer_phone`, `order_type` (`pickup`/`delivery`), `payment_method`, `source` (`web`/`pos`), `cash_given`, `cash_change`, `delivery_address`, `cancel_reason`, `archived`, `printed_at`, `print_count` | Un row por pedido |
| `order_items` | `id`, `restaurant_id`, `order_id`, `product_id`, `qty`, `base_price`, `line_total`, `extras_total`, `snapshot_name`, `final_unit_price` | Líneas de pedido |
| `order_item_modifier_options` | `id`, `order_item_id`, `option_id`, `option_name`, `price` | Opciones elegidas |
| `order_item_ingredients` | `id`, `order_item_id`, `ingredient_id`, `name_snapshot`, `price_snapshot` | Ingredientes elegidos |
| `order_status_history` | `id`, `restaurant_id`, `order_id`, `old_status`, `new_status`, `changed_by`, `changed_at` | Auditoría de estados |

**Flujo de estado:** `pending` → `accepted` → `preparing` → `ready` → `out_for_delivery` → `delivered`. Cualquier estado puede ir a `cancelled`.

### Settings y acceso

| Tabla | Columnas clave | Propósito |
|-------|---------------|-----------|
| `restaurant_settings` | `restaurant_id`, `is_accepting_orders`, `allow_cash`, `allow_card`, `allow_card_on_delivery`, `allow_card_online`, `delivery_radius_km`, `delivery_fee_mode` (`fixed`/`distance`), `delivery_fee`, `delivery_fee_fixed`, `delivery_fee_base`, `delivery_fee_per_km`, `delivery_fee_min`, `delivery_fee_max`, `free_delivery_over`, `min_order_amount`, `base_lat`, `base_lng`, `restaurant_address`, `business_phone`, `timezone` | Configuración del restaurante |
| `restaurant_hours` | `restaurant_id`, `day_of_week` (0=Dom–6=Sáb), `is_open`, `open_time`, `close_time` | Horario de apertura |
| `restaurant_members` | `user_id`, `restaurant_id`, `role` (`owner`/`admin`/`staff`) | Control de acceso al admin |
| `profiles` | `id` (= auth.users.id), `role` (`superadmin`/`customer`), `email` | Datos extendidos de usuario |
| `cash_closings` | `restaurant_id`, `day`, `counted_cash`, `counted_card`, `notes` | Cierres de caja del TPV |

### Vistas disponibles

| Vista | Columnas | Uso |
|-------|---------|-----|
| `v_orders_admin` | `id, restaurant_id, status, order_type, total, payment_method, customer_name, customer_phone, archived` | Lista pedidos admin |
| `v_order_status_history_admin` | `id, restaurant_id, order_id, old_status, new_status, changed_by, changed_at, customer_name, customer_phone, total, order_type` | Logs de auditoría |
| `v_admin_order_detail` | `id, status, items_json, subtotal, delivery_fee, total, ...` | Detalle de pedido |
| `v_admin_today_summary` | `restaurant_id, total_orders, total_revenue, total_cash, total_card, pending_count` | KPIs del día |
| `v_admin_sales_metrics` | `day, orders_count, total_revenue, avg_ticket` | Métricas por día |
| `v_admin_top_products` | `product_name, total_quantity, total_revenue` | Top productos |
| `v_admin_hourly_distribution` | `hour, orders_count` | Distribución horaria |
| `v_daily_sales` | `restaurant_id, day, total_orders, total_revenue, total_cash, total_card` | Ventas diarias por tenant |
| `v_daily_top_products` | `restaurant_id, day, product_name, total_qty, total_amount` | Top productos por día y tenant |
| `v_admin_pending_orders` | `id, restaurant_id, status, order_type, total, customer_*` | Pedidos activos (pending/accepted/preparing) |
| `v_orders_export_admin` | Todos los campos de orders | Exportación |
| `v_order_items_export_admin` | Items con datos de la orden | Exportación de líneas |

---

## 6. RPCs de Supabase

### Creación de pedidos

| RPC | Descripción |
|-----|-------------|
| `create_order_safe_v2(p_restaurant_id, p_client_order_key, p_payment_method, p_order_type, p_delivery_fee, p_cash_given, p_customer_name, p_customer_phone, p_delivery_address, p_notes, p_items jsonb, p_source DEFAULT 'web')` | **Principal.** Idempotente via `client_order_key`. Devuelve `order_id` uuid. Usada por `orderService.ts`. |
| `create_order_secure(p_payload jsonb)` | Versión antigua con payload jsonb único. |

### Gestión de pedidos (admin)

| RPC | Descripción |
|-----|-------------|
| `admin_update_order_status(p_restaurant_id, p_order_id, p_new_status, p_cancel_reason DEFAULT NULL)` | Actualiza estado + escribe en `order_status_history`. Soporta motivo de cancelación. |
| `set_order_status_safe(p_order_id, p_status)` | Versión simplificada sin `p_restaurant_id`. |
| `admin_delete_order(p_restaurant_id, p_order_id)` | Elimina un pedido. |
| `admin_close_cash(p_restaurant_id, p_day, p_counted_cash, p_counted_card DEFAULT 0, p_notes DEFAULT NULL)` | Cierra caja del día → `cash_closings`. |

### Reordenamiento (admin)

| RPC | Descripción |
|-----|-------------|
| `admin_reorder_categories(p_restaurant_id, p_category_ids uuid[])` | Actualiza `sort_order` de categorías en bulk. |
| `admin_reorder_products(p_restaurant_id, p_category_id, p_product_ids uuid[])` | Actualiza `sort_order` de productos en una categoría. |
| `admin_reorder_modifier_groups(p_restaurant_id, p_group_ids uuid[])` | Actualiza `position` de modifier groups. |
| `admin_reorder_modifier_options(p_restaurant_id, p_group_id, p_option_ids uuid[])` | Actualiza `position` de opciones dentro de un grupo. |

### Métricas y permisos

| RPC | Descripción |
|-----|-------------|
| `admin_sales_summary_range(p_restaurant_id, p_from date, p_to date)` | Resumen ventas para rango de fechas. |
| `admin_top_products_range(p_restaurant_id, p_from date, p_to date, p_limit DEFAULT 20)` | Top productos para rango. |
| `is_superadmin()` | Bool: usuario actual es superadmin. |
| `is_admin()` | Bool: usuario es admin. |
| `is_restaurant_member(_restaurant_id)` | Bool: pertenece al restaurante. |
| `is_restaurant_admin(_restaurant_id)` | Bool: es admin del restaurante. |
| `is_restaurant_open_now(p_restaurant_id)` | Bool: restaurante está abierto ahora. |

---

## 7. Roles y permisos

| Rol | Fuente | `canManage` | Acceso |
|-----|--------|-------------|--------|
| `superadmin` | `profiles.role = 'superadmin'` | sí | Todos los restaurantes + `/superadmin` |
| `owner` | `restaurant_members.role` | sí | CRUD completo en su restaurante |
| `admin` | `restaurant_members.role` | sí | Igual que owner |
| `staff` | `restaurant_members.role` | **no** | Solo lectura |

`canManage = role === 'owner' || role === 'admin'` — viene de `useAdminMembership()`.
Todos los botones de escritura usan `disabled={!canManage || isBusy}`.

### AdminGate — flujo de verificación

1. `isSuperadmin` → asigna rol `owner` sin consultar `restaurant_members`.
2. Sino → lee `restaurant_members.role` para el restaurante actual.
3. Error RLS (código `42501`) → muestra diagnóstico `rls`.
4. Sin membership → `gateStatus = 'forbidden'`, muestra 403.

### SuperAdminGate — flujo

1. Llama `is_superadmin()` RPC (preferido).
2. Fallback: lee `profiles.role = 'superadmin'`.
3. Si no → `<Navigate to="/login" />`.

### PosGate — flujo

1. Sin sesión → redirige a `/login?next=<ruta>`.
2. Superadmin → acceso directo.
3. Sino → verifica `restaurant_members.role` IN (`owner`, `admin`, `staff`).

---

## 8. Convenciones importantes

### Ordenamiento: `sort_order` vs `position`

- **Categorías y productos**: `sort_order` (int). RPCs: `admin_reorder_categories`, `admin_reorder_products`.
- **Modifier groups y options**: `position` (int). RPCs: `admin_reorder_modifier_groups`, `admin_reorder_modifier_options`.

### CSS design tokens (`src/index.css`)

```css
--brand-primary: #4ec580;
--brand-hover: #2e8b57;
--brand-white: #ffffff;
--brand-primary-soft: rgba(78, 197, 128, 0.14);
--brand-primary-border: rgba(78, 197, 128, 0.45);

--admin-content-bg: #f8fafc;    --admin-card-bg: #ffffff;
--admin-card-border: #e5e7eb;   --admin-card-shadow: 0 1px 3px rgba(0,0,0,0.06);
--admin-radius-sm: 8px;         --admin-radius-md: 12px;  --admin-radius-lg: 16px;
--admin-text-primary: #111827;  --admin-text-secondary: #6b7280;  --admin-text-muted: #9ca3af;

/* Status chips — variables completas para todos los estados */
--status-pending-bg/color       /* Amarillo */
--status-accepted-bg/color      /* Azul */
--status-preparing-bg/color     /* Naranja */
--status-ready-bg/color         /* Violeta */
--status-out-for-delivery-bg/color  /* Índigo */  ← slug usa guión, no guión bajo
--status-delivered-bg/color     /* Verde */
--status-cancelled-bg/color     /* Rojo */
```

```ts
// Usar status chips con CSS vars:
const slug = status.replace(/_/g, "-"); // out_for_delivery → out-for-delivery
// background: `var(--status-${slug}-bg)`
```

Las páginas admin usan `className="admin-panel"` para headings en color neutro.

### Añadir una nueva página al admin

1. Crear `src/admin/pages/AdminXxxPage.tsx`
2. Importar en `src/main.tsx`
3. Añadir `<Route path="xxx" element={<AdminXxxPage />} />` en **ambos** grupos de rutas (`/admin` y `/r/:slug/admin`)
4. Añadir entrada al array `navItems` en `src/admin/AdminLayout.tsx`
5. Usar `useRestaurant()` para `restaurantId`, `useAdminMembership()` para `canManage`

### Patrón optimista con rollback

```ts
const previous = items;
setItems(/* optimista */);
const { error } = await supabase.from(...).update(...);
if (error) { setItems(previous); pushToast("error", error.message); }
```

### Idempotencia del checkout

`clientOrderKey` en `localStorage` (`checkout_client_order_key`). Si el mismo key existe para el restaurante dentro de 5 min, la BD devuelve el `order_id` existente.

### Añadir tabla con RLS correcto

```sql
CREATE TABLE public.mi_tabla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.mi_tabla ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read" ON public.mi_tabla FOR SELECT TO authenticated
  USING (is_restaurant_member(restaurant_id));
CREATE POLICY "admins_write" ON public.mi_tabla FOR ALL TO authenticated
  USING (is_restaurant_admin(restaurant_id)) WITH CHECK (is_restaurant_admin(restaurant_id));
```

---

## 9. Migraciones aplicadas

| Archivo | Qué hace |
|---------|---------|
| `20260221_multirestaurant_phase9a.sql` | Crea tabla `restaurants` y estructura multi-tenant base |
| `20260221_products_is_active.sql` | Añade `is_active` a `products` + índice |
| `20260221_sort_order_categories_products.sql` | Añade `sort_order` a `categories` y `products` |
| `20260221_orders_status_created_at_idx.sql` | Índice en `orders(status, created_at desc)` |
| `20260221_orders_print_tracking.sql` | Añade `printed_at`, `print_count` a `orders` |
| `20260221_stripe_checkout_phase7a.sql` | Añade `payment_provider`, `payment_method` a `orders` |
| `20260221_addresses_building_fields.sql` | Añade campos de edificio (`portal`, `floor`, `door`...) a `addresses` |
| `20260221_create_order_secure_rpc.sql` | Crea RPC `create_order_secure(jsonb)` |
| `20260222_orders_delivery_address_required_check.sql` | Constraint: dirección obligatoria si `order_type = 'delivery'` |
| `20260222_create_order_secure_jsonb_payload.sql` | Añade `delivery_lat`, `delivery_lng` a `orders` |
| `20260224_order_status_history_admin_view.sql` | Crea vista `v_order_status_history_admin` |
| `20260228_profiles_add_email.sql` | Añade `email` a `profiles` + backfill desde `auth.users` |
| `20260228_restaurants_custom_domain.sql` | Añade `custom_domain` (unique) a `restaurants` |
| `20260228_orders_source.sql` | Añade `source text DEFAULT 'web'` a `orders` + índice |
| `20260228_create_order_safe_v2_source.sql` | Añade parámetro `p_source` a `create_order_safe_v2` |
| `20260228_onboarding_trigger.sql` | Trigger que crea `profiles` automáticamente en signup |
| `20260301_restaurant_members_select_policy.sql` | Habilita RLS en `restaurant_members` + política SELECT |

---

## 10. Estado actual y pendientes

### Completado ✅

- Multi-tenant completo (subdomain + path, resolución automática)
- Admin panel con todas las secciones: dashboard, métricas, pedidos, menú, modificadores, settings, logs
- Settings redesign: toggle inmediato de aceptar pedidos, info general, delivery (slider + modos), pagos (3 toggles), horario (L-D con copiar-a-todos), zona GPS
- Logs page: bug `phone` corregido, chips de colores, filtros con labels, paginación 25/página, skeleton loading
- Superadmin: gestión de restaurantes + custom domain, miembros, métricas y logs cross-tenant
- POS/TPV: PosCajaPage (cierre de caja), PosOrdersPage
- Checkout 5 pasos: cliente, tipo, dirección (Nominatim + radio), pago, resumen
- Storefront: menú + carrito lateral + modal modificadores + detección apertura
- Gates de acceso: AdminGate, SuperAdminGate, PosGate
- Trigger de onboarding: crea `profiles` automáticamente al registrarse
- Reordenamiento DnD de categorías y productos
- Upload de imágenes WebP a Supabase Storage
- Stripe: sesión de checkout + página de retorno

### Bugs conocidos 🐛

- **`AdminGate` debug UI en producción** — `<span>Rol: {membershipRole}</span>` visible a usuarios (línea ~129 de `src/admin/components/AdminGate.tsx`)
- **`AdminGate` doble padding** — envuelve hijos en `<div style={{ padding: 16 }}>` que añade padding extra (AdminLayout ya gestiona su propio spacing)
- **`src/admin/components/AdminLayout.tsx` archivo muerto** — no se importa desde ningún sitio; el layout activo es `src/admin/AdminLayout.tsx`

### Pendientes ⚠️

- Eliminar los bugs de `AdminGate` mencionados arriba
- Eliminar `src/admin/components/AdminLayout.tsx`
- Crear migración DDL para `create_order_safe_v2` (el RPC existe en BD pero no hay archivo `.sql`)
- Diseño responsive del storefront (`App.tsx` no tiene media queries)
- Verificar y completar flujo de retorno de Stripe (`StripeCheckoutReturnPage`)
- Integrar tabla `addresses` con el flujo de pedidos (actualmente las direcciones van inline en `orders`)
- Implementar UI para: `customers`, `reviews`, `campaigns`, `ingredients` (tablas existen en BD)
- Mover anon key a `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- Añadir tests (zero cobertura actualmente)
