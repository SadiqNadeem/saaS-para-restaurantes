-- ============================================================
-- Migration: WhatsApp Chatbot Settings
-- Phase 1: Schema + Phase 2: RLS/Security
-- ============================================================
-- Tables created:
--   whatsapp_bot_settings  – one row per restaurant (tokens, on/off)
--   whatsapp_bot_messages  – one row per (restaurant, message_key)
--   whatsapp_bot_keywords  – many rows per restaurant (keyword → message_key)
-- RPCs created:
--   initialize_whatsapp_bot_defaults(p_restaurant_id)  – seed default content
--   get_whatsapp_bot_config(p_phone)                   – edge-function resolver
-- ============================================================


-- ── Shared updated_at helper ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ── 1. whatsapp_bot_settings ─────────────────────────────────────────────────
-- One row per restaurant.
-- Contains the bot on/off toggle and sensitive API credentials.
-- RLS: admins only (tokens must not be exposed to staff or anon).

CREATE TABLE public.whatsapp_bot_settings (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id        uuid        NOT NULL
                                   REFERENCES public.restaurants(id) ON DELETE CASCADE,
  is_bot_enabled       boolean     NOT NULL DEFAULT false,
  -- Phone to redirect to for human handoff (E.164, e.g. +34612345678)
  handoff_phone        text,
  -- Meta Cloud API / Business API token (written here by admin, read by edge function)
  api_token            text,
  -- Meta webhook verification token
  webhook_verify_token text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_bot_settings_restaurant_id_key UNIQUE (restaurant_id)
);

CREATE TRIGGER whatsapp_bot_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_bot_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. whatsapp_bot_messages ─────────────────────────────────────────────────
-- One row per (restaurant, message_key).
-- message_key uses CHECK instead of ENUM so Phase 5 (AI intents) can extend it
-- with a simple ALTER TABLE … ADD VALUE equivalent (just update the constraint).
--
-- Supported template variables for body:
--   {restaurant_name}  {hours}  {menu_url}  {address}

CREATE TABLE public.whatsapp_bot_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid        NOT NULL
                            REFERENCES public.restaurants(id) ON DELETE CASCADE,
  message_key   text        NOT NULL,
  body          text        NOT NULL DEFAULT '',
  is_active     boolean     NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_bot_messages_valid_key CHECK (
    message_key IN (
      'welcome',        -- First message when customer contacts
      'out_of_hours',   -- Bot is closed
      'menu',           -- Send menu link/text
      'location',       -- Send address/map
      'human_handoff',  -- Escalate to a human
      'fallback'        -- Unknown intent
    )
  ),
  CONSTRAINT whatsapp_bot_messages_unique_key UNIQUE (restaurant_id, message_key)
);

CREATE INDEX whatsapp_bot_messages_restaurant_idx
  ON public.whatsapp_bot_messages (restaurant_id);

CREATE TRIGGER whatsapp_bot_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_bot_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. whatsapp_bot_keywords ─────────────────────────────────────────────────
-- Each row maps one keyword (matched case-insensitively) to a message_key.
-- UNIQUE(restaurant_id, keyword): a keyword can only trigger one response
-- per restaurant, preventing ambiguity.

CREATE TABLE public.whatsapp_bot_keywords (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid        NOT NULL
                            REFERENCES public.restaurants(id) ON DELETE CASCADE,
  message_key   text        NOT NULL,
  keyword       text        NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_bot_keywords_valid_key CHECK (
    message_key IN (
      'welcome', 'out_of_hours', 'menu', 'location', 'human_handoff', 'fallback'
    )
  ),
  -- One keyword can only map to one message per restaurant
  CONSTRAINT whatsapp_bot_keywords_unique UNIQUE (restaurant_id, keyword)
);

CREATE INDEX whatsapp_bot_keywords_restaurant_idx
  ON public.whatsapp_bot_keywords (restaurant_id);

-- Case-insensitive lookup index used by get_whatsapp_bot_config()
CREATE INDEX whatsapp_bot_keywords_lower_idx
  ON public.whatsapp_bot_keywords (restaurant_id, lower(keyword));


