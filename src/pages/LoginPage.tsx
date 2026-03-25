import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next") ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    navigate(next, { replace: true });
  };

  return (
    <div style={s.page}>
      <form onSubmit={onSubmit} style={s.card} noValidate>
        <h1 style={s.h1}>Iniciar sesión</h1>

        <label style={s.field}>
          <span style={s.label}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@tuweb.com"
            required
            disabled={submitting}
            style={s.input}
          />
        </label>

        <label style={s.field}>
          <span style={s.label}>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={submitting}
            style={s.input}
          />
        </label>

        {error ? <p role="alert" style={s.error}>{error}</p> : null}

        <button type="submit" disabled={submitting} style={{ ...s.btn, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>

        <Link to="/forgot-password" style={s.link}>¿Olvidaste tu contraseña?</Link>

        <p style={s.footer}>
          ¿No tienes cuenta?{" "}
          <Link to="/register" style={{ ...s.link, fontWeight: 600 }}>Crear restaurante</Link>
        </p>
      </form>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    background: "#f5f5f7",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxSizing: "border-box" as const,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)",
    padding: "32px 28px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  },
  h1: {
    margin: "0 0 8px",
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
    textAlign: "center" as const,
    letterSpacing: "-0.3px",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 5,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
  },
  input: {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    color: "#111827",
    background: "#ffffff",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  btn: {
    marginTop: 4,
    border: "1px solid #111827",
    borderRadius: 8,
    padding: "11px 12px",
    background: "#111827",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  error: {
    margin: 0,
    fontSize: 13,
    color: "#b91c1c",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 6,
    padding: "8px 10px",
  },
  link: {
    textAlign: "center" as const,
    fontSize: 13,
    color: "#6b7280",
    textDecoration: "none",
  },
  footer: {
    margin: 0,
    textAlign: "center" as const,
    fontSize: 13,
    color: "#6b7280",
  },
} as const;
