import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { runDiagnostics } from "../services/diagnosticsService";
import type { DiagnosticIssue, DiagnosticSeverity } from "../services/diagnosticsService";

// Ordered list of all check IDs with their "passed" label
const ALL_CHECKS: Array<{ id: string; passLabel: string; passDetail?: string }> = [
  { id: "no_products", passLabel: "Productos activos" },
  { id: "not_accepting", passLabel: "Aceptando pedidos" },
  { id: "no_hours", passLabel: "Horario configurado" },
  { id: "outside_hours", passLabel: "Dentro del horario de hoy" },
  { id: "stuck_orders", passLabel: "Sin pedidos sin atender" },
  { id: "no_categories", passLabel: "Categorías configuradas" },
  { id: "no_delivery_radius", passLabel: "Zona de reparto configurada" },
  { id: "no_payment", passLabel: "Método de pago activo" },
  { id: "zero_price_products", passLabel: "Precios de productos correctos" },
  { id: "no_seo", passLabel: "SEO configurado" },
];

const SEVERITY_COLORS: Record<DiagnosticSeverity, { bg: string; border: string; color: string }> = {
  error: { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" },
  warning: { bg: "#fffbeb", border: "#fde68a", color: "#78350f" },
  info: { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af" },
};

const SEVERITY_ICON: Record<DiagnosticSeverity, string> = {
  error: "",
  warning: "",
  info: "",
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function ScoreCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: bg,
        padding: "14px 16px",
        textAlign: "center",
        flex: "1 1 120px",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

export default function AdminDiagnosticsPage() {
  const { restaurantId, adminPath, name: restaurantName } = useRestaurant();
  const navigate = useNavigate();

  const [issues, setIssues] = useState<DiagnosticIssue[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [autoFixingId, setAutoFixingId] = useState<string | null>(null);
  const [fixMessage, setFixMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // System info
  const [lastOrderDate, setLastOrderDate] = useState<string | null>(null);
  const [todayOrderCount, setTodayOrderCount] = useState<number>(0);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setFixMessage(null);
    try {
      const result = await runDiagnostics(restaurantId);
      setIssues(result);
      setLastChecked(new Date());
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // System info queries
  useEffect(() => {
    let alive = true;

    const loadSystemInfo = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [lastOrderRes, todayCountRes] = await Promise.all([
        supabase
          .from("orders")
          .select("created_at")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .gte("created_at", todayStart.toISOString()),
      ]);

      if (!alive) return;

      const rawDate = (lastOrderRes.data as { created_at?: string } | null)?.created_at ?? null;
      if (rawDate) {
        setLastOrderDate(formatDateTime(new Date(rawDate)));
      }
      setTodayOrderCount(todayCountRes.count ?? 0);
    };

    void loadSystemInfo();
    return () => { alive = false; };
  }, [restaurantId]);

  useEffect(() => {
    void fetchDiagnostics();
  }, [fetchDiagnostics]);

  const handleAutoFix = useCallback(
    async (issue: DiagnosticIssue) => {
      if (issue.id !== "not_accepting") return;

      setAutoFixingId(issue.id);
      setFixMessage(null);

      const { error } = await supabase
        .from("restaurant_settings")
        .update({ is_accepting_orders: true })
        .eq("restaurant_id", restaurantId);

      if (error) {
        setFixMessage({ type: "error", text: `Error al solucionar: ${error.message}` });
      } else {
        setFixMessage({ type: "success", text: "✓ Restaurante activado para recibir pedidos." });
        void fetchDiagnostics();
      }

      setAutoFixingId(null);
      setTimeout(() => setFixMessage(null), 4000);
    },
    [restaurantId, fetchDiagnostics]
  );

  const errors = issues?.filter((i) => i.severity === "error") ?? [];
  const warnings = issues?.filter((i) => i.severity === "warning") ?? [];
  const infos = issues?.filter((i) => i.severity === "info") ?? [];
  const issueIds = new Set(issues?.map((i) => i.id) ?? []);
  const passedCount = ALL_CHECKS.filter((c) => !issueIds.has(c.id)).length;
  const totalChecks = ALL_CHECKS.length;

  // Health score: 0-10, weighted: errors = -1.5, warnings = -0.5, info = -0.2
  const rawScore = 10
    - errors.length * 1.5
    - warnings.length * 0.5
    - infos.length * 0.2;
  const healthScore = Math.max(0, Math.min(10, Math.round(rawScore * 10) / 10));
  const scoreColor = healthScore >= 8 ? "#16a34a" : healthScore >= 5 ? "#ca8a04" : "#dc2626";

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Diagnóstico del sistema</h2>
          {lastChecked && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
              Última comprobación: {formatDateTime(lastChecked)}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void fetchDiagnostics()}
          disabled={loading}
          style={{
            borderRadius: 8,
            border: "1px solid var(--brand-primary)",
            background: "var(--brand-primary)",
            color: "#fff",
            padding: "8px 14px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 13,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Comprobando..." : "Ejecutar diagnóstico completo"}
        </button>
      </div>

      {/* Fix message */}
      {fixMessage && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            background: fixMessage.type === "success" ? "#dcfce7" : "#fee2e2",
            color: fixMessage.type === "success" ? "#14532d" : "#991b1b",
            border: `1px solid ${fixMessage.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          {fixMessage.text}
        </div>
      )}

      {/* Summary score cards */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            flex: "1 1 120px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor }}>{healthScore}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Salud del sistema
          </div>
          <div style={{ fontSize: 11, color: "#d1d5db" }}>/ 10</div>
        </div>
        <ScoreCard label="Errores críticos" value={errors.length} color="#dc2626" bg="#fef2f2" />
        <ScoreCard label="Advertencias" value={warnings.length} color="#ca8a04" bg="#fffbeb" />
        <ScoreCard label="Checks superados" value={passedCount} color="#16a34a" bg="#f0fdf4" />
      </div>

      {/* Full checklist */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
          padding: "14px 16px",
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Resultado de checks ({totalChecks})</h3>

        {loading && issues === null ? (
          <div style={{ color: "#9ca3af", fontSize: 13 }}>Ejecutando diagnóstico...</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {ALL_CHECKS.map((check) => {
              const foundIssue = issues?.find((i) => i.id === check.id);
              const passed = !foundIssue;

              return (
                <div
                  key={check.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: passed
                      ? "1px solid #e5e7eb"
                      : `1px solid ${SEVERITY_COLORS[foundIssue!.severity].border}`,
                    background: passed
                      ? "#f9fafb"
                      : SEVERITY_COLORS[foundIssue!.severity].bg,
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                    {passed ? "" : SEVERITY_ICON[foundIssue!.severity]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: passed ? "#374151" : SEVERITY_COLORS[foundIssue!.severity].color,
                      }}
                    >
                      {passed ? check.passLabel : foundIssue!.title}
                    </div>
                    {!passed && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {foundIssue!.description}
                      </div>
                    )}
                  </div>

                  {/* Action buttons for failed checks */}
                  {!passed && foundIssue && (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {foundIssue.autoFixable && (
                        <button
                          type="button"
                          disabled={autoFixingId === foundIssue.id}
                          onClick={() => void handleAutoFix(foundIssue)}
                          style={smallBtnStyle("#16a34a")}
                        >
                          {autoFixingId === foundIssue.id ? "..." : "✓ Arreglar"}
                        </button>
                      )}
                      {foundIssue.actionLabel && foundIssue.actionPath && (
                        <button
                          type="button"
                          onClick={() => navigate(`${adminPath}/${foundIssue.actionPath}`)}
                          style={smallBtnStyle(SEVERITY_COLORS[foundIssue.severity].color)}
                        >
                          {foundIssue.actionLabel} →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* System info */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
          padding: "14px 16px",
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Información del sistema</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            { label: "Restaurante", value: restaurantName || restaurantId },
            { label: "Conexión", value: navigator.onLine ? " Conectado" : " Sin conexión" },
            { label: "Último pedido recibido", value: lastOrderDate ?? "Sin datos" },
            { label: "Pedidos hoy", value: String(todayOrderCount) },
            { label: "Navegador", value: navigator.userAgent.split(" ").slice(-1)[0] ?? navigator.userAgent },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                padding: "8px 0",
                borderBottom: "1px solid #f3f4f6",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>{label}</span>
              <span
                style={{
                  fontSize: 13,
                  color: "#111827",
                  fontWeight: 500,
                  textAlign: "right",
                  wordBreak: "break-all",
                  maxWidth: "60%",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function smallBtnStyle(color: string): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 5,
    border: `1px solid ${color}`,
    background: "transparent",
    color: color,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}
