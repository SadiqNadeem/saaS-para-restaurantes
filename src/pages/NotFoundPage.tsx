import { Link } from "react-router-dom";

export default function NotFoundPage() {
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
      <div style={{ textAlign: "center", display: "grid", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 72, fontWeight: 700, color: "#e5e7eb" }}>404</h1>
        <p style={{ margin: 0, fontSize: 18, color: "#374151" }}>Página no encontrada</p>
        <p style={{ margin: 0, color: "#6b7280" }}>La ruta que buscas no existe.</p>
        <Link
          to="/"
          style={{
            marginTop: 8,
            color: "#4ec580",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
