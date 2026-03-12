import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useAuth } from "../../../auth/AuthContext";
import { useRestaurant } from "../../../restaurant/RestaurantContext";
import { supabase } from "../../../lib/supabase";
import { getRateLimitStatus } from "../../ai-agent/agentSecurity";
import { runAgent } from "../../ai-agent/agentService";
import type { AgentMessage, AgentResponse, RestaurantContext as AgentRestaurantContext } from "../../ai-agent/agentService";
import { searchArticles } from "../../help/helpArticles";

type AssistantActions = Array<{ label: string; to: string }>;

type ChatEntry =
  | { id: string; role: "user" | "assistant"; content: string; toolResult?: unknown; toolCalled?: string; actions?: AssistantActions }
  | { id: string; role: "confirmation"; content: string; onConfirm: () => void; onCancel: () => void; pending: boolean };

const CONSULTAS = [
  "Cuantos pedidos tuve hoy?",
  "Resumen de ventas de este mes",
  "Cual es mi producto mas vendido?",
] as const;

const ACCIONES = [
  "Crear 5 mesas",
  "Anadir categoria bebidas",
  "Abrir restaurante",
  "Cerrar restaurante",
] as const;

const HELP_HINTS = ["como", "cómo", "ayuda", "impresora", "qr", "producto", "menu", "menú", "configur", "usar"];

function genId(): string {
  return crypto.randomUUID();
}

