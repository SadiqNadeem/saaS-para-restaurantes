# Admin Panel — Sidebar Architecture

## How sidebar items are controlled

All sidebar items are defined in `sidebarConfig.ts`. `AdminLayout.tsx` reads that config,
filters by the current user's `access_role`, and renders the result.

**Adding a new sidebar item = one entry in `sidebarConfig.ts`.** No scattered conditionals.

---

## What is GLOBAL (applies to all restaurants automatically)

- Code changes: new pages, UI updates, bug fixes
- Sidebar items defined in `sidebarConfig.ts`
- New features become visible to all restaurants once deployed

## What depends on DATA (per restaurant)

| Data | Effect |
|------|--------|
| `restaurant_members.access_role` | Controls which sidebar items the user sees |
| `restaurant_settings.*` | Delivery, hours, payments, etc. |
| Plans/subscriptions (future) | Feature gates via `requiredFeature` in sidebarConfig |

---

## `requiredRole` rules

| Value | Who sees the item |
|-------|------------------|
| `null` / omitted | Everyone (staff, admin, owner) |
| `"admin"` | `admin` and `owner` |
| `"owner"` | `owner` only |

These map to `access_role` in `restaurant_members`, set by `AdminGate`.

---

## Current sidebar structure

### Global (all roles)
- Dashboard, Pedidos, Caja, Mesas

### Admin+ groups
- **Menú**: Categorías, Productos, Modificadores, Importar menú, Ver QR
- **Ventas**: Métricas, Logs
- **Marketing**: Cupones, Fidelización, Reseñas, Carritos, WhatsApp

### Bottom section
- **Ajustes** — admin+
- **Personalizar web** — admin+
- **Equipo y roles** — owner only

---

## When you add a new feature

1. Create the page component and add the route in `src/main.tsx`
2. Add an entry to `SIDEBAR_ITEMS` in `sidebarConfig.ts` with the correct `requiredRole`
3. If it needs a new group, add it to `SIDEBAR_GROUPS` too
4. If a new DB column is needed: write a migration + backfill for existing rows
5. Deploy → all restaurants pick it up automatically

---

## Backfill pattern for new columns

Always set a safe DEFAULT and UPDATE existing rows in the same migration:

```sql
ALTER TABLE restaurant_members ADD COLUMN new_col text NOT NULL DEFAULT 'default_value';

-- Backfill existing rows to the correct value
UPDATE restaurant_members
SET new_col = CASE WHEN role = 'owner' THEN 'owner_value' ELSE 'other_value' END
WHERE new_col = 'default_value';
```

This ensures no row is left with a wrong default after a column is added later.

---

## Known data state (as of 2026-03-08)

| Restaurant | Owner members | Admin members |
|-----------|--------------|--------------|
| Default Restaurant | 2 | 2 |
| kebab americanooaea | 1 | 0 |
| Restaurante A | **0** | 2 |
| Restaurante B | **0** | 2 |
| Test2 | **0** | 2 |

Restaurante A, B, and Test2 have **no owner member**. Nobody in those restaurants sees
"Equipo y roles". To fix: promote one admin to owner via:

```sql
UPDATE restaurant_members
SET access_role = 'owner', role = 'owner'
WHERE restaurant_id = '<restaurant_id>'
  AND user_id = (
    SELECT user_id FROM restaurant_members
    WHERE restaurant_id = '<restaurant_id>'
    ORDER BY created_at ASC
    LIMIT 1
  );
```
