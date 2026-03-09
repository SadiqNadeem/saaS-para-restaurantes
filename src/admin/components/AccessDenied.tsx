import { useNavigate } from "react-router-dom";

export default function AccessDenied() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "80px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48, lineHeight: 1 }}>🔒</div>
      <h2
        style={{
          margin: 0,
          fontSize: 20,
          fontWeight: 700,
          color: "var(--admin-text-primary, #111827)",
        }}
      >
        Acceso restringido
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: "var(--admin-text-secondary, #6b7280)",
          maxWidth: 360,
          lineHeight: 1.5,
        }}
      >
        No tienes permisos para acceder a esta sección.
        Contacta con el owner del restaurante.
      </p>
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{
          marginTop: 4,
          padding: "8px 18px",
          borderRadius: 8,
          border: "1px solid var(--admin-card-border, #e5e7eb)",
          background: "#fff",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          color: "var(--admin-text-primary, #111827)",
        }}
      >
        Volver
      </button>
    </div>
  );
}
