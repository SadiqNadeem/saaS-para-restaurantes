// ─── Option B: WhatsApp Business API (prepared, not active) ──────────────────
// Providers: Twilio, 360dialog, Meta Cloud API.
// This service is READY but disabled until whatsapp_provider !== 'link'.
// API keys are NEVER stored in the frontend — they live in the edge function.

export interface WhatsAppAPIConfig {
  provider: "twilio" | "360dialog";
  /** Edge function base URL (e.g. https://<project>.supabase.co/functions/v1) */
  edgeFunctionBase: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a WhatsApp message via the server-side edge function.
 * The edge function holds API credentials — never expose keys in the frontend.
 *
 * NOTE: This function is intentionally NOT called anywhere while
 * whatsapp_provider === 'link'. Activate by wiring it in AdminOrdersPage
 * or a backend trigger once the edge function is deployed.
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string,
  config: WhatsAppAPIConfig
): Promise<WhatsAppSendResult> {
  try {
    const response = await fetch(
      `${config.edgeFunctionBase}/whatsapp-send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, message, provider: config.provider }),
      }
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return { success: false, error: body.error ?? `HTTP ${response.status}` };
    }

    const body = (await response.json()) as {
      success?: boolean;
      messageId?: string;
      error?: string;
    };
    return {
      success: body.success === true,
      messageId: body.messageId,
      error: body.error,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