function isHelpLikeQuery(text: string): boolean {
  const normalized = text.toLowerCase();
  return HELP_HINTS.some((kw) => normalized.includes(kw));
}

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
      <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc", fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: "#0f172a" }}>Pedidos de hoy</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>Total: <strong>{String(r.total_orders ?? 0)}</strong></span>
          <span>Ingresos: <strong>{String(r.total_revenue ?? 0)} EUR</strong></span>
          {Number(r.pending ?? 0) > 0 ? <span style={{ color: "#92400e" }}>Pendientes: <strong>{String(r.pending)}</strong></span> : null}
        </div>
      </div>
    );
  }

  if (toolCalled === "get_sales_summary") {
    return (
      <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc", fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: "#0f172a" }}>Resumen de ventas</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>Pedidos: <strong>{String(r.total_orders ?? 0)}</strong></span>
          <span>Ingresos: <strong>{String(r.total_revenue ?? 0)} EUR</strong></span>
          <span>Ticket medio: <strong>{String(r.avg_ticket ?? 0)} EUR</strong></span>
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
    <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 12, padding: "12px 13px", maxWidth: 520 }}>
      <div style={{ color: "#92400e", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Confirmar accion</div>
      <div style={{ color: "#78350f", fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>{content}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          style={{ borderRadius: 8, border: "none", padding: "6px 12px", background: "var(--brand-primary, #4ec580)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: pending ? "not-allowed" : "pointer" }}
        >
          {pending ? "Ejecutando..." : "Confirmar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "6px 12px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12, cursor: pending ? "not-allowed" : "pointer" }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

type UnifiedAssistantDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function UnifiedAssistantDrawer({ isOpen, onClose }: UnifiedAssistantDrawerProps) {
  const { restaurantId, name, slug, adminPath } = useRestaurant();
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = session?.user?.id ?? "";

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextFetched, setContextFetched] = useState(false);
  const [restaurantCtx, setRestaurantCtx] = useState<AgentRestaurantContext>({
    name: name || "Restaurante",
    slug: slug || "",
    productsCount: 0,
    tablesCount: 0,
    isAcceptingOrders: false,
  });

  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const prevPathRef = useRef<string>(location.pathname + location.search);
  const rateStatus = getRateLimitStatus(restaurantId);

  const debugNavigate = useCallback(
    (to: string, source: string) => {
      if (import.meta.env.DEV) {
        if (to.includes("/categories")) {
          console.warn(`[AI_DEBUG] navigate categories from ${source}`, {
            to,
            path: location.pathname + location.search,
          });
        } else {
          console.info(`[AI_DEBUG] navigate from ${source}`, {
            to,
            path: location.pathname + location.search,
          });
        }
      }
      navigate(to);
    },
    [location.pathname, location.search, navigate]
  );

  useEffect(() => {
    if (!isOpen || contextFetched || !restaurantId) return;
    setContextFetched(true);

    let mounted = true;
    void (async () => {
      const [{ data: settings }, { count: productsCount }, { count: tablesCount }, { data: restaurant }] = await Promise.all([
        supabase.from("restaurant_settings").select("is_accepting_orders").eq("restaurant_id", restaurantId).single(),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("is_active", true),
        supabase.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
        supabase.from("restaurants").select("name, slug").eq("id", restaurantId).single(),
      ]);

      if (!mounted) return;

      setRestaurantCtx({
        name: restaurant?.name ?? name ?? "Restaurante",
        slug: restaurant?.slug ?? slug ?? "",
        productsCount: productsCount ?? 0,
        tablesCount: tablesCount ?? 0,
        isAcceptingOrders: settings?.is_accepting_orders ?? false,
      });
    })();

    return () => {
      mounted = false;
    };
  }, [contextFetched, isOpen, restaurantId, name, slug]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const nextPath = location.pathname + location.search;
    if (!isOpen) {
      prevPathRef.current = nextPath;
      return;
    }
    if (prevPathRef.current !== nextPath && import.meta.env.DEV) {
      console.warn("[AI_DEBUG] route changed while assistant open", {
        from: prevPathRef.current,
        to: nextPath,
      });
    }
    prevPathRef.current = nextPath;
  }, [isOpen, location.pathname, location.search]);

  useEffect(() => {
    if (!isOpen) return;
    const onSubmitCapture = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const isChatSubmit = target instanceof HTMLFormElement && target === formRef.current;
      if (import.meta.env.DEV) {
        console.info("[AI_DEBUG] submit captured", {
          isChatSubmit,
          targetTag: target?.tagName ?? null,
          targetClass: target?.className ?? null,
          path: location.pathname + location.search,
        });
      }
      if (!isChatSubmit) {
        event.preventDefault();
        event.stopPropagation();
        if (import.meta.env.DEV) {
          console.warn("[AI_DEBUG] bubbling detected submit outside assistant", {
            targetTag: target?.tagName ?? null,
            path: location.pathname + location.search,
          });
        }
      }
    };
    document.addEventListener("submit", onSubmitCapture, true);
    return () => document.removeEventListener("submit", onSubmitCapture, true);
  }, [isOpen, location.pathname, location.search]);

  const emptyStateVisible = messages.length === 0;

  const welcomeText = useMemo(
    () => `Hola. Soy tu asistente IA para ${restaurantCtx.name || "tu restaurante"}. Puedo consultar pedidos, ventas, menu y ejecutar acciones de gestion.`,
    [restaurantCtx.name]
  );

  const pushAssistantMessage = useCallback((content: string, extra?: { toolResult?: unknown; toolCalled?: string; actions?: AssistantActions }) => {
    setMessages((prev) => [
      ...prev,
      {
        id: genId(),
        role: "assistant",
        content,
        ...(extra?.toolCalled ? { toolCalled: extra.toolCalled } : {}),
        ...(extra?.toolResult ? { toolResult: extra.toolResult } : {}),
        ...(extra?.actions ? { actions: extra.actions } : {}),
      },
    ]);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || !restaurantId || !userId || rateStatus.blocked) return;

      const { data: preSendSession } = await supabase.auth.getSession();
      if (import.meta.env.DEV) {
        console.info("[assistant-ui] session before send", {
          hasSession: Boolean(preSendSession.session),
          userId: preSendSession.session?.user?.id ?? null,
          expiresAt: preSendSession.session?.expires_at ?? null,
          restaurantId,
          messageLength: trimmed.length,
        });
      }

      setLoading(true);
      setInput("");
      setMessages((prev) => [...prev, { id: genId(), role: "user", content: trimmed }]);

      const matchedArticles = searchArticles(trimmed);
      const helpLike = isHelpLikeQuery(trimmed);

      if (helpLike && matchedArticles.length > 0) {
        const top = matchedArticles[0];
        pushAssistantMessage(`${top.title}\n\n${top.description}`, {
          actions: [{ label: "Abrir articulo", to: `${adminPath}/help?article=${top.id}` }],
        });
        setLoading(false);
        return;
      }

      try {
        const response: AgentResponse = await runAgent(trimmed, history, restaurantId, userId, restaurantCtx);
        if (import.meta.env.DEV) {
          console.info("[assistant-ui] assistant response", {
            toolCalled: response.toolCalled ?? null,
            requiresConfirmation: Boolean(response.requiresConfirmation),
            hasToolResult: Boolean(response.toolResult),
          });
        }

        setHistory((prev) => [
          ...prev,
          { role: "user", content: trimmed },
          { role: "assistant", content: response.message },
        ]);

        if (response.requiresConfirmation && response.pendingExecution) {
          const confirmationText = response.confirmationMessage ?? response.message;
          const confirmEntry: ChatEntry = {
            id: genId(),
            role: "confirmation",
            content: confirmationText,
            pending: false,
            onConfirm: async () => {
              setMessages((prev) => prev.map((m) => (m.role === "confirmation" && m.content === confirmationText ? { ...m, pending: true } : m)));
              try {
                const result = await response.pendingExecution!();
                setMessages((prev) => prev.filter((m) => !(m.role === "confirmation" && m.content === confirmationText)));
                pushAssistantMessage(result.message, { toolCalled: result.toolCalled, toolResult: result.toolResult });
              } catch (err) {
                setMessages((prev) => prev.filter((m) => !(m.role === "confirmation" && m.content === confirmationText)));
                pushAssistantMessage(`No se pudo ejecutar la accion: ${toUiErrorMessage(err)}`);
              }
            },
            onCancel: () => {
              setMessages((prev) => prev.filter((m) => !(m.role === "confirmation" && m.content === confirmationText)));
              pushAssistantMessage("Accion cancelada.");
            },
          };
          setMessages((prev) => [...prev, confirmEntry]);
        } else {
          pushAssistantMessage(response.message, { toolCalled: response.toolCalled, toolResult: response.toolResult });
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          const msg = err instanceof Error ? err.message : String(err);
          const low = msg.toLowerCase();
          console.error("[assistant-ui] assistant request failed", {
            message: msg,
            got401: low.includes("401") || low.includes("unauthorized") || low.includes("invalid jwt") || low.includes("expir"),
            got403: low.includes("403") || low.includes("forbidden") || low.includes("sin acceso"),
          });
        }
        if (matchedArticles.length > 0) {
          const top = matchedArticles[0];
          pushAssistantMessage(`${top.title}\n\n${top.description}`, {
            actions: [{ label: "Abrir articulo", to: `${adminPath}/help?article=${top.id}` }],
          });
        } else {
          pushAssistantMessage(toUiErrorMessage(err));
        }
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 40);
      }
    },
    [adminPath, history, loading, pushAssistantMessage, rateStatus.blocked, restaurantCtx, restaurantId, userId]
  );

  const handleChatSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (import.meta.env.DEV) {
        console.info("[AI_DEBUG] submit assistant", {
          inputLength: input.trim().length,
          loading,
          blocked: rateStatus.blocked,
          path: location.pathname + location.search,
        });
      }
      void sendMessage(input);
    },
    [input, loading, location.pathname, location.search, rateStatus.blocked, sendMessage]
  );

  if (!isOpen) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.24)", zIndex: 1200 }} />

      <aside
        style={{
          position: "fixed",
          top: 74,
          right: 14,
          bottom: 14,
          width: "min(460px, calc(100vw - 28px))",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          boxShadow: "0 20px 50px rgba(2, 6, 23, 0.22)",
          zIndex: 1210,
          display: "grid",
          gridTemplateRows: "auto auto minmax(0,1fr) auto",
          overflow: "hidden",
        }}
      >
        <header style={{ padding: "14px 14px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 19, color: "#0f172a" }}>Asistente IA</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>Gestiona tu restaurante o pide ayuda</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setHistory([]);
                setInput("");
              }}
              style={{ border: "1px solid #d1d5db", background: "#fff", color: "#334155", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Nueva conversacion
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar asistente"
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#334155", fontSize: 18, lineHeight: "1", cursor: "pointer" }}
            >
              ×
            </button>
          </div>
        </header>

        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ border: "1px solid #e5e7eb", background: "#f8fafc", borderRadius: 10, padding: "10px 11px", color: "#334155", fontSize: 13, lineHeight: 1.45 }}>
            {welcomeText}
          </div>
        </div>

        <div ref={chatRef} style={{ overflowY: "auto", padding: "12px 14px", display: "grid", gap: 10, alignContent: "start" }}>
          {emptyStateVisible && !loading ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ border: "1px dashed #d1d5db", background: "#fcfcfd", borderRadius: 12, padding: "14px 12px", display: "grid", gap: 4 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>Empieza a gestionar tu restaurante con IA</h3>
                <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Pregunta por ventas, pedidos, menu o ejecuta acciones.</p>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>Consultas</div>
                <div style={{ display: "grid", gap: 7 }}>
                  {CONSULTAS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => {
                        if (import.meta.env.DEV) {
                          console.info("[AI_DEBUG] clicked suggestion", { text, kind: "consulta" });
                        }
                        void sendMessage(text);
                      }}
                      disabled={loading || rateStatus.blocked}
                      style={{ textAlign: "left", border: "1px solid #e5e7eb", background: "#fff", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "#0f172a", cursor: loading || rateStatus.blocked ? "not-allowed" : "pointer" }}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>Acciones</div>
                <div style={{ display: "grid", gap: 7 }}>
                  {ACCIONES.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => {
                        if (import.meta.env.DEV) {
                          console.info("[AI_DEBUG] clicked suggestion", { text, kind: "accion" });
                        }
                        void sendMessage(text);
                      }}
                      disabled={loading || rateStatus.blocked}
                      style={{ textAlign: "left", border: "1px solid #e5e7eb", background: "#fff", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "#0f172a", cursor: loading || rateStatus.blocked ? "not-allowed" : "pointer" }}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {messages.map((m) => {
            if (m.role === "confirmation") {
              return (
                <div key={m.id} style={{ justifySelf: "start", maxWidth: "100%" }}>
                  <ConfirmationBubble content={m.content} onConfirm={() => void m.onConfirm()} onCancel={m.onCancel} pending={m.pending} />
                </div>
              );
            }

            const isUser = m.role === "user";
            return (
              <article key={m.id} style={{ justifySelf: isUser ? "end" : "start", maxWidth: "88%", display: "grid", gap: 5 }}>
                <div style={{ border: isUser ? "1px solid #c7d2fe" : "1px solid #e5e7eb", background: isUser ? "#eef2ff" : "#fff", borderRadius: 12, padding: isUser ? "9px 11px" : "11px 12px", color: "#0f172a", fontSize: 13, lineHeight: 1.52, whiteSpace: "pre-wrap" }}>
                  {m.content}
                </div>

                {!isUser && m.toolResult ? <ResultCard toolResult={m.toolResult} toolCalled={m.toolCalled} /> : null}

                {!isUser && m.actions && m.actions.length > 0 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {m.actions.map((action) => (
                      <button
                        key={`${m.id}-${action.to}`}
                        type="button"
                        onClick={() => {
                          if (import.meta.env.DEV) {
                            console.info("[AI_DEBUG] clicked suggestion", { text: action.label, to: action.to, kind: "assistant_action" });
                          }
                          debugNavigate(action.to, "assistant-action-button");
                          onClose();
                        }}
                        style={{ border: "1px solid #cbd5e1", background: "#fff", color: "#334155", borderRadius: 8, padding: "4px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}

          {loading ? (
            <div style={{ justifySelf: "start" }}>
              <div style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 12, padding: "8px 10px", color: "#64748b", fontSize: 13 }}>
                Procesando...
              </div>
            </div>
          ) : null}
        </div>

        <footer style={{ borderTop: "1px solid #e5e7eb", padding: "11px 12px" }}>
          {rateStatus.blocked ? (
            <div style={{ borderRadius: 10, border: "1px solid #fecaca", background: "#fef2f2", padding: "10px", color: "#991b1b", fontSize: 12 }}>
              Limite diario alcanzado (50 consultas). Vuelve manana.
            </div>
          ) : (
            <>
              <form
                ref={formRef}
                onSubmit={handleChatSubmit}
                onClickCapture={(event) => event.stopPropagation()}
                onKeyDownCapture={(event) => {
                  if (event.key === "Enter" && import.meta.env.DEV) {
                    console.info("[AI_DEBUG] keydown captured in assistant form", {
                      targetTag: (event.target as HTMLElement | null)?.tagName ?? null,
                    });
                  }
                  event.stopPropagation();
                }}
                style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "end" }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      if (import.meta.env.DEV) {
                        console.info("[AI_DEBUG] enter pressed", {
                          path: location.pathname + location.search,
                          inputLength: input.trim().length,
                        });
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      void sendMessage(input);
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  placeholder="Escribe una pregunta o accion..."
                  maxLength={500}
                  rows={2}
                  readOnly={loading}
                  style={{ resize: "vertical", minHeight: 64, maxHeight: 170, border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 11px", fontSize: 14, fontFamily: "inherit", lineHeight: 1.45, color: "#0f172a", background: "#fff", outline: "none" }}
                />
                <button
                  type="submit"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (import.meta.env.DEV) {
                      console.info("[AI_DEBUG] click send button", {
                        path: location.pathname + location.search,
                        inputLength: input.trim().length,
                      });
                    }
                  }}
                  disabled={loading || !input.trim()}
                  style={{ height: 40, borderRadius: 10, border: "none", padding: "0 14px", background: loading || !input.trim() ? "#d1d5db" : "var(--brand-primary, #4ec580)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: loading || !input.trim() ? "not-allowed" : "pointer" }}
                >
                  Enviar
                </button>
              </form>

              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, color: "#64748b" }}>
                <span>El asistente solo puede actuar en tu restaurante.</span>
                <span>{input.length}/500</span>
              </div>
            </>
          )}
        </footer>
      </aside>
    </>
    ,
    document.body
  );
}


