// agentService.ts
// La clave de OpenAI vive en el servidor (Supabase Edge Function "ai-agent").
// El frontend NUNCA toca la key â€” solo llama a la Edge Function con el JWT del usuario.

import { supabase } from "../../lib/supabase";
import { AGENT_TOOLS, TOOLS_REQUIRING_CONFIRMATION } from "./agentTools";
import type { ToolName } from "./agentTools";
import { executeToolSecurely } from "./toolExecutor";
import { validateToolParams, incrementRateLimit } from "./agentSecurity";

// â”€â”€ Tipos mÃ­nimos del response de OpenAI (sin importar el SDK) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type OAIMessage = {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
};

type OAIChoice = { message: OAIMessage };
type OAIResponse = { choices: OAIChoice[] };

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: null; tool_calls: OAIMessage["tool_calls"] }
  | { role: "tool"; tool_call_id: string; content: string };

// â”€â”€ Llamada a la Edge Function â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function callEdgeFunction(
  messages: ChatMessage[],
  restaurantId: string,
  maxTokens = 1024
): Promise<OAIResponse> {
  const accessToken = await getValidAccessToken();
  const firstAttempt = await invokeAgentWithToken(messages, restaurantId, maxTokens, accessToken);

  if (!firstAttempt.error) {
    if (!firstAttempt.data) throw new Error("Respuesta vacia del servidor");
    if (import.meta.env.DEV) {
      console.info("[ai-agent] response ok", { restaurantId });
    }
    return firstAttempt.data;
  }

  const firstDetails = await extractInvokeErrorDetails(firstAttempt.error);
  const firstCombined = `${firstAttempt.error.message ?? ""} ${firstDetails}`.toLowerCase();
  const unauthorized = isUnauthorizedError(firstCombined);
  const forbidden = isForbiddenError(firstCombined);

  if (import.meta.env.DEV) {
    console.error("[ai-agent] invoke error", {
      message: firstAttempt.error.message,
      details: firstDetails,
      unauthorized,
      forbidden,
      restaurantId,
      phase: "first_attempt",
    });
  }

  if (unauthorized) {
    if (import.meta.env.DEV) {
      console.warn("[ai-agent] 401/expired token, retrying with refreshSession");
    }
    const refreshedToken = await getValidAccessToken(true);
    const retry = await invokeAgentWithToken(messages, restaurantId, maxTokens, refreshedToken);
    if (!retry.error) {
      if (!retry.data) throw new Error("Respuesta vacia del servidor");
      if (import.meta.env.DEV) {
        console.info("[ai-agent] response ok after token refresh", { restaurantId });
      }
      return retry.data;
    }

    const retryDetails = await extractInvokeErrorDetails(retry.error);
    const retryCombined = `${retry.error.message ?? ""} ${retryDetails}`.toLowerCase();
    if (import.meta.env.DEV) {
      console.error("[ai-agent] invoke error", {
        message: retry.error.message,
        details: retryDetails,
        unauthorized: isUnauthorizedError(retryCombined),
        forbidden: isForbiddenError(retryCombined),
        restaurantId,
        phase: "retry_after_refresh",
      });
    }

    if (isUnauthorizedError(retryCombined)) {
      throw new Error("Tu sesión no es válida o ha expirado. Inicia sesión de nuevo.");
    }

    if (isForbiddenError(retryCombined)) {
      throw new Error("No tienes permisos para usar el asistente en este restaurante.");
    }

    throw new Error("El asistente no esta disponible en este momento. Intentalo de nuevo.");
  }

  if (forbidden) {
    throw new Error("No tienes permisos para usar el asistente en este restaurante.");
  }

  throw new Error("El asistente no esta disponible en este momento. Intentalo de nuevo.");
}

async function invokeAgentWithToken(
  messages: ChatMessage[],
  restaurantId: string,
  maxTokens: number,
  accessToken: string
) {
  supabase.functions.setAuth(accessToken);
  return supabase.functions.invoke<OAIResponse>("ai-agent", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: { messages, tools: AGENT_TOOLS, restaurant_id: restaurantId, max_tokens: maxTokens },
  });
}

function isUnauthorizedError(combinedError: string): boolean {
  return (
    combinedError.includes("401") ||
    combinedError.includes("no autorizado") ||
    combinedError.includes("unauthorized") ||
    combinedError.includes("invalid jwt") ||
    combinedError.includes("jwt expired")
  );
}

function isForbiddenError(combinedError: string): boolean {
  return combinedError.includes("403") || combinedError.includes("sin acceso") || combinedError.includes("forbidden");
}