-- ── RLS: whatsapp_bot_settings ────────────────────────────────────────────────
-- Admin-only: this table contains api_token and webhook_verify_token.
-- Staff (canManage=false) cannot read or write.
-- The edge function reads via service_role (bypasses RLS).

ALTER TABLE public.whatsapp_bot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_bot_settings"
  ON public.whatsapp_bot_settings
  FOR ALL TO authenticated
  USING     (is_restaurant_admin(restaurant_id))
  WITH CHECK (is_restaurant_admin(restaurant_id));


-- ── RLS: whatsapp_bot_messages ────────────────────────────────────────────────
-- All restaurant members can read (staff needs to preview messages).
-- Only admins can insert/update/delete.

ALTER TABLE public.whatsapp_bot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_bot_messages"
  ON public.whatsapp_bot_messages
  FOR SELECT TO authenticated
  USING (is_restaurant_member(restaurant_id));

CREATE POLICY "admins_write_bot_messages"
  ON public.whatsapp_bot_messages
  FOR ALL TO authenticated
  USING     (is_restaurant_admin(restaurant_id))
  WITH CHECK (is_restaurant_admin(restaurant_id));


-- ── RLS: whatsapp_bot_keywords ────────────────────────────────────────────────
-- Same split: members read, admins write.

ALTER TABLE public.whatsapp_bot_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_bot_keywords"
  ON public.whatsapp_bot_keywords
  FOR SELECT TO authenticated
  USING (is_restaurant_member(restaurant_id));

CREATE POLICY "admins_write_bot_keywords"
  ON public.whatsapp_bot_keywords
  FOR ALL TO authenticated
  USING     (is_restaurant_admin(restaurant_id))
  WITH CHECK (is_restaurant_admin(restaurant_id));


-- ── RPC: initialize_whatsapp_bot_defaults ────────────────────────────────────
-- Seeds one settings row + 6 default messages + common keywords for a restaurant.
-- Safe to call multiple times (ON CONFLICT DO NOTHING).
-- Call this from the admin panel when an admin opens the WhatsApp settings
-- tab for the first time, or from the restaurant onboarding flow.

