import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Identifica dónde ocurrió el error (aparece en logs y en el stack de desarrollo) */
  context?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// ─── Fallback UI ──────────────────────────────────────────────────────────────

const CONTEXT_MESSAGES: Record<string, string> = {
  admin:    "Algo ha ido mal en el panel. Tus datos están seguros.",
  pos:      "Error en la caja. Recarga para continuar.",
  checkout: "Error al procesar. Tu pedido no se ha realizado.",
  orders:   "Error al cargar pedidos. Intenta recargar.",
  root:     "Error inesperado. Por favor recarga la página.",
};

function DefaultFallback({
  context,
  error,
  onReset,
}: {
  context?: string;
  error?: Error;
  onReset: () => void;
}) {
  const message =
    (context && CONTEXT_MESSAGES[context]) ?? CONTEXT_MESSAGES.root;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 240,
        padding: "32px 24px",
        gap: 16,
        textAlign: "center",
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontSize: 40, lineHeight: 1 }}>⚠️</div>

      <p
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: "#111827",
          maxWidth: 360,
        }}
      >
        {message}
      </p>

      {/* Stack trace — solo en desarrollo */}
      {import.meta.env.DEV && error && (
        <pre
          style={{
            margin: 0,
            padding: "12px 16px",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 8,
            fontSize: 12,
            color: "#991b1b",
            textAlign: "left",
            maxWidth: 560,
            maxHeight: 200,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={onReset}
          style={{
            padding: "8px 20px",
            background: "var(--brand-primary, #4ec580)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 20px",
            background: "transparent",
            color: "var(--admin-text-secondary, #6b7280)",
            border: "1px solid var(--admin-card-border, #e5e7eb)",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Recargar página
        </button>
      </div>
    </div>
  );
}

// ─── ErrorBoundary class ──────────────────────────────────────────────────────

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const ctx = this.props.context ?? "unknown";

    // Desarrollo: log completo en consola
    if (import.meta.env.DEV) {
      console.error(`[ErrorBoundary:${ctx}]`, error, info.componentStack);
    }

    // Producción: reportar a Sentry si está configurado.
    // Para activar:
    //   1. npm install @sentry/react
    //   2. Añadir VITE_SENTRY_DSN al .env.local y configurar en Sentry.init()
    //   3. Descomentar las líneas siguientes:
    //
    // import * as Sentry from "@sentry/react";
    // Sentry.captureException(error, {
    //   extra: { context: ctx, componentStack: info.componentStack },
    // });
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <DefaultFallback
        context={this.props.context}
        error={this.state.error}
        onReset={this.reset}
      />
    );
  }
}