async function getValidAccessToken(forceRefresh = false): Promise<string> {
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();
  let token = currentSession?.access_token?.trim() ?? "";

  if (import.meta.env.DEV) {
    console.info("[ai-agent] session before send", {
      hasSession: Boolean(currentSession),
      hasToken: Boolean(token),
      userId: currentSession?.user?.id ?? null,
      expiresAt: currentSession?.expires_at ?? null,
      forceRefresh,
    });
  }

  if (forceRefresh || !token) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError && import.meta.env.DEV) {
      console.error("[ai-agent] refreshSession failed", { reason: forceRefresh ? "forced" : "missing_token", refreshError });
    }
    token = refreshed.session?.access_token?.trim() ?? "";
  }

  if (!token) {
    throw new Error("Tu sesión ha expirado. Vuelve a iniciar sesión.");
  }

  const { error: userError } = await supabase.auth.getUser(token);
  if (!userError) {
    return token;
  }

  const msg = (userError.message ?? "").toLowerCase();
  const isJwtProblem = msg.includes("jwt") || msg.includes("token") || msg.includes("expired");
  if (!isJwtProblem) {
    return token;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError && import.meta.env.DEV) {
    console.error("[ai-agent] refreshSession failed (jwt invalid)", refreshError);
  }

  const refreshedToken = refreshed.session?.access_token?.trim() ?? "";
  if (!refreshedToken) {
    throw new Error("Tu sesión ha expirado. Vuelve a iniciar sesión.");
  }

  const { error: refreshedUserError } = await supabase.auth.getUser(refreshedToken);
  if (refreshedUserError) {
    if (import.meta.env.DEV) console.error("[ai-agent] getUser failed after refresh", refreshedUserError);
    throw new Error("Tu sesión ha expirado. Vuelve a iniciar sesión.");
  }

  return refreshedToken;
}

async function extractInvokeErrorDetails(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (!(context instanceof Response)) {
    return "";
  }

  try {
    const text = await context.text();
    return sanitizeErrorText(text);
  } catch {
    return "";
  }
}

function sanitizeErrorText(raw: string): string {
  return String(raw ?? "")
    .replace(/`r`n/g, " ")
    .replace(/\\`r\\`n/g, " ")
    .replace(/\\r\\n/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// â”€â”€ Tipos pÃºblicos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentResponse = {
  message: string;
  toolCalled?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: unknown;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  pendingExecution?: () => Promise<AgentResponse>;
};

export type RestaurantContext = {
  name: string;
  slug: string;
  productsCount: number;
  tablesCount: number;
  isAcceptingOrders: boolean;
};

// â”€â”€ System prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildSystemPrompt(ctx: RestaurantContext): string {
  return `Eres el Asistente IA de ${ctx.name}, un restaurante que usa nuestro SaaS de gestiÃ³n.

Tu trabajo es ayudar al propietario/admin a:
1. Consultar informaciÃ³n de su negocio (pedidos, ventas, menÃº)
2. Ejecutar acciones de gestiÃ³n de forma segura

CONTEXTO DEL RESTAURANTE:
- Nombre: ${ctx.name}
- Slug: ${ctx.slug}
- Productos activos: ${ctx.productsCount}
- Mesas configuradas: ${ctx.tablesCount}
- Aceptando pedidos ahora: ${ctx.isAcceptingOrders ? "SÃ­" : "No"}

REGLAS CRÃTICAS:
- Solo puedes actuar sobre ESTE restaurante (${ctx.name})
- Responde SIEMPRE en espaÃ±ol, de forma concisa y prÃ¡ctica
- Antes de ejecutar una acciÃ³n, explica brevemente quÃ© vas a hacer
- DespuÃ©s de ejecutar, confirma quÃ© se hizo con los datos del resultado
- Si no entiendes una peticiÃ³n, pide aclaraciÃ³n

PARA ACCIONES DESTRUCTIVAS (delete_product, delete_category, delete_tables, update_product_prices):
- Indica claramente quÃ© vas a hacer y sus consecuencias
- Espera confirmaciÃ³n explÃ­cita del usuario antes de llamar la herramienta
- Solo ejecuta la herramienta cuando el usuario confirme con "sÃ­", "confirmar", "adelante" o similar

Para cualquier otra acciÃ³n segura, ejecÃºtala directamente sin pedir confirmaciÃ³n.`;
}

