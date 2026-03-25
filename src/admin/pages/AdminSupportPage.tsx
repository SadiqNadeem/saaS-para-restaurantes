import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { NewTicketModal } from "../components/SupportChat/NewTicketModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "normal" | "high" | "urgent";
type TicketCategory = "pedidos" | "impresion" | "menu" | "delivery" | "pagos" | "mesas" | "otro";
type FilterTab = "all" | TicketStatus;

type Ticket = {
  id: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  screenshot_url: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type Message = {
  id: string;
  ticket_id: string;
  user_id: string | null;
  is_staff: boolean;
  message: string;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<TicketCategory, string> = {
  pedidos: "", impresion: "", menu: "",
  delivery: "", pagos: "", mesas: "", otro: "",
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  pedidos: "Pedidos", impresion: "Impresión", menu: "Menú y productos",
  delivery: "Delivery", pagos: "Pagos", mesas: "Mesas", otro: "Otro",
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; color: string }> = {
  open: { label: "Abierto", bg: "#dbeafe", color: "#1d4ed8" },
  in_progress: { label: "En progreso", bg: "#fef9c3", color: "#a16207" },
  resolved: { label: "Resuelto", bg: "#dcfce7", color: "#15803d" },
  closed: { label: "Cerrado", bg: "#f3f4f6", color: "#6b7280" },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: "Baja", color: "#9ca3af" },
  normal: { label: "Normal", color: "#22c55e" },
  high: { label: "Alta", color: "#f59e0b" },
  urgent: { label: "Urgente", color: "#ef4444" },
};

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "open", label: "Abiertos" },
  { id: "in_progress", label: "En progreso" },
  { id: "resolved", label: "Resueltos" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
    }}>
      {cfg.label}
    </span>
  );
}

// ── PriorityBadge ─────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  if (priority === "low" || priority === "normal") return null;
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span style={{
      background: `${cfg.color}18`, color: cfg.color,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
      border: `1px solid ${cfg.color}40`,
    }}>
      {cfg.label}
    </span>
  );
}

// ── TicketDetailPanel ─────────────────────────────────────────────────────────

