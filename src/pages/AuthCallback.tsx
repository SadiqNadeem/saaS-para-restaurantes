import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAdminRestaurantStore } from "../admin/context/AdminRestaurantContext";
import { maybeCreateRestaurantFromPendingSignup } from "../auth/pendingSignup";
import { supabase } from "../lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { refresh } = useAdminRestaurantStore();
  const redirectedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const authError = search.get("error_description") ?? search.get("error");
    if (authError) {
      setError(authError);
      return;
    }

    const redirectWithSession = async () => {
      if (redirectedRef.current) return;

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      if (data.session) {
        redirectedRef.current = true;
        const pendingResult = await maybeCreateRestaurantFromPendingSignup(data.session.user.email);
        if (pendingResult.status === "created") {
          refresh();
          navigate("/admin", { replace: true });
          return;
        }
        navigate("/admin", { replace: true });
        return;
      }

      redirectedRef.current = true;
      navigate("/login?verified=1", { replace: true });
    };

    void redirectWithSession();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        void redirectWithSession();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [navigate, refresh]);

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
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#ffffff",
          padding: 20,
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Verificando cuenta</h1>
        <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
          {error ?? "Procesando verificación de email..."}
        </p>
      </div>
    </div>
  );
}
