import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { useAuth } from "../../auth/AuthContext";
import { runAgent } from "../ai-agent/agentService";
import { getRateLimitStatus } from "../ai-agent/agentSecurity";
import type { AgentMessage, AgentResponse, RestaurantContext } from "../ai-agent/agentService";

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: any) => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

type ChatEntry =
  | { id: string; role: "user" | "assistant"; content: string; toolResult?: unknown; toolCalled?: string }
  | { id: string; role: "confirmation"; content: string; onConfirm: () => void; onCancel: () => void; pending: boolean };

type RecentLog = {
  id: string;
  tool_called: string | null;
  user_message: string;
  execution_status: string | null;
  created_at: string;
};

const SUGGESTIONS = {
  consultas: [
    "Cuantos pedidos tuve hoy?",
    "Cual es mi producto mas vendido esta semana?",
    "Resumen de ventas de este mes",
    "Como esta mi menu ahora mismo?",
  ],
  acciones: [
    "Abrir restaurante (aceptar pedidos)",
    "Cerrar restaurante",
    "Crear 5 mesas en sala",
    "Anadir una categoria \"Bebidas\"",
  ],
};

function toUiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "No se pudo conectar con el asistente.";
  const cleaned = String(raw)
    .replace(/`r`n/g, " ")
    .replace(/\\`r\\`n/g, " ")
    .replace(/\\r\\n/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = cleaned.toLowerCase();
  if (normalized.includes("invalid jwt") || normalized.includes("401") || normalized.includes("sesión ha expirado")) {
    return "Tu sesión ha expirado. Vuelve a iniciar sesión.";
  }
  return cleaned || "No se pudo completar la solicitud del asistente.";
}

function ResultCard({ toolResult, toolCalled }: { toolResult: unknown; toolCalled?: string }) {
  if (!toolResult || typeof toolResult !== "object") return null;
  const r = toolResult as Record<string, unknown>;

  if (toolCalled === "get_orders_today") {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "10px 12px",
          background: "#f8fafc",
          borderRadius: 10,
          border: "1px solid var(--admin-card-border, #e5e7eb)",
          fontSize: 13,
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ fontWeight: 700, color: "var(--admin-text-primary, #0f172a)" }}>Pedidos de hoy</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>
            Total: <strong>{String(r.total_orders ?? 0)}</strong>
          </span>
          <span>
            Ingresos: <strong>{String(r.total_revenue ?? 0)} EUR</strong>
          </span>
          {Number(r.pending ?? 0) > 0 && (
            <span style={{ color: "#b45309" }}>
              Pendientes: <strong>{String(r.pending)}</strong>
            </span>
          )}
        </div>
      </div>
    );
  }

  if (toolCalled === "get_sales_summary") {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "10px 12px",
          background: "#f8fafc",
          borderRadius: 10,
          border: "1px solid var(--admin-card-border, #e5e7eb)",
          fontSize: 13,
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ fontWeight: 700, color: "var(--admin-text-primary, #0f172a)" }}>Resumen de ventas</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>
            Pedidos: <strong>{String(r.total_orders ?? 0)}</strong>
          </span>
          <span>
            Ingresos: <strong>{String(r.total_revenue ?? 0)} EUR</strong>
          </span>
          <span>
            Ticket medio: <strong>{String(r.avg_ticket ?? 0)} EUR</strong>
          </span>
        </div>
      </div>
    );
  }

  return null;
}

