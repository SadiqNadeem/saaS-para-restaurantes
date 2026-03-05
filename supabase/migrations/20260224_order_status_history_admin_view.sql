-- =========================================
-- LOGS: view para auditoria admin
-- =========================================
drop view if exists public.v_order_status_history_admin;

create view public.v_order_status_history_admin as
select
  h.id,
  h.restaurant_id,
  h.order_id,
  h.old_status,
  h.new_status,
  h.changed_by,
  h.changed_at,
  o.customer_name,
  o.customer_phone,
  o.total,
  o.order_type
from public.order_status_history h
left join public.orders o on o.id = h.order_id;

-- =========================================
-- LOGS: indexes para filtros rapidos
-- =========================================
create index if not exists idx_osh_restaurant_changed_at
  on public.order_status_history(restaurant_id, changed_at desc);

create index if not exists idx_osh_order_id_changed_at
  on public.order_status_history(order_id, changed_at desc);
