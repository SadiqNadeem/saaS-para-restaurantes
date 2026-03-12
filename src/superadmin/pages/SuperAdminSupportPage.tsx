import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "normal" | "high" | "urgent";
type TicketCategory = "pedidos" | "impresion" | "menu" | "delivery" | "pagos" | "mesas" | "otro";

type Ticket = {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  screenshot_url: string | null;
  browser_info: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  restaurant_name?: string;
  restaurant_slug?: string;
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
  pedidos: "Pedidos", impresion: "Impresión", menu: "Menú",
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
  normal: { label: "Normal", color: "#6b7280" },
  high: { label: "Alta", color: "#f59e0b" },
  urgent: { label: "Urgente", color: "#ef4444" },
};

const ALL_STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const ALL_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];

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

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span style={{
      background: `${cfg.color}18`, color: cfg.color,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
      border: `1px solid ${cfg.color}40`, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

// ── TicketDetailModal ─────────────────────────────────────────────────────────

function TicketDetailModal({
  ticket,
  onClose,
  onUpdated,
}: {
  ticket: Ticket;
  onClose: () => void;
  onUpdated: (updated: Ticket) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [newMsg, setNewMsg] = useState("");
  const [internalNote, setInternalNote] = useState(ticket.resolution_note ?? "");
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
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

  const handleSendReply = async () => {
    const text = newMsg.trim();
    if (!text || sending) return;
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data } = await supabase
      .from("support_ticket_messages")
      .insert({ ticket_id: ticket.id, user_id: session?.user?.id ?? null, is_staff: true, message: text })
      .select()
      .single();
    if (data) setMessages((prev) => [...prev, data as Message]);
    setNewMsg("");
    setSending(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status,
      resolution_note: internalNote.trim() || null,
      updated_at: now,
    };
    if (status === "resolved" && ticket.status !== "resolved") {
      updates.resolved_at = now;
    }
    const { data } = await supabase
      .from("support_tickets")
      .update(updates)
      .eq("id", ticket.id)
      .select()
      .single();
    if (data) onUpdated(data as Ticket);
    setSaving(false);
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(17,24,39,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del ticket"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 680,
          background: "#fff", borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column",
          maxHeight: "calc(100vh - 48px)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid #e5e7eb",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
              #{shortId(ticket.id)} · {ticket.restaurant_name ?? ticket.restaurant_id} · {timeAgo(ticket.created_at)}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
              {CATEGORY_ICONS[ticket.category]} {ticket.title}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <StatusBadge status={status} />
              <PriorityBadge priority={ticket.priority} />
              <span style={{ fontSize: 12, color: "#6b7280" }}>{CATEGORY_LABELS[ticket.category]}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 28, height: 28, border: "1px solid #e5e7eb", borderRadius: 6,
            background: "#fff", cursor: "pointer", fontSize: 16, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280",
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Description */}
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>DESCRIPCIÓN</div>
            <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              {ticket.description}
            </p>
            {ticket.screenshot_url && (
              <a href={ticket.screenshot_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8 }}>
                <img src={ticket.screenshot_url} alt="Captura" style={{
                  maxWidth: 160, maxHeight: 100, borderRadius: 6,
                  border: "1px solid #e5e7eb", objectFit: "cover",
                }} />
              </a>
            )}
            {ticket.browser_info && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", fontFamily: "monospace", wordBreak: "break-all" }}>
                {ticket.browser_info}
              </div>
            )}
          </div>

          {/* Messages thread */}
          <div style={{ flex: 1, padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8, minHeight: 160 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 2 }}>MENSAJES</div>
            {loadingMsgs ? (
              <div style={{ color: "#9ca3af", fontSize: 13 }}>Cargando...</div>
            ) : messages.length === 0 ? (
              <div style={{ color: "#9ca3af", fontSize: 13 }}>Sin mensajes.</div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.is_staff ? "flex-start" : "flex-end" }}>
                  {msg.is_staff && (
                    <div style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 600, marginBottom: 2, paddingLeft: 4 }}>
                      Soporte (tú)
                    </div>
                  )}
                  <div style={{
                    maxWidth: "78%",
                    background: msg.is_staff ? "#dbeafe" : "#f3f4f6",
                    color: "#111827",
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

          {/* Reply input */}
          <div style={{
            padding: "10px 18px", borderTop: "1px solid #f0f0f0",
            display: "flex", gap: 8, flexShrink: 0, background: "#fafafa",
          }}>
            <input
              type="text"
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSendReply(); } }}
              placeholder="Responder al cliente (marcado como staff)..."
              style={{
                flex: 1, border: "1px solid #e5e7eb", borderRadius: 20,
                padding: "8px 14px", fontSize: 13, outline: "none",
                background: "#fff", color: "#111827", fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              onClick={() => void handleSendReply()}
              disabled={!newMsg.trim() || sending}
              style={{
                width: 36, height: 36, borderRadius: "50%", border: "none", flexShrink: 0,
                background: !newMsg.trim() || sending ? "#e5e7eb" : "#1d4ed8",
                color: !newMsg.trim() || sending ? "#9ca3af" : "#fff",
                cursor: !newMsg.trim() || sending ? "not-allowed" : "pointer",
                fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >↑</button>
          </div>

          {/* Admin controls */}
          <div style={{ padding: "12px 18px 16px", borderTop: "1px solid #f0f0f0", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                  ESTADO
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TicketStatus)}
                  style={{
                    width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
                    padding: "7px 10px", fontSize: 13, color: "#111827",
                    background: "#fff", fontFamily: "inherit",
                  }}
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                style={{
                  padding: "7px 18px", borderRadius: 8, border: "none",
                  background: saving ? "#d1d5db" : "var(--brand-primary)",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: saving ? "not-allowed" : "pointer",
                  height: 36,
                }}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                NOTA INTERNA (solo visible para staff)
              </label>
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Añade notas internas sobre la resolución..."
                rows={2}
                style={{
                  width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
                  padding: "8px 10px", fontSize: 13, color: "#111827",
                  background: "#fffbeb", fontFamily: "inherit",
                  resize: "vertical", boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SuperAdminSupportPage ─────────────────────────────────────────────────────

export default function SuperAdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<TicketStatus | "">("");
  const [filterPriority, setFilterPriority] = useState<TicketPriority | "">("");
  const [filterCategory, setFilterCategory] = useState<TicketCategory | "">("");
  const [searchRestaurant, setSearchRestaurant] = useState("");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    // Join with restaurants to get name/slug
    const { data } = await supabase
      .from("support_tickets")
      .select("*, restaurants(name, slug)")
      .order("created_at", { ascending: false });

    const rows = ((data as unknown[]) ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const rest = r.restaurants as { name: string; slug: string } | null;
      return {
        ...(r as unknown as Ticket),
        restaurant_name: rest?.name ?? "",
        restaurant_slug: rest?.slug ?? "",
      };
    });

    setTickets(rows);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchTickets(); }, [fetchTickets]);

  const handleUpdated = useCallback((updated: Ticket) => {
    setTickets((prev) => prev.map((t) => t.id === updated.id ? { ...t, ...updated } : t));
    setSelectedTicket((prev) => prev?.id === updated.id ? { ...prev, ...updated } : prev);
  }, []);

  // Stats
  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    urgent: tickets.filter((t) => t.priority === "urgent").length,
  };

  // Filtered list
  const filtered = tickets.filter((t) => {
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterCategory && t.category !== filterCategory) return false;
    if (searchRestaurant) {
      const q = searchRestaurant.toLowerCase();
      if (!(t.restaurant_name ?? "").toLowerCase().includes(q) &&
          !(t.restaurant_slug ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const inputStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, color: "#111827",
    background: "#fff", fontFamily: "inherit",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827" }}>
           Tickets de soporte
        </h1>
        <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
          Gestión centralizada de todas las solicitudes
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total", value: stats.total, color: "#6b7280" },
          { label: "Abiertos", value: stats.open, color: "#1d4ed8" },
          { label: "Urgentes", value: stats.urgent, color: "#ef4444" },
        ].map((s) => (
          <div key={s.label} style={{
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
            padding: "12px 20px", textAlign: "center", minWidth: 90,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          value={searchRestaurant}
          onChange={(e) => setSearchRestaurant(e.target.value)}
          placeholder="Buscar restaurante..."
          style={{ ...inputStyle, minWidth: 180 }}
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as TicketStatus | "")} style={inputStyle}>
          <option value="">Todos los estados</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as TicketPriority | "")} style={inputStyle}>
          <option value="">Toda prioridad</option>
          {ALL_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as TicketCategory | "")} style={inputStyle}>
          <option value="">Toda categoría</option>
          {(Object.keys(CATEGORY_LABELS) as TicketCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden",
      }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "80px 1fr 110px 130px 90px 90px 90px",
          padding: "10px 14px",
          background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
          fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em",
          gap: 8,
        }}>
          <span>#ID</span>
          <span>Restaurante / Título</span>
          <span>Categoría</span>
          <span>Título</span>
          <span>Prioridad</span>
          <span>Estado</span>
          <span>Hace</span>
        </div>

        {loading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            Cargando tickets...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            Sin tickets con esos filtros.
          </div>
        ) : (
          filtered.map((ticket, i) => (
            <div
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 110px 130px 90px 90px 90px",
                padding: "11px 14px",
                borderBottom: i < filtered.length - 1 ? "1px solid #f3f4f6" : "none",
                cursor: "pointer", gap: 8, alignItems: "center",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
            >
              <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                {shortId(ticket.id)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ticket.restaurant_name ?? ticket.restaurant_id}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ticket.title}
                </div>
              </div>
              <span style={{ fontSize: 12, color: "#374151" }}>
                {CATEGORY_ICONS[ticket.category]} {CATEGORY_LABELS[ticket.category]}
              </span>
              <span style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ticket.title}
              </span>
              <PriorityBadge priority={ticket.priority} />
              <StatusBadge status={ticket.status} />
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                {timeAgo(ticket.created_at)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Detail modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
