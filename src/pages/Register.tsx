import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAdminRestaurantStore } from "../admin/context/AdminRestaurantContext";
import { useAuth } from "../auth/AuthContext";
import { maybeCreateRestaurantFromPendingSignup, savePendingSignup } from "../auth/pendingSignup";
import { normalizeSignupPlan } from "../auth/signupPlan";
import { supabase } from "../lib/supabase";

type Step = "form" | "submitting" | "check_email" | "error";

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const {
    restaurantId: adminRestaurantId,
    restaurants: adminRestaurants,
    isSuperadmin,
    loading: adminRestaurantLoading,
    refresh,
  } = useAdminRestaurantStore();
  const redirectedRef = useRef(false);

  const selectedPlan = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeSignupPlan(params.get("plan"));
  }, [location.search]);

  const [step, setStep] = useState<Step>("form");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [restaurantName, setRestaurantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (authLoading || adminRestaurantLoading || !session || redirectedRef.current) {
      return;
    }

    const hasRestaurant = isSuperadmin || Boolean(adminRestaurantId) || adminRestaurants.length > 0;
    if (hasRestaurant) {
      redirectedRef.current = true;
      navigate("/admin", { replace: true });
    }
  }, [adminRestaurantId, adminRestaurantLoading, adminRestaurants.length, authLoading, isSuperadmin, navigate, session]);

  const validate = (): string | null => {
    if (!restaurantName.trim()) return "El nombre del restaurante es obligatorio.";
    if (!email.trim()) return "El email es obligatorio.";
    if (password.length < 8) return "La contrasena debe tener al menos 8 caracteres.";
    if (password !== confirmPassword) return "Las contrasenas no coinciden.";
    return null;
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg(null);

    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setStep("submitting");

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setErrorMsg(`Error ${signUpError.status ?? ""}: ${signUpError.message}`);
      setStep("error");
      return;
    }

    savePendingSignup({
      email: email.trim(),
      restaurantName: restaurantName.trim(),
      plan: selectedPlan,
    });

    if (signUpData.session) {
      const pendingResult = await maybeCreateRestaurantFromPendingSignup(email.trim());
      if (pendingResult.status === "error") {
        setErrorMsg(pendingResult.message);
        setStep("error");
        return;
      }
      refresh();
      if (pendingResult.status === "created") {
        const name = encodeURIComponent(pendingResult.restaurantName);
        navigate(`/onboarding?restaurant=${pendingResult.slug}&name=${name}`, { replace: true });
      } else {
        navigate("/admin", { replace: true });
      }
      return;
    }

    setStep("check_email");
  };

  if (authLoading) {
    return <PageShell><p style={s.muted}>Cargando...</p></PageShell>;
  }

  if (step === "check_email") {
    return (
      <PageShell>
        <Card>
          <div style={s.icon}>Verifica email</div>
          <h1 style={s.h1}>Revisa tu email</h1>
          <p style={{ ...s.muted, textAlign: "center", lineHeight: 1.6 }}>
            Te hemos enviado un email de verificacion a <strong>{email}</strong>.
            Revisa tu correo para activar tu cuenta.
          </p>
          <p style={{ ...s.muted, textAlign: "center" }}>
            Plan seleccionado: <strong>{selectedPlan.toUpperCase()}</strong>
          </p>
          <Link to="/login" style={s.link}>Ir al login</Link>
        </Card>
      </PageShell>
    );
  }

  const busy = step === "submitting";

  return (
    <PageShell>
      <Card>
        <a
          href={(import.meta.env.VITE_LANDING_URL as string | undefined) ?? "/"}
          style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          ← Volver a la web
        </a>
        <div style={s.header}>
          <a
            href={(import.meta.env.VITE_LANDING_URL as string | undefined) ?? "/"}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div style={s.logo}>Kebab</div>
          </a>
          <h1 style={s.h1}>Crea tu restaurante</h1>
          <p style={s.subtitle}>Rellena los datos para empezar.</p>
          <p style={s.planBadge}>Plan: {selectedPlan.toUpperCase()}</p>
        </div>

        <form onSubmit={onSubmit} style={s.form} noValidate>
          <Field label="Nombre del restaurante">
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Kebab Los Pinos"
              required
              disabled={busy}
              style={s.input}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@miweb.com"
              required
              disabled={busy}
              style={s.input}
            />
          </Field>

          <Field label="Contrasena">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimo 8 caracteres"
              required
              disabled={busy}
              style={s.input}
            />
          </Field>

          <Field label="Confirmar contrasena">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contrasena"
              required
              disabled={busy}
              style={s.input}
            />
          </Field>

          {(step === "error" || errorMsg) && errorMsg ? (
            <p role="alert" style={s.error}>{errorMsg}</p>
          ) : null}

          <button type="submit" disabled={busy} style={{ ...s.btn, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>

        <p style={s.footer}>
          Ya tienes cuenta?{" "}
          <Link to="/login" style={s.link}>Iniciar sesion</Link>
        </p>
      </Card>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={s.page}>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={s.card}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={s.field}>
      <span style={s.label}>{label}</span>
      {children}
    </label>
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
    gap: 0,
  },
  header: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
    textAlign: "center" as const,
  },
  logo: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
  },
  h1: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
    letterSpacing: "-0.3px",
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    color: "#6b7280",
  },
  planBadge: {
    margin: "4px 0 0",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "#111827",
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: 999,
    padding: "4px 10px",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
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
    transition: "border-color 0.15s",
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
    transition: "background 0.15s",
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
  footer: {
    marginTop: 20,
    textAlign: "center" as const,
    fontSize: 13,
    color: "#6b7280",
  },
  link: {
    color: "#111827",
    fontWeight: 600,
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  muted: {
    color: "#6b7280",
    fontSize: 14,
    margin: 0,
  },
  icon: {
    fontSize: 24,
    textAlign: "center" as const,
    marginBottom: 8,
  },
} as const;
