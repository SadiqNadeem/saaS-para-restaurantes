import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { useAdminMembership } from "../components/AdminMembershipContext";

type LoyaltyCustomer = {
  id: string;
  customer_phone: string;
  total_points: number;
  total_earned: number;
  total_redeemed: number;
  updated_at: string;
};

type LoyaltyTx = {
  id: string;
  customer_phone: string;
  order_id: string | null;
  type: "earn" | "redeem";
  points: number;
  created_at: string;
};

type LoyaltySettings = {
  loyalty_enabled: boolean;
  loyalty_points_per_eur: number;
  loyalty_min_redeem: number;
  loyalty_redeem_value: number;
};

export default function AdminLoyaltyPage() {
  const { restaurantId, adminPath } = useRestaurant();
  const { canManage } = useAdminMembership();

  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"customers" | "transactions">("customers");
  const [adjustPhone, setAdjustPhone] = useState("");
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustType, setAdjustType] = useState<"earn" | "redeem">("earn");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  // Settings edit state
  const [editEnabled, setEditEnabled] = useState(false);
  const [editPointsPerEur, setEditPointsPerEur] = useState("10");
  const [editMinRedeem, setEditMinRedeem] = useState("100");
  const [editRedeemValue, setEditRedeemValue] = useState("1.00");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    const [settingsRes, customersRes, txRes] = await Promise.all([
      supabase
        .from("restaurant_settings")
        .select("loyalty_enabled, loyalty_points_per_eur, loyalty_min_redeem, loyalty_redeem_value")
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
      supabase
        .from("customer_loyalty")
        .select("id, customer_phone, total_points, total_earned, total_redeemed, updated_at")
        .eq("restaurant_id", restaurantId)
        .order("total_points", { ascending: false })
        .limit(100),
      supabase
        .from("loyalty_transactions")
        .select("id, customer_phone, order_id, type, points, created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (settingsRes.data) {
      const s = settingsRes.data as LoyaltySettings;
      setSettings(s);
      setEditEnabled(s.loyalty_enabled === true);
      setEditPointsPerEur(String(s.loyalty_points_per_eur ?? 10));
      setEditMinRedeem(String(s.loyalty_min_redeem ?? 100));
      setEditRedeemValue(Number(s.loyalty_redeem_value ?? 1).toFixed(2));
    }
    setCustomers((customersRes.data ?? []) as LoyaltyCustomer[]);
    setTransactions((txRes.data ?? []) as LoyaltyTx[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const handleAdjust = async () => {
    const phone = adjustPhone.trim();
    const pts = Math.round(Number(adjustPoints));
    if (!phone || !pts || pts < 1) {
      setAdjustError("Introduce teléfono y puntos válidos.");
      return;
    }
    setAdjusting(true);
    setAdjustError(null);
    setAdjustSuccess(null);

    // Upsert customer_loyalty
    const { data: existing } = await supabase
      .from("customer_loyalty")
      .select("id, total_points, total_earned, total_redeemed")
      .eq("restaurant_id", restaurantId)
      .eq("customer_phone", phone)
      .maybeSingle();

    const currentPoints = (existing as LoyaltyCustomer | null)?.total_points ?? 0;
    const currentEarned = (existing as LoyaltyCustomer | null)?.total_earned ?? 0;
    const currentRedeemed = (existing as LoyaltyCustomer | null)?.total_redeemed ?? 0;

    if (adjustType === "redeem" && pts > currentPoints) {
      setAdjustError(`Puntos insuficientes. El cliente tiene ${currentPoints} pts.`);
      setAdjusting(false);
      return;
    }

    const newPoints = adjustType === "earn" ? currentPoints + pts : currentPoints - pts;
    const newEarned = adjustType === "earn" ? currentEarned + pts : currentEarned;
    const newRedeemed = adjustType === "redeem" ? currentRedeemed + pts : currentRedeemed;

    const [upsertRes, txRes] = await Promise.all([
      supabase.from("customer_loyalty").upsert(
        {
          restaurant_id: restaurantId,
          customer_phone: phone,
          total_points: newPoints,
          total_earned: newEarned,
          total_redeemed: newRedeemed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "restaurant_id,customer_phone" }
      ),
      supabase.from("loyalty_transactions").insert({
        restaurant_id: restaurantId,
        customer_phone: phone,
        type: adjustType,
        points: pts,
      }),
    ]);

    if (upsertRes.error ?? txRes.error) {
      setAdjustError((upsertRes.error ?? txRes.error)?.message ?? "Error al ajustar puntos.");
    } else {
      setAdjustSuccess(`${adjustType === "earn" ? "Añadidos" : "Canjeados"} ${pts} pts para ${phone}.`);
      setAdjustPhone("");
      setAdjustPoints("");
      void load();
    }
    setAdjusting(false);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsError(null);
    setSettingsSaved(false);

    const ptsPerEur = Math.max(1, Math.round(Number(editPointsPerEur) || 10));
    const minRedeem = Math.max(1, Math.round(Number(editMinRedeem) || 100));
    const redeemVal = Math.max(0.01, Number(editRedeemValue) || 1);

    const { error } = await supabase
      .from("restaurant_settings")
      .update({
        loyalty_enabled: editEnabled,
        loyalty_points_per_eur: ptsPerEur,
        loyalty_min_redeem: minRedeem,
        loyalty_redeem_value: redeemVal,
      })
      .eq("restaurant_id", restaurantId);

    if (error) {
      setSettingsError(error.message);
    } else {
      setSettingsSaved(true);
      setSettings({
        loyalty_enabled: editEnabled,
        loyalty_points_per_eur: ptsPerEur,
        loyalty_min_redeem: minRedeem,
        loyalty_redeem_value: redeemVal,
      });
      setTimeout(() => setSettingsSaved(false), 3000);
    }
    setSavingSettings(false);
  };

  const ptsPreview = Math.round(Number(editPointsPerEur || 10) * 20);
  const eurPreview = (Number(editRedeemValue || 1) * (Number(editMinRedeem || 100) / 100)).toFixed(2);

  return (
    <div className="admin-panel" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--admin-text-primary)" }}>
          Fidelización
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--admin-text-secondary)", fontSize: 14 }}>
          Programa de puntos — configura y gestiona desde aquí
        </p>
      </div>

      {/* ── Settings panel ── */}
      <div
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          borderRadius: "var(--admin-radius-md)",
          padding: "20px 22px",
          boxShadow: "var(--admin-card-shadow)",
          display: "grid",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--admin-text-primary)" }}>
            Configuración del programa
          </h3>
          {/* Toggle activo/inactivo */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: canManage ? "pointer" : "default",
              userSelect: "none",
            }}
          >
            <div
              onClick={() => canManage && setEditEnabled((v) => !v)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: editEnabled ? "var(--brand-primary, #4ec580)" : "#d1d5db",
                position: "relative",
                transition: "background 0.2s",
                cursor: canManage ? "pointer" : "default",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 3,
                  left: editEnabled ? 23 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  transition: "left 0.2s",
                }}
              />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: editEnabled ? "var(--brand-hover, #2e8b57)" : "var(--admin-text-secondary, #6b7280)" }}>
              {editEnabled ? "Programa activo" : "Programa inactivo"}
            </span>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          {/* Puntos por euro */}
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-text-primary)" }}>
              Puntos por € gastado
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={editPointsPerEur}
              onChange={(e) => setEditPointsPerEur(e.target.value)}
              disabled={!canManage}
              style={{
                border: "1px solid var(--admin-card-border)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                fontWeight: 600,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
              Un pedido de 20 € genera <strong>{ptsPreview} pts</strong>
            </span>
          </div>

          {/* Mínimo para canjear */}
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-text-primary)" }}>
              Mínimo para canjear (pts)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={editMinRedeem}
              onChange={(e) => setEditMinRedeem(e.target.value)}
              disabled={!canManage}
              style={{
                border: "1px solid var(--admin-card-border)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                fontWeight: 600,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
              El cliente necesita al menos <strong>{editMinRedeem} pts</strong> para canjear
            </span>
          </div>

          {/* Valor del canje */}
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-text-primary)" }}>
              Valor del canje (€ por 100 pts)
            </label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={editRedeemValue}
              onChange={(e) => setEditRedeemValue(e.target.value)}
              disabled={!canManage}
              style={{
                border: "1px solid var(--admin-card-border)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                fontWeight: 600,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
              Con {editMinRedeem} pts el cliente obtiene <strong>{eurPreview} € de descuento</strong>
            </span>
          </div>
        </div>

        {canManage && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={() => void handleSaveSettings()}
              disabled={savingSettings}
              style={{
                background: "var(--brand-primary, #4ec580)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "9px 20px",
                fontWeight: 700,
                fontSize: 14,
                cursor: savingSettings ? "not-allowed" : "pointer",
              }}
            >
              {savingSettings ? "Guardando..." : "Guardar configuración"}
            </button>
            {settingsSaved && (
              <span style={{ fontSize: 13, color: "var(--brand-hover, #2e8b57)", fontWeight: 600 }}>
                ✓ Guardado
              </span>
            )}
            {settingsError && (
              <span style={{ fontSize: 13, color: "#991b1b" }}>{settingsError}</span>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      {settings && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {[
            { label: "Clientes con puntos", value: customers.length },
            { label: "Pts por € gastado", value: settings.loyalty_points_per_eur },
            { label: "Mín. para canjear", value: `${settings.loyalty_min_redeem} pts` },
            { label: "Valor del canje", value: `${Number(settings.loyalty_redeem_value).toFixed(2)} € / 100 pts` },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "var(--admin-card-bg)",
                border: "1px solid var(--admin-card-border)",
                borderRadius: "var(--admin-radius-sm)",
                padding: "14px 16px",
                boxShadow: "var(--admin-card-shadow)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--admin-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-text-primary)" }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual adjust */}
      {canManage && (
        <div
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "var(--admin-radius-md)",
            padding: "18px 20px",
            boxShadow: "var(--admin-card-shadow)",
            display: "grid",
            gap: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--admin-text-primary)" }}>
            Ajuste manual de puntos
          </h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--admin-text-secondary)", fontWeight: 500 }}>Teléfono</label>
              <input
                type="tel"
                value={adjustPhone}
                onChange={(e) => setAdjustPhone(e.target.value)}
                placeholder="+34 600000000"
                style={{
                  border: "1px solid var(--admin-card-border)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                  minWidth: 160,
                }}
              />
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--admin-text-secondary)", fontWeight: 500 }}>Puntos</label>
              <input
                type="number"
                min={1}
                value={adjustPoints}
                onChange={(e) => setAdjustPoints(e.target.value)}
                placeholder="50"
                style={{
                  border: "1px solid var(--admin-card-border)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                  width: 90,
                }}
              />
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--admin-text-secondary)", fontWeight: 500 }}>Tipo</label>
              <select
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value as "earn" | "redeem")}
                style={{
                  border: "1px solid var(--admin-card-border)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                }}
              >
                <option value="earn">Añadir</option>
                <option value="redeem">Canjear</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void handleAdjust()}
              disabled={adjusting}
              style={{
                background: "var(--brand-primary)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontWeight: 600,
                fontSize: 13,
                cursor: adjusting ? "not-allowed" : "pointer",
              }}
            >
              {adjusting ? "Guardando..." : "Aplicar"}
            </button>
          </div>
          {adjustError && <div style={{ fontSize: 13, color: "#991b1b" }}>{adjustError}</div>}
          {adjustSuccess && <div style={{ fontSize: 13, color: "var(--brand-hover)" }}>{adjustSuccess}</div>}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--admin-card-border)", paddingBottom: 0 }}>
        {(["customers", "transactions"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              border: "none",
              borderBottom: tab === t ? "2px solid var(--brand-primary)" : "2px solid transparent",
              background: "transparent",
              padding: "8px 16px",
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? "var(--brand-hover)" : "var(--admin-text-secondary)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {t === "customers" ? `Clientes (${customers.length})` : `Transacciones (${transactions.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "var(--admin-text-muted)", fontSize: 14 }}>Cargando...</div>
      ) : tab === "customers" ? (
        <div
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "var(--admin-radius-md)",
            boxShadow: "var(--admin-card-shadow)",
            overflow: "hidden",
          }}
        >
          {customers.length === 0 ? (
            <div style={{ padding: "24px", color: "var(--admin-text-muted)", textAlign: "center" }}>
              Aún no hay clientes con puntos
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--admin-card-border)", background: "#f8fafc" }}>
                  <th style={thStyle}>Teléfono</th>
                  <th style={thStyle}>Puntos actuales</th>
                  <th style={thStyle}>Total ganados</th>
                  <th style={thStyle}>Total canjeados</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--admin-card-border)" }}>
                    <td style={tdStyle}>{c.customer_phone}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "var(--brand-hover)" }}>
                      {c.total_points} pts
                    </td>
                    <td style={tdStyle}>{c.total_earned} pts</td>
                    <td style={tdStyle}>{c.total_redeemed} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "var(--admin-radius-md)",
            boxShadow: "var(--admin-card-shadow)",
            overflow: "hidden",
          }}
        >
          {transactions.length === 0 ? (
            <div style={{ padding: "24px", color: "var(--admin-text-muted)", textAlign: "center" }}>
              Aún no hay transacciones
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--admin-card-border)", background: "#f8fafc" }}>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Teléfono</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Puntos</th>
                  <th style={thStyle}>Pedido</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: "1px solid var(--admin-card-border)" }}>
                    <td style={tdStyle}>
                      {new Date(tx.created_at).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td style={tdStyle}>{tx.customer_phone}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: tx.type === "earn" ? "rgba(78,197,128,0.14)" : "#fef3c7",
                          color: tx.type === "earn" ? "var(--brand-hover)" : "#92400e",
                        }}
                      >
                        {tx.type === "earn" ? "Ganado" : "Canjeado"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {tx.type === "earn" ? "+" : "-"}{tx.points} pts
                    </td>
                    <td style={tdStyle}>
                      {tx.order_id ? (
                        <a
                          href={`${adminPath}/orders/${tx.order_id}`}
                          style={{ color: "var(--brand-hover)", textDecoration: "none", fontWeight: 500 }}
                        >
                          #{tx.order_id.slice(0, 8).toUpperCase()}
                        </a>
                      ) : (
                        <span style={{ color: "var(--admin-text-muted)" }}>Manual</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 600,
  color: "var(--admin-text-secondary)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
  padding: "11px 14px",
  color: "var(--admin-text-primary)",
};