// â”€â”€ Logger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function logInteraction(
  restaurantId: string,
  userId: string,
  userMessage: string,
  aiResponse: string,
  toolCalled?: string,
  toolParams?: Record<string, unknown>,
  toolResult?: unknown,
  executionStatus?: "success" | "failed" | "cancelled" | "pending_confirmation",
  requiredConfirmation?: boolean,
  confirmationGiven?: boolean,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from("ai_agent_logs").insert({
      restaurant_id: restaurantId,
      user_id: userId,
      user_message: userMessage,
      ai_response: aiResponse,
      tool_called: toolCalled ?? null,
      tool_params: toolParams ?? null,
      tool_result: toolResult ?? null,
      required_confirmation: requiredConfirmation ?? false,
      confirmation_given: confirmationGiven ?? null,
      execution_status: executionStatus ?? null,
      error_message: errorMessage ?? null
    });
  } catch {
    // non-fatal
  }
}

// â”€â”€ runAgent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function runAgent(
  userMessage: string,
  conversationHistory: AgentMessage[],
  restaurantId: string,
  userId: string,
  restaurantContext: RestaurantContext
): Promise<AgentResponse> {
  incrementRateLimit(restaurantId);

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(restaurantContext) },
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage }
  ];

  const response = await callEdgeFunction(messages, restaurantId);

  const choice = response.choices[0];
  if (!choice) return { message: "No obtuve respuesta del asistente. Intenta de nuevo." };

  const msg = choice.message;

  // â”€â”€ Respuesta de texto (sin tool call) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    const text = msg.content ?? "No tengo respuesta para eso.";
    void logInteraction(restaurantId, userId, userMessage, text, undefined, undefined, undefined, undefined, false);
    return { message: text };
  }

  // â”€â”€ Tool call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const toolCall = msg.tool_calls[0];
  const toolName = toolCall.function.name as ToolName;
  let toolParams: Record<string, unknown> = {};

  try {
    toolParams = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    return { message: "Error al parsear los parÃ¡metros de la herramienta." };
  }

  // Validar y sanitizar
  const validation = validateToolParams(toolName, toolParams);
  if (!validation.valid) {
    const errMsg = `No puedo ejecutar esa acciÃ³n: ${validation.error ?? "parÃ¡metros invÃ¡lidos"}`;
    void logInteraction(restaurantId, userId, userMessage, errMsg, toolName, toolParams, null, "failed", false, undefined, validation.error);
    return { message: errMsg };
  }

  const sanitizedParams = validation.sanitized;

  // â”€â”€ Requiere confirmaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (TOOLS_REQUIRING_CONFIRMATION.has(toolName)) {
    const confirmMsg = buildConfirmationMessage(toolName, sanitizedParams);
    const aiText = msg.content ?? confirmMsg;

    void logInteraction(restaurantId, userId, userMessage, aiText, toolName, sanitizedParams, null, "pending_confirmation", true);

    const pendingExecution = async (): Promise<AgentResponse> => {
      const result = await executeToolSecurely(toolName, sanitizedParams, restaurantId, userId);
      const resultMessage = buildResultMessage(toolName, result.result, result.success, result.error);

      void logInteraction(restaurantId, userId, "[CONFIRMED] " + userMessage, resultMessage, toolName, sanitizedParams, result.result, result.success ? "success" : "failed", true, true, result.error);

      return { message: resultMessage, toolCalled: toolName, toolParams: sanitizedParams, toolResult: result.result };
    };

    return {
      message: aiText || confirmMsg,
      toolCalled: toolName,
      toolParams: sanitizedParams,
      requiresConfirmation: true,
      confirmationMessage: confirmMsg,
      pendingExecution
    };
  }

  // â”€â”€ AcciÃ³n segura: ejecutar inmediatamente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const result = await executeToolSecurely(toolName, sanitizedParams, restaurantId, userId);
  const resultMessage = buildResultMessage(toolName, result.result, result.success, result.error);

  // Follow-up: pedir a la IA que narre el resultado en lenguaje natural
  // Solo si la herramienta tuvo éxito — si falló, el error concreto debe llegar al usuario sin modificar
  let finalMessage = resultMessage;
  if (result.success) {
    try {
      const followUpMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: null, tool_calls: [toolCall] },
        { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result.result) }
      ];
      const followUp = await callEdgeFunction(followUpMessages, restaurantId, 512);
      finalMessage = followUp.choices[0]?.message?.content ?? resultMessage;
    } catch {
      // Si falla el follow-up, usamos el mensaje generado localmente
    }
  }

  void logInteraction(restaurantId, userId, userMessage, finalMessage, toolName, sanitizedParams, result.result, result.success ? "success" : "failed", false, undefined, result.error);

  return { message: finalMessage, toolCalled: toolName, toolParams: sanitizedParams, toolResult: result.result };
}

