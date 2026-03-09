import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "#f8fafc",
      }}
    >
      <div style={{ textAlign: "center", display: "grid", gap: 20, maxWidth: 520 }}>
        <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700, color: "#111827" }}>
          Bienvenido al SaaS de Restaurantes
        </h1>
        <p style={{ margin: 0, fontSize: 16, color: "#6b7280", lineHeight: 1.6 }}>
          Gestiona tu restaurante, pedidos, menú y equipo desde un solo lugar.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            to="/login"
            style={{
              padding: "12px 28px",
              background: "#4ec580",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            Iniciar sesión
          </Link>
          <Link
            to="/register"
            style={{
              padding: "12px 28px",
              border: "1px solid #e5e7eb",
              background: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              color: "#111827",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            Registrarse
          </Link>
        </div>
      </div>
    </div>
  );
}
