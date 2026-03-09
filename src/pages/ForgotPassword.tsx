import { useState } from "react";
import { Link } from "react-router-dom";

import { supabase } from "../lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSent(false);
    setSubmitting(true);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

    if (resetError) {
      setError(resetError.message);
      setSubmitting(false);
      return;
    }

    setSent(true);
    setSubmitting(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#ffffff",
          display: "grid",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, textAlign: "center" }}>Recuperar contraseña</h1>
        <p style={{ margin: 0, color: "#4b5563", fontSize: 14, textAlign: "center" }}>
          Te enviaremos un enlace para restablecer tu contraseña.
        </p>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@tuweb.com"
            required
            style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px" }}
          />
        </label>

        {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 14 }}>{error}</p> : null}
        {sent ? (
          <p style={{ margin: 0, color: "#065f46", fontSize: 14 }}>
            Si el email existe, te hemos enviado un enlace de recuperación.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          style={{
            border: "1px solid #111827",
            borderRadius: 8,
            padding: "10px 12px",
            background: "#111827",
            color: "#fff",
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Enviando..." : "Enviar enlace"}
        </button>

        <Link
          to="/login"
          style={{ textAlign: "center", fontSize: 13, color: "#6b7280", textDecoration: "none" }}
        >
          Volver al login
        </Link>
      </form>
    </div>
  );
}
