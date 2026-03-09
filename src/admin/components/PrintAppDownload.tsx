type ConnectionStatus = "idle" | "ok" | "error";

type PrintAppDownloadProps = {
  localPrintUrl: string;
  onTestConnection: () => void;
  testingConnection: boolean;
  connectionStatus: ConnectionStatus;
};

export function PrintAppDownload({
  localPrintUrl,
  onTestConnection,
  testingConnection,
  connectionStatus,
}: PrintAppDownloadProps) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "14px 16px",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>
          Configuración paso a paso
        </div>
        <ol
          style={{
            margin: 0,
            paddingLeft: 20,
            display: "grid",
            gap: 5,
            fontSize: 13,
            color: "#374151",
          }}
        >
          <li>Descarga la app de impresión para Windows (próximamente disponible)</li>
          <li>Instálala en el PC conectado a la impresora térmica</li>
          <li>Abre la app — se ejecuta en segundo plano en la bandeja del sistema</li>
          <li>Haz clic en "Probar conexión" aquí para verificar que está activa</li>
        </ol>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onTestConnection}
          disabled={testingConnection}
          style={{
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            cursor: testingConnection ? "not-allowed" : "pointer",
            opacity: testingConnection ? 0.7 : 1,
          }}
        >
          {testingConnection ? "Probando..." : "Probar conexión"}
        </button>

        {connectionStatus === "ok" && (
          <span
            style={{
              fontSize: 13,
              color: "#15803d",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>✓</span> Conectado
          </span>
        )}
        {connectionStatus === "error" && (
          <span style={{ fontSize: 13, color: "#dc2626" }}>
            Sin conexión — asegúrate de que la app está abierta
          </span>
        )}
      </div>

      <div
        style={{
          background: "#fefce8",
          border: "1px solid #fde047",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "#713f12",
        }}
      >
        <strong>¿Por qué necesito una app?</strong> Los navegadores no pueden acceder
        directamente a impresoras USB o de red. La app actúa como puente local entre el
        navegador y tu impresora térmica, permitiendo impresión automática sin popups.
      </div>

      <div style={{ fontSize: 12, color: "#9ca3af" }}>
        URL local:{" "}
        <code
          style={{
            background: "#f3f4f6",
            padding: "2px 5px",
            borderRadius: 4,
            fontFamily: "monospace",
          }}
        >
          {localPrintUrl}
        </code>
      </div>
    </div>
  );
}
