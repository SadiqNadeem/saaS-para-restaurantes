-- ── Support Ticket System ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('pedidos','impresion','menu','delivery','pagos','mesas','otro')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  screenshot_url text,
  browser_info text,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  is_staff boolean NOT NULL DEFAULT false,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Restaurant members can manage their own tickets
CREATE POLICY "members manage own tickets" ON public.support_tickets FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE restaurant_id = support_tickets.restaurant_id
    AND user_id = auth.uid()
  )
);

-- Superadmin can see all tickets
CREATE POLICY "superadmin all tickets" ON public.support_tickets FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
);

-- Ticket messages: accessible by restaurant members or superadmin
CREATE POLICY "ticket messages access" ON public.support_ticket_messages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets st
    JOIN public.restaurant_members rm ON rm.restaurant_id = st.restaurant_id
    WHERE st.id = support_ticket_messages.ticket_id
    AND rm.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'
  )
);

-- Index for fast tenant-scoped queries
CREATE INDEX IF NOT EXISTS support_tickets_restaurant_id_idx ON public.support_tickets(restaurant_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_id_idx ON public.support_ticket_messages(ticket_id);
