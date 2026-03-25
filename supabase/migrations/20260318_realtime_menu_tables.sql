-- Enable Supabase Realtime on menu-related tables
-- so TableMenuPage can subscribe to live updates without polling.

ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.modifier_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.modifier_options;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_modifier_groups;