CREATE OR REPLACE FUNCTION public.initialize_whatsapp_bot_defaults(
  p_restaurant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Settings row (bot disabled by default)
  INSERT INTO public.whatsapp_bot_settings (restaurant_id)
  VALUES (p_restaurant_id)
  ON CONFLICT (restaurant_id) DO NOTHING;

  -- Default messages
  INSERT INTO public.whatsapp_bot_messages (restaurant_id, message_key, body)
  VALUES
    (p_restaurant_id, 'welcome',
      'Hola 👋 Bienvenido/a a *{restaurant_name}*!
¿En qué te puedo ayudar?

Escribe:
• *menú* — ver nuestra carta
• *ubicación* — dónde estamos
• *horario* — cuándo abrimos
• *ayuda* — hablar con alguien'),

    (p_restaurant_id, 'out_of_hours',
      'Hola 👋 Ahora mismo estamos cerrados 🕐
Nuestro horario es: {hours}

Puedes hacer tu pedido en: {menu_url}
¡Hasta pronto!'),

    (p_restaurant_id, 'menu',
      '🍽️ Aquí tienes nuestra carta completa:
{menu_url}

¿Tienes alguna pregunta sobre los platos? Escribe *ayuda*.'),

    (p_restaurant_id, 'location',
      '📍 Nos encontramos en:
{address}

Escribe *horario* para saber cuándo abrimos.'),

    (p_restaurant_id, 'human_handoff',
      'Claro, enseguida te pongo en contacto con alguien del equipo 🙏
Te llamarán a la brevedad posible.

También puedes llamarnos directamente.'),

    (p_restaurant_id, 'fallback',
      'No he entendido tu mensaje 😅

Prueba escribiendo:
• *menú* — ver la carta
• *ubicación* — dónde estamos
• *ayuda* — hablar con una persona')

  ON CONFLICT (restaurant_id, message_key) DO NOTHING;

  -- Default keywords
  INSERT INTO public.whatsapp_bot_keywords (restaurant_id, message_key, keyword)
  VALUES
    (p_restaurant_id, 'menu', 'menu'),
    (p_restaurant_id, 'menu', 'menú'),
    (p_restaurant_id, 'menu', 'carta'),
    (p_restaurant_id, 'menu', 'comida'),
    (p_restaurant_id, 'menu', 'ver menu'),
    (p_restaurant_id, 'location', 'ubicacion'),
    (p_restaurant_id, 'location', 'ubicación'),
    (p_restaurant_id, 'location', 'donde'),
    (p_restaurant_id, 'location', 'dónde'),
    (p_restaurant_id, 'location', 'direccion'),
    (p_restaurant_id, 'location', 'dirección'),
    (p_restaurant_id, 'location', 'sitio'),
    (p_restaurant_id, 'human_handoff', 'ayuda'),
    (p_restaurant_id, 'human_handoff', 'help'),
    (p_restaurant_id, 'human_handoff', 'humano'),
    (p_restaurant_id, 'human_handoff', 'persona'),
    (p_restaurant_id, 'human_handoff', 'hablar'),
    (p_restaurant_id, 'human_handoff', 'hablar con alguien'),
    (p_restaurant_id, 'human_handoff', 'agente')
  ON CONFLICT (restaurant_id, keyword) DO NOTHING;
END;
$$;

-- Any authenticated admin can call this (it checks nothing sensitive)
GRANT EXECUTE ON FUNCTION public.initialize_whatsapp_bot_defaults(uuid) TO authenticated;


-- ── RPC: get_whatsapp_bot_config ─────────────────────────────────────────────
-- Resolves full bot config for an inbound WhatsApp phone number.
-- Returns: restaurant_id, is_bot_enabled, handoff_phone,
--          messages{} (key→body map), keywords[] (keyword+message_key pairs)
--
-- SECURITY: Only callable by service_role (edge function).
-- Authenticated users and anon CANNOT call this — it would expose api_token.
-- The edge function uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.

CREATE OR REPLACE FUNCTION public.get_whatsapp_bot_config(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_restaurant_id uuid;
  v_result        jsonb;
BEGIN
  -- Resolve restaurant by its configured WhatsApp phone
  SELECT restaurant_id INTO v_restaurant_id
  FROM   public.restaurant_settings
  WHERE  whatsapp_phone = p_phone
  LIMIT  1;

  IF v_restaurant_id IS NULL THEN
    RETURN NULL; -- Unknown phone, edge function should ignore
  END IF;

  SELECT jsonb_build_object(
    'restaurant_id',  v_restaurant_id,
    'is_bot_enabled', COALESCE(wbs.is_bot_enabled, false),
    'handoff_phone',  wbs.handoff_phone,
    'api_token',      wbs.api_token,           -- Only readable via service_role
    'messages', (
      SELECT COALESCE(jsonb_object_agg(wbm.message_key, wbm.body), '{}'::jsonb)
      FROM   public.whatsapp_bot_messages wbm
      WHERE  wbm.restaurant_id = v_restaurant_id
        AND  wbm.is_active = true
    ),
    'keywords', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
          'keyword',     lower(wbk.keyword),
          'message_key', wbk.message_key
        )),
        '[]'::jsonb
      )
      FROM  public.whatsapp_bot_keywords wbk
      WHERE wbk.restaurant_id = v_restaurant_id
        AND wbk.is_active = true
    )
  )
  INTO v_result
  FROM  public.whatsapp_bot_settings wbs
  WHERE wbs.restaurant_id = v_restaurant_id;

  -- Restaurant has no settings row yet → return safe minimal object
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'restaurant_id',  v_restaurant_id,
      'is_bot_enabled', false,
      'handoff_phone',  null,
      'api_token',      null,
      'messages',       '{}'::jsonb,
      'keywords',       '[]'::jsonb
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Lock down: only service_role (edge function) may call this
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_bot_config(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_bot_config(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_bot_config(text) FROM anon;