function TicketDetailPanel({
  ticket,
  onClose,
  onStatusChange,
}: {
  ticket: Ticket;
  onClose: () => void;
  onStatusChange: (id: string, status: TicketStatus) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoadingMsgs(true);
    void supabase
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!alive) return;
        setMessages((data as Message[]) ?? []);
        setLoadingMsgs(false);
      });
    return () => { alive = false; };
  }, [ticket.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = newMsg.trim();
    if (!text || sending) return;
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data } = await supabase
      .from("support_ticket_messages")
      .insert({ ticket_id: ticket.id, user_id: session?.user?.id ?? null, is_staff: false, message: text })
      .select()
      .single();
    if (data) setMessages((prev) => [...prev, data as Message]);
    setNewMsg("");
    setSending(false);
  };

  const handleClose = async () => {
    await supabase
      .from("support_tickets")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", ticket.id);
    onStatusChange(ticket.id, "closed");
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1500,
      display: "flex", justifyContent: "flex-end",
    }}>
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(17,24,39,0.3)" }}
      />
      {/* Panel */}
      <div style={{
        position: "relative", zIndex: 1,
        width: 480, maxWidth: "95vw", height: "100%",
        background: "#fff", boxShadow: "-4px 0 32px rgba(0,0,0,0.12)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 16px", borderBottom: "1px solid #e5e7eb",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", lineHeight: 1.3 }}>
              {CATEGORY_ICONS[ticket.category]} {ticket.title}
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
              {CATEGORY_LABELS[ticket.category]} · {formatDateTime(ticket.created_at)}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 28, height: 28, border: "1px solid #e5e7eb", borderRadius: 6,
            background: "#fff", cursor: "pointer", fontSize: 16, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280",
          }}>×</button>
        </div>

        {/* Description */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>DESCRIPCIÓN</div>
          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {ticket.description}
          </p>
          {ticket.screenshot_url && (
            <a href={ticket.screenshot_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8 }}>
              <img src={ticket.screenshot_url} alt="Captura" style={{
                maxWidth: 160, maxHeight: 100, borderRadius: 6, border: "1px solid #e5e7eb", objectFit: "cover",
              }} />
            </a>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {loadingMsgs ? (
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: 24 }}>Cargando mensajes...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: 24 }}>
              Sin mensajes aún. Puedes añadir más contexto abajo.
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.is_staff ? "flex-start" : "flex-end" }}>
                {msg.is_staff && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2, paddingLeft: 4 }}>Soporte</div>
                )}
                <div style={{
                  maxWidth: "80%",
                  background: msg.is_staff ? "#f3f4f6" : "var(--brand-primary)",
                  color: msg.is_staff ? "#111827" : "#fff",
                  borderRadius: msg.is_staff ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
                  padding: "9px 13px", fontSize: 13, lineHeight: 1.5,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {msg.message}
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, paddingInline: 4 }}>
                  {timeAgo(msg.created_at)}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: "10px 16px", borderTop: "1px solid #f0f0f0",
          display: "flex", gap: 8, flexShrink: 0, background: "#fafafa",
        }}>
          <input
            type="text"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder="Añadir información al ticket..."
            disabled={ticket.status === "closed"}
            style={{
              flex: 1, border: "1px solid #e5e7eb", borderRadius: 20,
              padding: "8px 14px", fontSize: 13, outline: "none",
              background: ticket.status === "closed" ? "#f9fafb" : "#fff",
              color: "#111827", fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!newMsg.trim() || sending || ticket.status === "closed"}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none", flexShrink: 0,
              background: !newMsg.trim() || sending || ticket.status === "closed" ? "#e5e7eb" : "var(--brand-primary)",
              color: !newMsg.trim() || sending || ticket.status === "closed" ? "#9ca3af" : "#fff",
              cursor: !newMsg.trim() || sending || ticket.status === "closed" ? "not-allowed" : "pointer",
              fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >↑</button>
        </div>

        {/* Footer actions */}
        {(ticket.status === "resolved" || ticket.status === "open" || ticket.status === "in_progress") && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => void handleClose()}
              style={{
                width: "100%", padding: "8px", borderRadius: 8,
                border: "1px solid #e5e7eb", background: "#fff",
                color: "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Cerrar ticket
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AdminSupportPage ──────────────────────────────────────────────────────────

export default function AdminSupportPage() {
  const { restaurantId } = useRestaurant();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { void fetchTickets(); }, [fetchTickets]);

  const handleStatusChange = useCallback((id: string, status: TicketStatus) => {
    setTickets((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    if (selectedTicket?.id === id) setSelectedTicket((prev) => prev ? { ...prev, status } : null);
  }, [selectedTicket]);

  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  // Stats
  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved").length,
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: "#111827", color: "#fff", borderRadius: 10,
          padding: "10px 18px", fontSize: 13, fontWeight: 600, zIndex: 3000,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 className="admin-panel" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
             Soporte técnico
          </h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
            Historial de tus solicitudes de ayuda
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          style={{
            padding: "9px 16px", borderRadius: 8, border: "none",
            background: "var(--brand-primary)", color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0,
          }}
        >
          + Nuevo ticket
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total", value: stats.total, color: "#6b7280" },
          { label: "Abiertos", value: stats.open, color: "#1d4ed8" },
          { label: "En progreso", value: stats.in_progress, color: "#a16207" },
          { label: "Resueltos", value: stats.resolved, color: "#15803d" },
        ].map((s) => (
          <div key={s.label} style={{
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
            padding: "12px 14px", textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            style={{
              padding: "6px 14px", borderRadius: 20,
              border: `1px solid ${filter === tab.id ? "var(--brand-primary)" : "#e5e7eb"}`,
              background: filter === tab.id ? "var(--brand-primary-soft)" : "#fff",
              color: filter === tab.id ? "var(--brand-hover)" : "#374151",
              fontSize: 13, fontWeight: filter === tab.id ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              height: 80, background: "#f3f4f6", borderRadius: 10,
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: "#fff", border: "1px solid #e5e7eb",
          borderRadius: 12, color: "#9ca3af",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}></div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#374151", marginBottom: 6 }}>
            {filter === "all" ? "Sin tickets aún" : "Sin tickets en esta categoría"}
          </div>
          <div style={{ fontSize: 13 }}>
            {filter === "all" ? "Crea tu primer ticket si necesitas ayuda." : "Prueba con otro filtro."}
          </div>
          {filter === "all" && (
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              style={{
                marginTop: 16, padding: "8px 18px", borderRadius: 8,
                border: "none", background: "var(--brand-primary)", color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              + Nuevo ticket
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((ticket) => (
            <div
              key={ticket.id}
              style={{
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
                padding: "14px 16px", cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                transition: "box-shadow 0.15s, border-color 0.15s",
              }}
              onClick={() => setSelectedTicket(ticket)}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                e.currentTarget.style.borderColor = "var(--brand-primary-border)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 4 }}>
                    {CATEGORY_ICONS[ticket.category]} {ticket.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {CATEGORY_LABELS[ticket.category]} · {timeAgo(ticket.created_at)}
                  </div>
                </div>
                <span style={{
                  color: "var(--brand-hover)", fontSize: 13, fontWeight: 600,
                  flexShrink: 0, paddingTop: 2,
                }}>
                  Ver detalles →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New ticket modal */}
      <NewTicketModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSuccess={() => {
          setShowNewModal(false);
          showToast(" Ticket enviado. Te responderemos pronto.");
          void fetchTickets();
        }}
      />

      {/* Ticket detail panel */}
      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