function ConfirmationBubble({
  content,
  onConfirm,
  onCancel,
  pending,
}: {
  content: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        borderRadius: 12,
        maxWidth: 520,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#92400e", fontSize: 13 }}>Confirmar accion</div>
      <div style={{ color: "#78350f", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>{content}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--brand-primary, #4ec580)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Ejecutando..." : "Confirmar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#374151",
            fontWeight: 600,
            fontSize: 13,
            cursor: pending ? "not-allowed" : "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function AdminAIAssistantPage() {
  const { restaurantId, name } = useRestaurant();
  const { session } = useAuth();
  const userId = session?.user?.id ?? "";

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [restaurantCtx, setRestaurantCtx] = useState<RestaurantContext>({
    name: name || "Restaurante",
    slug: "",
    productsCount: 0,
    tablesCount: 0,
    isAcceptingOrders: false,
  });
  const [isListening, setIsListening] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const rateStatus = getRateLimitStatus(restaurantId);

  useEffect(() => {
    if (!restaurantId) return;
    void loadRestaurantContext();
    void loadRecentLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function loadRestaurantContext() {
    const [{ data: settings }, { count: productsCount }, { count: tablesCount }, { data: restaurant }] =
      await Promise.all([
        supabase.from("restaurant_settings").select("is_accepting_orders").eq("restaurant_id", restaurantId).single(),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true),
        supabase.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
        supabase.from("restaurants").select("name, slug").eq("id", restaurantId).single(),
      ]);

    setRestaurantCtx({
      name: restaurant?.name ?? name ?? "Restaurante",
      slug: restaurant?.slug ?? "",
      productsCount: productsCount ?? 0,
      tablesCount: tablesCount ?? 0,
      isAcceptingOrders: settings?.is_accepting_orders ?? false,
    });
  }

  async function loadRecentLogs() {
    const { data } = await supabase
      .from("ai_agent_logs")
      .select("id, tool_called, user_message, execution_status, created_at")
      .eq("restaurant_id", restaurantId)
      .not("tool_called", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    setRecentLogs((data ?? []) as RecentLog[]);
  }

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || !restaurantId || !userId) return;
      if (rateStatus.blocked) return;

      setInput("");
      setLoading(true);

      const userEntry: ChatEntry = { id: crypto.randomUUID(), role: "user", content: trimmed };
      setMessages((prev) => [...prev, userEntry]);

      try {
        const response: AgentResponse = await runAgent(trimmed, history, restaurantId, userId, restaurantCtx);

        const newHistory: AgentMessage[] = [
          ...history,
          { role: "user", content: trimmed },
          { role: "assistant", content: response.message },
        ];
        setHistory(newHistory);

        if (response.requiresConfirmation && response.pendingExecution) {
          const confirmationText = response.confirmationMessage ?? response.message;

          const confirmEntry: ChatEntry = {
            id: crypto.randomUUID(),
            role: "confirmation",
            content: confirmationText,
            pending: false,
            onConfirm: async () => {
              setMessages((prev) =>
                prev.map((m) => (m.role === "confirmation" && m.content === confirmationText ? { ...m, pending: true } : m))
              );

              try {
                const result = await response.pendingExecution!();
                setMessages((prev) => prev.filter((m) => !(m.role === "confirmation" && m.content === confirmationText)));
                const resultEntry: ChatEntry = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: result.message,
                  toolResult: result.toolResult,
                  toolCalled: result.toolCalled,
                };
                setMessages((prev) => [...prev, resultEntry]);
                void loadRecentLogs();
              } catch (err) {
                setMessages((prev) => prev.filter((m) => !(m.role === "confirmation" && m.content === confirmationText)));
                const errEntry: ChatEntry = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: `No se pudo ejecutar la acción: ${toUiErrorMessage(err)}`,
                };
                setMessages((prev) => [...prev, errEntry]);
              }
            },
            onCancel: () => {
              setMessages((prev) => prev.filter((m) => !(m.role === "confirmation" && m.content === confirmationText)));
              const cancelEntry: ChatEntry = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: "Accion cancelada.",
              };
              setMessages((prev) => [...prev, cancelEntry]);
            },
          };
          setMessages((prev) => [...prev, confirmEntry]);
        } else {
          const assistantEntry: ChatEntry = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: response.message,
            toolResult: response.toolResult,
            toolCalled: response.toolCalled,
          };
          setMessages((prev) => [...prev, assistantEntry]);
          if (response.toolCalled) void loadRecentLogs();
        }
      } catch (err) {
        const errEntry: ChatEntry = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: toUiErrorMessage(err),
        };
        setMessages((prev) => [...prev, errEntry]);
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, restaurantId, userId, history, restaurantCtx, rateStatus.blocked]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  function handleVoice() {
    const speechApi = window as unknown as {
      SpeechRecognition?: BrowserSpeechRecognitionCtor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
    };

    const SpeechRecognitionCtor = speechApi.SpeechRecognition ?? speechApi.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      alert("Tu navegador no soporta reconocimiento de voz");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "es-ES";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setInput(transcript);
        setTimeout(() => void sendMessage(transcript), 100);
      }
    };

    recognition.start();
  }

  function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    return `hace ${Math.floor(hours / 24)}d`;
  }

  function toolLabel(tool: string | null): string {
    const labels: Record<string, string> = {
      get_orders_today: "Consulta de pedidos",
      get_sales_summary: "Resumen de ventas",
      get_top_products: "Top productos",
      get_menu_status: "Estado del menu",
      create_tables: "Creacion de mesas",
      create_category: "Creacion de categoria",
      update_delivery_settings: "Actualizacion de delivery",
      toggle_accepting_orders: "Cambio de apertura",
      hide_product: "Ocultar producto",
      create_coupon: "Crear cupon",
      delete_product: "Eliminar producto",
      delete_category: "Eliminar categoria",
      update_product_prices: "Actualizacion de precios",
      delete_tables: "Eliminar mesas",
    };
    return tool ? labels[tool] ?? tool : "Consulta";
  }

  const isConversationEmpty = messages.length === 0;

  const welcomeText = useMemo(
    () =>
      `Hola. Soy tu asistente IA para ${restaurantCtx.name || "tu restaurante"}. Puedo consultar pedidos, ventas, menu y ejecutar acciones de gestion.`,
    [restaurantCtx.name]
  );

  const suggestionButtonStyle = (disabled: boolean): React.CSSProperties => ({
    textAlign: "left",
    background: "#ffffff",
    border: "1px solid var(--admin-card-border, #e5e7eb)",
    borderRadius: 10,
    padding: "10px 11px",
    fontSize: 13,
    color: "var(--admin-text-primary, #111827)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    lineHeight: 1.35,
    transition: "all 0.15s ease",
  });

  return (
    <section style={{ display: "grid", gap: 14, minHeight: "calc(100vh - 120px)" }}>
      <style>{`
        .ai-workspace-root {
          display: grid;
          grid-template-columns: 300px minmax(0, 1fr);
          gap: 14px;
          min-height: 0;
          height: calc(100vh - 210px);
        }
        .ai-card {
          background: var(--admin-card-bg, #fff);
          border: 1px solid var(--admin-card-border, #e5e7eb);
          border-radius: var(--admin-radius-md, 12px);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .ai-label {
          margin: 0;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
          color: var(--admin-text-muted, #64748b);
        }
        .ai-suggestion:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        @media (max-width: 1024px) {
          .ai-workspace-root {
            grid-template-columns: 1fr;
            height: auto;
          }
          .ai-sidebar {
            max-height: none;
          }
          .ai-chat-panel {
            min-height: 560px;
          }
        }
      `}</style>

      <header className="ai-card" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: "1px solid #dbe2ea",
              background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="4" stroke="#334155" strokeWidth="1.4" />
              <circle cx="9" cy="10" r="1.2" fill="#334155" />
              <circle cx="15" cy="10" r="1.2" fill="#334155" />
              <path d="M8 14.5h8" stroke="#334155" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: "var(--admin-text-primary, #0f172a)", lineHeight: 1.15 }}>Asistente IA</h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--admin-text-muted, #64748b)" }}>
              Gestiona tu restaurante con inteligencia artificial
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setHistory([]);
            }}
            style={{
              border: "1px solid var(--admin-card-border, #dbe2ea)",
              background: "#fff",
              color: "var(--admin-text-secondary, #334155)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Limpiar conversacion
          </button>
          <div style={{ width: 44, height: 36, border: "1px dashed #dbe2ea", borderRadius: 8, background: "#f8fafc" }} />
        </div>
      </header>

      <div className="ai-workspace-root">
        <aside className="ai-sidebar" style={{ display: "grid", gap: 12, minHeight: 0, overflow: "auto", paddingRight: 2 }}>
          <section className="ai-card" style={{ padding: 12, display: "grid", gap: 10 }}>
            <h2 className="ai-label">Consultas sugeridas</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {SUGGESTIONS.consultas.map((s) => {
                const disabled = loading || rateStatus.blocked;
                return (
                  <button
                    key={s}
                    type="button"
                    className="ai-suggestion"
                    disabled={disabled}
                    onClick={() => void sendMessage(s)}
                    style={suggestionButtonStyle(disabled)}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ai-card" style={{ padding: 12, display: "grid", gap: 10 }}>
            <h2 className="ai-label">Acciones rapidas</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {SUGGESTIONS.acciones.map((s) => {
                const disabled = loading || rateStatus.blocked;
                return (
                  <button
                    key={s}
                    type="button"
                    className="ai-suggestion"
                    disabled={disabled}
                    onClick={() => void sendMessage(s)}
                    style={suggestionButtonStyle(disabled)}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </section>

          {recentLogs.length > 0 && (
            <section className="ai-card" style={{ padding: 12, display: "grid", gap: 10 }}>
              <h2 className="ai-label">Actividad reciente</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {recentLogs.map((log) => (
                  <article
                    key={log.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "#ffffff",
                      borderRadius: 10,
                      padding: "8px 10px",
                      display: "grid",
                      gap: 3,
                    }}
                  >
                    <div style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>{toolLabel(log.tool_called)}</div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>{formatRelativeTime(log.created_at)}</div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {(rateStatus.warning || rateStatus.blocked) && (
            <section
              style={{
                background: rateStatus.blocked ? "#fef2f2" : "#fffbeb",
                border: `1px solid ${rateStatus.blocked ? "#fecaca" : "#fde68a"}`,
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 12,
                color: rateStatus.blocked ? "#991b1b" : "#92400e",
              }}
            >
              {rateStatus.blocked
                ? "Limite diario alcanzado (50 consultas). Vuelve manana."
                : `Aviso: ${rateStatus.remaining} consultas restantes hoy.`}
            </section>
          )}
        </aside>

        <section className="ai-card ai-chat-panel" style={{ display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", minHeight: 0 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--admin-card-border, #e5e7eb)" }}>
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "11px 12px",
                color: "#334155",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              {welcomeText}
            </div>
          </div>

          <div ref={chatRef} style={{ overflowY: "auto", padding: "14px 16px", display: "grid", gap: 10, alignContent: "start" }}>
            {isConversationEmpty && !loading && (
              <div
                style={{
                  border: "1px dashed #d1d5db",
                  borderRadius: 12,
                  background: "#fcfcfd",
                  padding: "18px 16px",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>Empieza a gestionar tu restaurante con IA</h3>
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                    Pregunta por ventas, pedidos, menu o ejecuta acciones.
                  </p>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {SUGGESTIONS.consultas.map((s) => {
                    const disabled = loading || rateStatus.blocked;
                    return (
                      <button
                        key={`empty-${s}`}
                        type="button"
                        className="ai-suggestion"
                        disabled={disabled}
                        onClick={() => void sendMessage(s)}
                        style={suggestionButtonStyle(disabled)}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {messages.map((m) => {
              if (m.role === "confirmation") {
                return (
                  <div key={m.id} style={{ justifySelf: "start", maxWidth: "100%" }}>
                    <ConfirmationBubble
                      content={m.content}
                      onConfirm={() => void m.onConfirm()}
                      onCancel={m.onCancel}
                      pending={m.pending}
                    />
                  </div>
                );
              }

              const isUser = m.role === "user";
              return (
                <article key={m.id} style={{ justifySelf: isUser ? "end" : "start", maxWidth: "84%", display: "grid", gap: 6 }}>
                  <div
                    style={{
                      padding: isUser ? "9px 12px" : "12px 13px",
                      borderRadius: 12,
                      background: isUser ? "#eef2ff" : "#ffffff",
                      color: "#0f172a",
                      border: isUser ? "1px solid #c7d2fe" : "1px solid #e5e7eb",
                      fontSize: 14,
                      lineHeight: 1.55,
                    }}
                  >
                    {m.content}
                  </div>
                  {!isUser && Boolean(m.toolResult) ? (
                    <ResultCard toolResult={m.toolResult} toolCalled={m.toolCalled} />
                  ) : null}
                </article>
              );
            })}

            {loading && (
              <div style={{ justifySelf: "start" }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    color: "#64748b",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ animation: "pulse 1.2s ease-in-out infinite" }}>.</span>
                  <span style={{ animation: "pulse 1.2s ease-in-out 0.2s infinite" }}>.</span>
                  <span style={{ animation: "pulse 1.2s ease-in-out 0.4s infinite" }}>.</span>
                </div>
              </div>
            )}
          </div>

          <footer style={{ padding: "12px 14px", borderTop: "1px solid var(--admin-card-border, #e5e7eb)" }}>
            {rateStatus.blocked ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "12px",
                  color: "#991b1b",
                  fontSize: 13,
                  background: "#fef2f2",
                  borderRadius: 10,
                }}
              >
                Limite diario de 50 consultas alcanzado. El asistente estara disponible manana.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) auto auto",
                    gap: 8,
                    alignItems: "end",
                  }}
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Escribe una pregunta o accion..."
                    disabled={loading}
                    rows={2}
                    maxLength={500}
                    style={{
                      resize: "vertical",
                      minHeight: 62,
                      maxHeight: 180,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--admin-card-border, #d1d5db)",
                      fontSize: 14,
                      fontFamily: "inherit",
                      lineHeight: 1.5,
                      color: "var(--admin-text-primary, #0f172a)",
                      background: "#fff",
                      outline: "none",
                    }}
                  />

                  <button
                    type="button"
                    onClick={handleVoice}
                    title={isListening ? "Detener grabacion" : "Dictar por voz"}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      border: `1px solid ${isListening ? "#ef4444" : "var(--admin-card-border, #d1d5db)"}`,
                      background: isListening ? "#fef2f2" : "#fff",
                      color: isListening ? "#b91c1c" : "var(--admin-text-secondary, #475569)",
                      fontSize: 16,
                      cursor: "pointer",
                    }}
                    aria-label={isListening ? "Detener grabacion" : "Iniciar grabacion"}
                  >
                    V
                  </button>

                  <button
                    type="button"
                    onClick={() => void sendMessage(input)}
                    disabled={loading || !input.trim()}
                    style={{
                      height: 42,
                      minWidth: 92,
                      padding: "0 16px",
                      borderRadius: 10,
                      border: "none",
                      background: loading || !input.trim() ? "#d1d5db" : "var(--brand-primary, #4ec580)",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    Enviar
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 7,
                    fontSize: 11,
                    color: "var(--admin-text-muted, #64748b)",
                  }}
                >
                  <span>El asistente solo puede actuar en tu restaurante.</span>
                  <span>{input.length}/500</span>
                </div>
              </>
            )}
          </footer>
        </section>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
      `}</style>
    </section>
  );
}
