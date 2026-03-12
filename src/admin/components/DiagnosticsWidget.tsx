import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { runDiagnostics } from "../services/diagnosticsService";
import type { DiagnosticIssue, DiagnosticSeverity } from "../services/diagnosticsService";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const SEVERITY_CONFIG: Record<DiagnosticSeverity, { icon: string; label: string; bg: string; border: string; color: string; headerBg: string }> = {
  error: {
    icon: "",
    label: "problema(s) crítico(s)",
    bg: "#fef2f2",
    border: "#fecaca",
    color: "#991b1b",
    headerBg: "#fee2e2",
  },
  warning: {
    icon: "",
    label: "advertencia(s)",
    bg: "#fffbeb",
    border: "#fde68a",
    color: "#78350f",
    headerBg: "#fef3c7",
  },
  info: {
    icon: "",
    label: "sugerencia(s)",
    bg: "#eff6ff",
    border: "#bfdbfe",
    color: "#1e40af",
    headerBg: "#dbeafe",
  },
};

type IssueCardProps = {
  issue: DiagnosticIssue;
  adminPath: string;
  onAutoFix: (issue: DiagnosticIssue) => void;
  autoFixing: boolean;
};

function IssueCard({ issue, adminPath, onAutoFix, autoFixing }: IssueCardProps) {
  const navigate = useNavigate();
  const cfg = SEVERITY_CONFIG[issue.severity];

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${cfg.border}`,
        background: cfg.bg,
        padding: "11px 13px",
        display: "grid",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13 }}>{cfg.icon}</span>
        <strong style={{ fontSize: 13, color: cfg.color }}>{issue.title}</strong>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>
        {issue.description}
      </p>

      <p style={{ margin: 0, fontSize: 12, color: "#6b7280", fontStyle: "italic", lineHeight: 1.4 }}>
        {issue.solution}
      </p>

      {(issue.actionLabel || issue.autoFixable) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {issue.autoFixable && (
            <button
              type="button"
              disabled={autoFixing}
              onClick={() => onAutoFix(issue)}
              style={actionBtnStyle("#16a34a", "#dcfce7", "#16a34a")}
            >
              {autoFixing ? "Solucionando..." : "✓ Solucionar automáticamente"}
            </button>
          )}
          {issue.actionLabel && issue.actionPath && (
            <button
              type="button"
              onClick={() => navigate(`${adminPath}/${issue.actionPath}`)}
              style={actionBtnStyle(cfg.color, "transparent", cfg.border)}
            >
              {issue.actionLabel} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SeveritySection({
  severity,
  issues,
  adminPath,
  onAutoFix,
  autoFixingId,
  defaultOpen,
}: {
  severity: DiagnosticSeverity;
  issues: DiagnosticIssue[];
  adminPath: string;
  onAutoFix: (issue: DiagnosticIssue) => void;
  autoFixingId: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = SEVERITY_CONFIG[severity];

  if (issues.length === 0) return null;

  return (
    <div
      style={{
        border: `1px solid ${cfg.border}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 13px",
          background: cfg.headerBg,
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 14 }}>{cfg.icon}</span>
        <strong style={{ fontSize: 13, color: cfg.color, flex: 1 }}>
          {issues.length} {cfg.label}
        </strong>
        <span style={{ fontSize: 12, color: cfg.color, opacity: 0.7 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: "10px 12px",
            display: "grid",
            gap: 8,
            background: "#fff",
          }}
        >
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              adminPath={adminPath}
              onAutoFix={onAutoFix}
              autoFixing={autoFixingId === issue.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DiagnosticsWidget() {
  const { restaurantId, adminPath } = useRestaurant();
  const [issues, setIssues] = useState<DiagnosticIssue[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoFixingId, setAutoFixingId] = useState<string | null>(null);
  const [fixMessage, setFixMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const result = await runDiagnostics(restaurantId);
      setIssues(result);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    void fetchDiagnostics();

    intervalRef.current = setInterval(() => {
      void fetchDiagnostics();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
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
        setFixMessage({ type: "error", text: `Error: ${error.message}` });
      } else {
        setFixMessage({ type: "success", text: "✓ Restaurante activado para recibir pedidos." });
        void fetchDiagnostics();
      }

      setAutoFixingId(null);

      // Clear message after 4s
      setTimeout(() => setFixMessage(null), 4000);
    },
    [restaurantId, fetchDiagnostics]
  );

  if (loading && issues === null) {
    return (
      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <strong style={{ fontSize: 14, color: "#111827" }}>Diagnóstico del sistema</strong>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Comprobando...</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#d1d5db",
                display: "inline-block",
                animation: "diag-bounce 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
        <style>{`
          @keyframes diag-bounce {
            0%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-5px); }
          }
        `}</style>
      </div>
    );
  }

  const errors = issues?.filter((i) => i.severity === "error") ?? [];
  const warnings = issues?.filter((i) => i.severity === "warning") ?? [];
  const infos = issues?.filter((i) => i.severity === "info") ?? [];
  const hasIssues = (issues?.length ?? 0) > 0;

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <strong style={{ fontSize: 14, color: "#111827" }}>Diagnóstico del sistema</strong>
        <button
          type="button"
          onClick={() => void fetchDiagnostics()}
          disabled={loading}
          style={{
            fontSize: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            background: "#fff",
            color: "#374151",
            padding: "4px 10px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 500,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {/* Fix message */}
      {fixMessage && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 10,
            background: fixMessage.type === "success" ? "#dcfce7" : "#fee2e2",
            color: fixMessage.type === "success" ? "#14532d" : "#991b1b",
            border: `1px solid ${fixMessage.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          {fixMessage.text}
        </div>
      )}

      {/* All good */}
      {!hasIssues && !loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 13px",
            background: "#dcfce7",
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            color: "#14532d",
          }}
        >
          <span></span>
          <span>Todo funciona correctamente</span>
        </div>
      )}

      {/* Sections */}
      {hasIssues && (
        <div style={{ display: "grid", gap: 8 }}>
          <SeveritySection
            severity="error"
            issues={errors}
            adminPath={adminPath}
            onAutoFix={handleAutoFix}
            autoFixingId={autoFixingId}
            defaultOpen
          />
          <SeveritySection
            severity="warning"
            issues={warnings}
            adminPath={adminPath}
            onAutoFix={handleAutoFix}
            autoFixingId={autoFixingId}
            defaultOpen
          />
          <SeveritySection
            severity="info"
            issues={infos}
            adminPath={adminPath}
            onAutoFix={handleAutoFix}
            autoFixingId={autoFixingId}
            defaultOpen={false}
          />
        </div>
      )}
    </div>
  );
}

const panelStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: "14px 16px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
};

function actionBtnStyle(color: string, bg: string, borderColor: string): CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${borderColor}`,
    background: bg,
    color: color,
    cursor: "pointer",
  };
}
