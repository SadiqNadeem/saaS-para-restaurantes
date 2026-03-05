import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";

export default function SuperAdminGate({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [profileLoading, setProfileLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!session?.user?.id) {
      setAllowed(false);
      setProfileLoading(false);
      return;
    }

    let alive = true;

    const load = async () => {
      // Try the is_superadmin() RPC first (single round-trip, no column ambiguity)
      const rpc = await supabase.rpc("is_superadmin");

      if (!alive) return;

      if (!rpc.error && typeof rpc.data === "boolean") {
        setAllowed(rpc.data);
        setProfileLoading(false);
        return;
      }

      // Fallback: single profile query using id (FK to auth.users)
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle<{ role: string }>();

      if (!alive) return;

      setAllowed(String(data?.role ?? "").toLowerCase() === "superadmin");
      setProfileLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [authLoading, session?.user?.id]);

  if (authLoading || profileLoading) {
    return <div style={{ padding: 16 }}>Cargando...</div>;
  }

  if (!allowed) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
