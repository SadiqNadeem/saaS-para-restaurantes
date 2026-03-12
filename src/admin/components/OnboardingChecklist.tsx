import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

const HIDDEN_KEY = "onboarding_checklist_hidden";

type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  done: boolean;
  link: string | null;
};

export function OnboardingChecklist() {
  const { restaurantId, adminPath, menuPath } = useRestaurant();
  const [hidden, setHidden] = useState(() => {
    try { return Boolean(localStorage.getItem(HIDDEN_KEY)); } catch { return false; }
  });
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasProducts, setHasProducts] = useState(false);
  const [hasOpenHours, setHasOpenHours] = useState(false);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [productsRes, hoursRes, settingsRes] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true),
        supabase
          .from("restaurant_hours")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("is_open", true),
        supabase
          .from("restaurant_settings")
          .select("is_accepting_orders")
          .eq("restaurant_id", restaurantId)
          .maybeSingle(),
      ]);
      if (!alive) return;
      setHasProducts((productsRes.count ?? 0) > 0);
      setHasOpenHours((hoursRes.count ?? 0) > 0);
      const s = settingsRes.data as { is_accepting_orders?: boolean | null } | null;
      setIsAcceptingOrders(s?.is_accepting_orders === true);
      setLoaded(true);
    };
    void load();
    return () => { alive = false; };
  }, [restaurantId]);

  if (!loaded || hidden) return null;

  const items: ChecklistItem[] = [
    {
      id: "created",
      label: "Restaurante creado",
      description: "Tu restaurante ya está registrado en la plataforma.",
      done: true,
      link: null,
    },
    {
      id: "products",
      label: "Añade tu primer producto",
      description: "Crea al menos un producto activo para tu carta.",
      done: hasProducts,
      link: `${adminPath}/products`,
    },
    {
      id: "hours",
      label: "Configura tu horario",
      description: "Define en qué horas aceptas pedidos.",
      done: hasOpenHours,
      link: `${adminPath}/settings`,
    },
    {
      id: "accepting",
      label: "Activa los pedidos online",
      description: "Activa el interruptor para empezar a recibir pedidos.",
      done: isAcceptingOrders,
      link: `${adminPath}/settings`,
    },
    {
      id: "qr",
      label: "Descarga el QR de tu mesa",
      description: "Genera el QR para que los clientes accedan a tu carta.",
      done: false,
      link: `${adminPath}/settings`,
    },
    {
      id: "public",
      label: "Prueba tu carta pública",
      description: "Visita tu carta pública y comprueba que todo está correcto.",
      done: false,
      link: menuPath,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const allDone = completedCount === items.length;

  const handleHide = () => {
    try { localStorage.setItem(HIDDEN_KEY, "1"); } catch {}
    setHidden(true);
  };

  return (
    <div
      style={{
        border: "1px solid var(--brand-primary-border, rgba(78,197,128,0.45))",
        borderLeftWidth: 3,
        borderLeftColor: "var(--brand-primary, #4ec580)",
        background: "var(--brand-primary-soft, rgba(78,197,128,0.08))",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: collapsed ? 0 : 12,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 14, color: "#111827" }}>
              Configura tu restaurante
            </strong>
            <span style={{ fontSize: 12, color: "#6b7280" }}>{collapsed ? "▸" : "▾"}</span>
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-primary, #17212B)",
              background: "#fff",
              border: "1px solid var(--brand-primary-border)",
              borderRadius: 999,
              padding: "2px 10px",
            }}
          >
            {completedCount}/{items.length}
          </span>
          {allDone && (
            <button
              type="button"
              onClick={handleHide}
              style={{
                background: "none",
                border: "none",
                color: "#9ca3af",
                cursor: "pointer",
                fontSize: 12,
                textDecoration: "underline",
              }}
            >
              Ocultar
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#374151" }}>
            Completa estos pasos para empezar a recibir pedidos
          </p>

          <div
            style={{
              height: 4,
              background: "rgba(255,255,255,0.6)",
              borderRadius: 4,
              overflow: "hidden",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(completedCount / items.length) * 100}%`,
                background: "var(--color-primary, #17212B)",
                borderRadius: 4,
                transition: "width 0.4s ease",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: item.done ? "none" : "1.5px solid #d1d5db",
                    background: item.done ? "var(--color-success, #16a34a)" : "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 10,
                    color: "#fff",
                    fontWeight: 900,
                  }}
                >
                  {item.done ? "✓" : ""}
                </span>
                {!item.done && item.link ? (
                  <Link
                    to={item.link}
                    style={{
                      flex: 1,
                      color: "#111827",
                      fontWeight: 600,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    style={{
                      flex: 1,
                      color: item.done ? "#6b7280" : "#111827",
                      fontWeight: item.done ? 400 : 600,
                      textDecoration: item.done ? "line-through" : "none",
                    }}
                  >
                    {item.label}
                  </span>
                )}
                {!item.done && item.link && (
                  <Link
                    to={item.link}
                    style={{
                      fontSize: 12,
                      color: "var(--color-accent, #3b82f6)",
                      fontWeight: 600,
                    }}
                  >
                    →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
