// AI Agent proxy — Edge Function
// Deploy: supabase functions deploy ai-agent
//
// Required secret (Supabase dashboard → Functions → Secrets):
//   OPENAI_API_KEY  → tu clave de OpenAI (la del SaaS, nunca se expone al cliente)
//
// La función verifica el JWT del usuario antes de reenviar a OpenAI.
// restaurant_id se verifica contra restaurant_members para evitar acceso cruzado.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Verificar autenticación ────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!bearerToken) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(bearerToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    });

    // ── 2. Parsear payload ────────────────────────────────────────────────────
    const body = await req.json() as {
      messages: unknown[];
      tools: unknown[];
      restaurant_id: string;
      max_tokens?: number;
    };

    const { messages, tools, restaurant_id, max_tokens = 1024 } = body;

    if (!restaurant_id || !messages || !tools) {
      return new Response(JSON.stringify({ error: "Payload inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Verificar que el usuario pertenece al restaurante ──────────────────
    const { data: member, error: memberError } = await supabase
      .from("restaurant_members")
      .select("role")
      .eq("restaurant_id", restaurant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    // Superadmin bypass: si no es member, comprobar si es superadmin
    if (!member || memberError) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role !== "superadmin") {
        return new Response(JSON.stringify({ error: "Sin acceso a este restaurante" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── 4. Llamar a OpenAI ────────────────────────────────────────────────────
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: "OpenAI no configurado en el servidor" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        tools,
        tool_choice: "auto",
        max_tokens,
      }),
    });

    if (!openAiResponse.ok) {
      const err = await openAiResponse.text();
      return new Response(JSON.stringify({ error: `Error de OpenAI: ${err}` }), {
        status: openAiResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await openAiResponse.json();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