// â”€â”€ Helpers de mensajes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildConfirmationMessage(toolName: ToolName, params: Record<string, unknown>): string {
  switch (toolName) {
    case "delete_product":
      return `Â¿Confirmas que quieres ELIMINAR el producto "${params.product_name}"? Esta acciÃ³n no se puede deshacer.`;
    case "delete_category":
      return `Â¿Confirmas que quieres ELIMINAR la categorÃ­a "${params.category_name}" y todos sus productos? Esta acciÃ³n no se puede deshacer.`;
    case "delete_tables":
      return `Â¿Confirmas que quieres ELIMINAR las mesas: ${(params.table_names as string[]).join(", ")}? Esta acciÃ³n no se puede deshacer.`;
    case "update_product_prices": {
      const target = params.product_name === "all" ? "todos los productos" : `"${params.product_name}"`;
      const typeLabel =
        params.change_type === "percent_increase" ? `subir un ${params.value}%` :
        params.change_type === "percent_decrease" ? `bajar un ${params.value}%` :
        `establecer precio a ${params.value}â‚¬`;
      return `Â¿Confirmas que quieres ${typeLabel} en ${target}?`;
    }
    default:
      return `Â¿Confirmas esta acciÃ³n?`;
  }
}

function buildResultMessage(toolName: ToolName, result: unknown, success: boolean, error?: string): string {
  if (!success) return `Error: ${error ?? "No se pudo completar la acciÃ³n"}`;

  const r = result as Record<string, unknown>;

  switch (toolName) {
    case "get_orders_today": {
      const pending = r.pending ?? 0;
      return ` Pedidos de hoy: ${r.total_orders} pedidos, ${r.total_revenue}â‚¬ de ingresos${Number(pending) > 0 ? `, ${pending} pendientes` : ""}.`;
    }
    case "get_sales_summary": {
      const period = String(r.period ?? "");
      const label = period === "today" ? "hoy" : period === "week" ? "esta semana" : "este mes";
      return ` Ventas ${label}: ${r.total_orders} pedidos, ${r.total_revenue}â‚¬ en ingresos, ticket medio ${r.avg_ticket}â‚¬.`;
    }
    case "get_top_products": {
      const tops = r.top_products as Array<{ product_name: string; total_quantity: number }>;
      if (!tops?.length) return "No hay datos de productos vendidos en ese perÃ­odo.";
      return ` Top productos: ${tops.slice(0, 5).map((p, i) => `${i + 1}. ${p.product_name} (${p.total_quantity} uds)`).join(", ")}`;
    }
    case "get_menu_status":
      return ` MenÃº: ${r.total_categories} categorÃ­as, ${r.active_products} productos activos de ${r.total_products} totales.`;
    case "create_tables": {
      const tables = r.tables as Array<{ name: string }>;
      return ` Creadas ${r.created} mesas: ${(tables ?? []).map((t) => t.name).join(", ")}.`;
    }
    case "create_category":
      return ` CategorÃ­a "${(r.category as Record<string, unknown>)?.name}" creada correctamente.`;
    case "update_delivery_settings":
      return ` ConfiguraciÃ³n de delivery actualizada.`;
    case "toggle_accepting_orders":
      return ` ${r.message}`;
    case "hide_product": {
      if (r.already_hidden) return ` El producto "${(r.product as Record<string, unknown>)?.name}" ya estaba oculto.`;
      return ` Producto "${(r.product as Record<string, unknown>)?.name}" ocultado del menÃº pÃºblico.`;
    }
    case "create_coupon":
      return ` CupÃ³n "${(r.coupon as Record<string, unknown>)?.code}" creado correctamente.`;
    case "delete_product":
      return ` Producto "${r.product_name}" eliminado.`;
    case "delete_category":
      return ` CategorÃ­a "${r.category_name}" eliminada (${r.products_deleted} productos eliminados).`;
    case "update_product_prices": {
      const changes = r.changes as Array<{ name: string; old_price: number; new_price: number }>;
      if ((r.updated as number) === 1 && changes?.[0]) {
        const c = changes[0];
        return ` Precio de "${c.name}" actualizado: ${c.old_price}â‚¬ â†’ ${c.new_price}â‚¬.`;
      }
      return ` Precios actualizados en ${r.updated} productos.`;
    }
    case "delete_tables":
      return ` ${r.deleted} mesas eliminadas.`;
    default:
      return ` AcciÃ³n completada.`;
  }
}
