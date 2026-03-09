// ─── WhatsApp Send — Edge Function scaffold (Option B) ───────────────────────
// Deploy: supabase functions deploy whatsapp-send
//
// Required env vars (set in Supabase dashboard → Functions → Secrets):
//   TWILIO_ACCOUNT_SID    → your Twilio account SID
//   TWILIO_AUTH_TOKEN     → your Twilio auth token
//   TWILIO_WHATSAPP_FROM  → your Twilio WhatsApp sender (e.g. whatsapp:+14155238886)
//
// This function is intentionally NOT active until whatsapp_provider !== 'link'
// in restaurant_settings. It exists purely as an architecture scaffold.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, message, provider } = (await req.json()) as {
      to: string;
      message: string;
      provider: "twilio" | "360dialog";
    };

    if (!to || !message || !provider) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, message, provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Twilio ────────────────────────────────────────────────────────────────
    if (provider === "twilio") {
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const from = Deno.env.get("TWILIO_WHATSAPP_FROM");

      if (!accountSid || !authToken || !from) {
        return new Response(
          JSON.stringify({ error: "Twilio credentials not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const toFormatted = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

      const body = new URLSearchParams({
        To: toFormatted,
        From: from,
        Body: message,
      });

      const credentials = btoa(`${accountSid}:${authToken}`);
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        }
      );

      const twilioData = (await twilioRes.json()) as { sid?: string; error_message?: string };

      if (!twilioRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: twilioData.error_message ?? "Twilio error" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, messageId: twilioData.sid }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 360dialog (scaffold) ──────────────────────────────────────────────────
    if (provider === "360dialog") {
      // TODO: implement 360dialog API call
      // Env vars needed: DIALOG360_API_KEY, DIALOG360_PHONE_ID
      return new Response(
        JSON.stringify({ error: "360dialog provider not yet implemented" }),
        { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unsupported provider" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
