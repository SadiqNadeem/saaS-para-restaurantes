import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasSession(Boolean(data.session));
      setCheckingSession(false);
    };

    void loadSession();

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setHasSession(Boolean(nextSession));
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setUpdated(false);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setUpdated(true);
    setSubmitting(false);
    setPassword("");
    setConfirmPassword("");
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
      <div
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
        <h1 style={{ margin: 0, fontSize: 22, textAlign: "center" }}>Nueva contraseña</h1>

        {checkingSession ? (
          <p style={{ margin: 0, color: "#6b7280", textAlign: "center" }}>Validando enlace...</p>
        ) : null}

        {!checkingSession && !hasSession ? (
          <>
            <p style={{ margin: 0, color: "#b91c1c", fontSize: 14, textAlign: "center" }}>
              El enlace no es válido o ha expirado. Solicita uno nuevo.
            </p>
            <Link
              to="/forgot-password"
              style={{ textAlign: "center", fontSize: 13, color: "#111827", textDecoration: "none" }}
            >
              Solicitar nuevo enlace
            </Link>
          </>
        ) : null}

        {!checkingSession && hasSession ? (
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Nueva contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Confirmar contraseña</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px" }}
              />
            </label>

            {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 14 }}>{error}</p> : null}
            {updated ? (
              <p style={{ margin: 0, color: "#065f46", fontSize: 14 }}>
                Contraseña actualizada correctamente. Ya puedes iniciar sesión.
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
              {submitting ? "Actualizando..." : "Actualizar contraseña"}
            </button>

            <Link
              to="/login"
              style={{ textAlign: "center", fontSize: 13, color: "#6b7280", textDecoration: "none" }}
            >
              Ir al login
            </Link>
          </form>
        ) : null}
      </div>
    </div>
  );
}
