import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { maybeCreateRestaurantFromPendingSignup } from "../auth/pendingSignup";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const redirectedRef = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const next = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get("next")?.trim();
    return value && value.startsWith("/") ? value : null;
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("verified") === "1") {
      setInfo("Email verificado correctamente. Ya puedes iniciar sesión.");
    }
  }, [location.search]);

  useEffect(() => {
    if (!loading && session && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate(next ?? "/", { replace: true });
    }
  }, [loading, navigate, next, session]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      const code = String((signInError as { code?: string }).code ?? "").toLowerCase();
      const message = signInError.message.toLowerCase();

      if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
        setError("Tu email aún no está verificado. Revisa tu correo y confirma tu cuenta antes de entrar.");
      } else {
        setError(signInError.message);
      }

      setSubmitting(false);
      return;
    }

    redirectedRef.current = true;

    const pendingResult = await maybeCreateRestaurantFromPendingSignup(email.trim());
    if (pendingResult.status === "created" && !next) {
      navigate(
        `/onboarding?restaurant=${pendingResult.slug}&name=${encodeURIComponent(pendingResult.restaurantName)}`,
        { replace: true }
      );
      return;
    }

    navigate(next ?? "/", { replace: true });
  };

  if (loading) {
    return <div style={{ padding: 24 }}>Cargando...</div>;
  }

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
          maxWidth: 360,
          display: "grid",
          gap: 12,
          padding: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#ffffff",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Login</h1>

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

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="********"
            required
            style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px" }}
          />
        </label>

        {info ? <p style={{ margin: 0, color: "#065f46", fontSize: 13 }}>{info}</p> : null}
        {error ? <p style={{ margin: 0, color: "#b91c1c" }}>{error}</p> : null}

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
          {submitting ? "Entrando..." : "Entrar"}
        </button>

        <div style={{ display: "grid", gap: 8, justifyItems: "center", paddingTop: 4 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
            ¿No tienes cuenta?{" "}
            <Link to="/register" style={{ color: "#111827", fontWeight: 600, textDecoration: "none" }}>
              Regístrate
            </Link>
          </p>
          <Link to="/forgot-password" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            ¿Has olvidado tu contraseña?
          </Link>
        </div>
      </form>
    </div>
  );
}
