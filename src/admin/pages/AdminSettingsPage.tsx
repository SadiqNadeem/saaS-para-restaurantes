import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { HelpTooltip } from "../components/HelpTooltip";
import {
  buildOrderConfirmationMessage,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "../../lib/whatsapp/whatsappService";

import { PrintingSection } from "../components/settings/PrintingSection";
import { useAdminMembership } from "../components/AdminMembershipContext";
import { PaymentMethodToggle } from "../components/settings/PaymentMethodToggle";
import { SettingsTabs, type SettingsTabId } from "../components/settings/SettingsTabs";
import { StripeConnectCard, type StripeConnectUiStatus } from "../components/settings/StripeConnectCard";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { toDataURL } from "qrcode";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Vite bundler default marker icon issue
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error";
type Toast = { id: number; type: ToastType; message: string };

type SettingsRow = {
  restaurant_id: string;
  is_accepting_orders?: boolean | null;
  delivery_radius_km?: number | null;
  delivery_fee?: number | null;
  delivery_fee_fixed?: number | null;
  delivery_fee_mode?: string | null;
  delivery_fee_base?: number | null;
  delivery_fee_per_km?: number | null;
  delivery_fee_min?: number | null;
  delivery_fee_max?: number | null;
  free_delivery_over?: number | null;
  min_order_amount?: number | null;
  allow_cash?: boolean | null;
  allow_card?: boolean | null;
  allow_card_on_delivery?: boolean | null;
  allow_card_online?: boolean | null;
  base_lat?: number | null;
  base_lng?: number | null;
  restaurant_address?: string | null;
  estimated_delivery_minutes?: number | null;
  estimated_pickup_minutes?: number | null;
  loyalty_enabled?: boolean | null;
  loyalty_points_per_eur?: number | null;
  loyalty_min_redeem?: number | null;
  loyalty_redeem_value?: number | null;
  print_mode?: string | null;
  auto_print_web_orders?: boolean | null;
  auto_print_pos_orders?: boolean | null;
  print_on_new_order?: boolean | null;
  print_on_accept?: boolean | null;
  kitchen_printer_name?: string | null;
  customer_printer_name?: string | null;
  print_width?: string | null;
  rawbt_enabled?: boolean | null;
  local_print_url?: string | null;
  desktop_app_url?: string | null;
  print_kitchen_separate?: boolean | null;
  print_sound_enabled?: boolean | null;
  print_retry_enabled?: boolean | null;
  auto_print_on_accept?: boolean | null;
  auto_print_pos?: boolean | null;
  whatsapp_phone?: string | null;
  whatsapp_enabled?: boolean | null;
  whatsapp_message_template?: string | null;
  whatsapp_provider?: string | null;
};

type HourRow = {
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
};

type RestaurantRow = {
  id: string;
  name: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  stripe_account_id?: string | null;
  stripe_connected?: boolean | null;
  stripe_charges_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  stripe_onboarding_completed?: boolean | null;
  stripe_connect_status?: string | null;
  online_payment_enabled?: boolean | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Monday-first ordering */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const DAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

const DEFAULT_DAY: Omit<HourRow, "day_of_week"> = {
  is_open: false,
  open_time: "09:00",
  close_time: "23:00",
};

const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string }> = [
  { id: "general", label: "General" },
  { id: "delivery", label: "Reparto" },
  { id: "payments", label: "Pagos" },
  { id: "hours", label: "Horarios" },
  { id: "zone", label: "Zona" },
  { id: "qr", label: "QR" },
  { id: "seo", label: "SEO" },
  { id: "loyalty", label: "Fidelizacion" },
  { id: "printing", label: "Impresion" },
];

const STRIPE_PLATFORM_CONFIGURED =
  import.meta.env.VITE_STRIPE_ENABLED === "true" &&
  String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim().length > 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTime(val: string | null | undefined, fallback: string): string {
  const match = String(val ?? "").match(/^(\d{2}:\d{2})/);
  return match ? match[1] : fallback;
}

function toDayMap(rows: HourRow[]): Record<number, HourRow> {
  const map: Record<number, HourRow> = {};
  for (let d = 0; d <= 6; d++) {
    map[d] = { day_of_week: d, ...DEFAULT_DAY };
  }
  for (const row of rows) {
    if (row.day_of_week >= 0 && row.day_of_week <= 6) {
      map[row.day_of_week] = {
        day_of_week: row.day_of_week,
        is_open: row.is_open,
        open_time: normalizeTime(row.open_time, DEFAULT_DAY.open_time),
        close_time: normalizeTime(row.close_time, DEFAULT_DAY.close_time),
      };
    }
  }
  return map;
}

function isMissingColumnError(message: string | undefined): boolean {
  return String(message ?? "").toLowerCase().includes("column");
}

function getStripeUiStatus(params: {
  platformConfigured: boolean;
  stripeConnected: boolean;
  stripeOnboardingCompleted: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeConnectStatus: string;
}): StripeConnectUiStatus {
  if (!params.platformConfigured) return "platform_not_configured";
  if (params.stripeConnected && params.stripeOnboardingCompleted && params.stripeChargesEnabled && params.stripePayoutsEnabled) {
    return "active";
  }
  if (params.stripeConnected && !params.stripeOnboardingCompleted) return "onboarding_pending";
  if (params.stripeConnected && !params.stripeChargesEnabled) return "connected_not_chargeable";
  if (params.stripeConnected || params.stripeConnectStatus === "connected") return "connected";
  return "not_connected";
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => { if (!disabled) onChange(!checked); }}
      style={{
        width: 52,
        height: 30,
        borderRadius: 999,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--brand-primary)" : "#d1d5db",
        position: "relative",
        flexShrink: 0,
        transition: "background 0.2s",
        opacity: disabled ? 0.55 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 25 : 3,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.18s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          display: "block",
        }}
      />
    </button>
  );
}

function SaveButton({
  onClick,
  saving,
  disabled,
  label = "Guardar cambios",
}: {
  onClick: () => void;
  saving: boolean;
  disabled: boolean;
  label?: string;
}) {
  const isDisabled = disabled || saving;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      style={{
        background: isDisabled ? "#9ca3af" : "var(--brand-primary)",
        color: "#fff",
        border: "none",
        borderRadius: 10,
        padding: "9px 16px",
        fontWeight: 700,
        fontSize: 14,
        cursor: isDisabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        transition: "background 0.15s",
      }}
    >
      {saving && (
        <span
          style={{
            width: 13,
            height: 13,
            border: "2px solid rgba(255,255,255,0.35)",
            borderTop: "2px solid #fff",
            borderRadius: "50%",
            display: "inline-block",
            animation: "settings-spin 0.8s linear infinite",
          }}
        />
      )}
      {saving ? "Guardando..." : label}
    </button>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <article
      style={{
        background: "#fff",
        border: "1px solid #dbe5ef",
        borderRadius: 16,
        boxShadow: "0 10px 22px rgba(15,23,42,0.07)",
        padding: "20px 20px",
        display: "grid",
        gap: 18,
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "var(--admin-text-primary)",
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--admin-text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </article>
  );
}

function Field({
  label,
  hint,
  tooltip,
  children,
}: {
  label: string;
  hint?: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)", display: "inline-flex", alignItems: "center" }}>
        {label}
        {hint && (
          <span
            style={{
              fontWeight: 400,
              color: "var(--admin-text-secondary)",
              marginLeft: 5,
            }}
          >
            {hint}
          </span>
        )}
        {tooltip && <HelpTooltip text={tooltip} />}
      </span>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--admin-card-border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  color: "var(--admin-text-primary)",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

// ─── Map components ───────────────────────────────────────────────────────────

function MapClickHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function DraggableMarker({
  position,
  onMove,
}: {
  position: LatLngExpression;
  onMove: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const { lat, lng } = marker.getLatLng();
          onMove(lat, lng);
        }
      },
    }),
    [onMove]
  );
  return <Marker draggable eventHandlers={eventHandlers} position={position} ref={markerRef} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const { canManage } = useAdminMembership();
  const { restaurantId, slug, menuPath } = useRestaurant();
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");

  const [loading, setLoading] = useState(true);

  // Estado del restaurante
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [savingAccepting, setSavingAccepting] = useState(false);

  // Información general
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantAddress, setRestaurantAddress] = useState("");
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Delivery
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState("5");
  const [deliveryFeeMode, setDeliveryFeeMode] = useState("fixed");
  const [deliveryFeeFixed, setDeliveryFeeFixed] = useState("0");
  const [deliveryFeeBase, setDeliveryFeeBase] = useState("0");
  const [deliveryFeePerKm, setDeliveryFeePerKm] = useState("0");
  const [deliveryFeeMin, setDeliveryFeeMin] = useState("0");
  const [deliveryFeeMax, setDeliveryFeeMax] = useState("9999");
  const [freeDeliveryOver, setFreeDeliveryOver] = useState("0");
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [savingDelivery, setSavingDelivery] = useState(false);

  // Pagos
  const [allowCash, setAllowCash] = useState(true);
  const [allowCardOnDelivery, setAllowCardOnDelivery] = useState(false);
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState(false);
  const [stripeColumnsAvailable, setStripeColumnsAvailable] = useState(true);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState(false);
  const [stripePayoutsEnabled, setStripePayoutsEnabled] = useState(false);
  const [stripeOnboardingCompleted, setStripeOnboardingCompleted] = useState(false);
  const [stripeConnectStatus, setStripeConnectStatus] = useState("");
  const [savingPayments, setSavingPayments] = useState(false);

  // Horario
  const [hoursByDay, setHoursByDay] = useState<Record<number, HourRow>>(() => toDayMap([]));
  const [savingHoursAll, setSavingHoursAll] = useState(false);
  const [savingDay, setSavingDay] = useState<number | null>(null);

  // Zona de reparto
  const [baseLat, setBaseLat] = useState("");
  const [baseLng, setBaseLng] = useState("");
  const [savingZone, setSavingZone] = useState(false);
  const [geolocating, setGeolocating] = useState(false);

  // Tiempos estimados
  const [estimatedDeliveryMins, setEstimatedDeliveryMins] = useState("30");
  const [estimatedPickupMins, setEstimatedPickupMins] = useState("15");

  // Loyalty
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyPointsPerEur, setLoyaltyPointsPerEur] = useState("10");
  const [loyaltyMinRedeem, setLoyaltyMinRedeem] = useState("100");
  const [loyaltyRedeemValue, setLoyaltyRedeemValue] = useState("1.00");
  const [savingLoyalty, setSavingLoyalty] = useState(false);

  // SEO
  const [seoMetaTitle, setSeoMetaTitle] = useState("");
  const [seoMetaDesc, setSeoMetaDesc] = useState("");
  const [seoOgImage, setSeoOgImage] = useState("");
  const [savingSEO, setSavingSEO] = useState(false);

  // Impresión
  const [printMode, setPrintMode] = useState<"browser" | "desktop_app">("browser");
  const [autoPrintPosOrders, setAutoPrintPosOrders] = useState(false);
  const [printOnNewOrder, setPrintOnNewOrder] = useState(false);
  const [printOnAccept, setPrintOnAccept] = useState(false);
  const [kitchenPrinterName, setKitchenPrinterName] = useState("");
  const [customerPrinterName, setCustomerPrinterName] = useState("");
  const [printWidth, setPrintWidth] = useState<"58mm" | "80mm">("80mm");
  const [rawbtEnabled, setRawbtEnabled] = useState(false);
  const [desktopAppUrl, setDesktopAppUrl] = useState("http://127.0.0.1:18181");
  const [printKitchenSeparate, setPrintKitchenSeparate] = useState(false);
  const [printSoundEnabled, setPrintSoundEnabled] = useState(true);
  const [printRetryEnabled, setPrintRetryEnabled] = useState(true);
  const [savingPrinting, setSavingPrinting] = useState(false);

  // WhatsApp
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [whatsappProvider, setWhatsappProvider] = useState<"link" | "twilio" | "360dialog">("link");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  // QR
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrMenuUrl, setQrMenuUrl] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeqRef = useRef(0);
  const [hasPendingVisual, setHasPendingVisual] = useState(false);

  const pushToast = useCallback((type: ToastType, message: string) => {
    if (type === "success") setHasPendingVisual(false);
    toastSeqRef.current += 1;
    const id = toastSeqRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const isSavingAny =
    savingAccepting ||
    savingGeneral ||
    savingDelivery ||
    savingPayments ||
    savingHoursAll ||
    savingDay !== null ||
    savingZone ||
    savingSEO ||
    savingLoyalty ||
    savingPrinting ||
    savingWhatsapp;

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);

    // Restaurant name + SEO
    let restaurantRes = await supabase
      .from("restaurants")
      .select(
        "id, name, meta_title, meta_description, og_image_url, stripe_account_id, stripe_connected, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_completed, stripe_connect_status, online_payment_enabled"
      )
      .eq("id", restaurantId)
      .maybeSingle<RestaurantRow>();

    if (restaurantRes.error && isMissingColumnError(restaurantRes.error.message)) {
      setStripeColumnsAvailable(false);
      restaurantRes = await supabase
        .from("restaurants")
        .select("id, name, meta_title, meta_description, og_image_url")
        .eq("id", restaurantId)
        .maybeSingle<RestaurantRow>();
    } else {
      setStripeColumnsAvailable(true);
    }

    const loadedOnlinePaymentEnabled = restaurantRes.data?.online_payment_enabled === true;

    if (restaurantRes.data) {
      setRestaurantName(restaurantRes.data.name ?? "");
      setSeoMetaTitle(restaurantRes.data.meta_title ?? "");
      setSeoMetaDesc(restaurantRes.data.meta_description ?? "");
      setSeoOgImage(restaurantRes.data.og_image_url ?? "");
      setStripeAccountId(restaurantRes.data.stripe_account_id ?? null);
      setStripeConnected(restaurantRes.data.stripe_connected === true);
      setStripeChargesEnabled(restaurantRes.data.stripe_charges_enabled === true);
      setStripePayoutsEnabled(restaurantRes.data.stripe_payouts_enabled === true);
      setStripeOnboardingCompleted(restaurantRes.data.stripe_onboarding_completed === true);
      setStripeConnectStatus(String(restaurantRes.data.stripe_connect_status ?? ""));
      setOnlinePaymentEnabled(loadedOnlinePaymentEnabled);
    }

    // Settings
    const settingsRes = await supabase
      .from("restaurant_settings")
      .select(
        "restaurant_id, is_accepting_orders, delivery_radius_km, delivery_fee, delivery_fee_fixed, delivery_fee_mode, delivery_fee_base, delivery_fee_per_km, delivery_fee_min, delivery_fee_max, free_delivery_over, min_order_amount, allow_cash, allow_card, allow_card_on_delivery, allow_card_online, base_lat, base_lng, restaurant_address, estimated_delivery_minutes, estimated_pickup_minutes, loyalty_enabled, loyalty_points_per_eur, loyalty_min_redeem, loyalty_redeem_value, print_mode, auto_print_web_orders, auto_print_pos_orders, print_on_new_order, print_on_accept, kitchen_printer_name, customer_printer_name, print_width, rawbt_enabled, local_print_url, desktop_app_url, print_kitchen_separate, print_sound_enabled, print_retry_enabled, auto_print_on_accept, auto_print_pos, whatsapp_phone, whatsapp_enabled, whatsapp_message_template, whatsapp_provider"
      )
      .eq("restaurant_id", restaurantId)
      .maybeSingle<SettingsRow>();

    if (settingsRes.error) {
      pushToast("error", `Error cargando ajustes: ${settingsRes.error.message}`);
      setLoading(false);
      return;
    }

    const s = settingsRes.data;
    if (s) {
      setIsAcceptingOrders(s.is_accepting_orders !== false);
      setRestaurantAddress(s.restaurant_address ?? "");
      setDeliveryRadiusKm(String(toNum(s.delivery_radius_km, 5)));
      setDeliveryFeeMode(s.delivery_fee_mode ?? "fixed");
      const fee =
        typeof s.delivery_fee === "number"
          ? s.delivery_fee
          : typeof s.delivery_fee_fixed === "number"
            ? s.delivery_fee_fixed
            : 0;
      setDeliveryFeeFixed(String(fee));
      setDeliveryFeeBase(String(toNum(s.delivery_fee_base, 0)));
      setDeliveryFeePerKm(String(toNum(s.delivery_fee_per_km, 0)));
      setDeliveryFeeMin(String(toNum(s.delivery_fee_min, 0)));
      setDeliveryFeeMax(String(toNum(s.delivery_fee_max, 9999)));
      setFreeDeliveryOver(String(toNum(s.free_delivery_over, 0)));
      setMinOrderAmount(String(toNum(s.min_order_amount, 0)));
      setAllowCash(s.allow_cash !== false);
      setAllowCardOnDelivery(s.allow_card_on_delivery === true);
      setBaseLat(s.base_lat != null ? String(s.base_lat) : "");
      setBaseLng(s.base_lng != null ? String(s.base_lng) : "");
      setEstimatedDeliveryMins(String(toNum(s.estimated_delivery_minutes, 30)));
      setEstimatedPickupMins(String(toNum(s.estimated_pickup_minutes, 15)));
      setLoyaltyEnabled(s.loyalty_enabled === true);
      setLoyaltyPointsPerEur(String(toNum(s.loyalty_points_per_eur, 10)));
      setLoyaltyMinRedeem(String(toNum(s.loyalty_min_redeem, 100)));
      setLoyaltyRedeemValue(String(toNum(s.loyalty_redeem_value, 1)));
      setPrintMode(s.print_mode === "desktop_app" ? "desktop_app" : "browser");
      // Reconcile old/new column names for print-on-new-order
      setPrintOnNewOrder(s.print_on_new_order === true || s.auto_print_web_orders === true);
      // Reconcile old/new column names for print-on-accept
      setPrintOnAccept(s.auto_print_on_accept === true || s.print_on_accept === true);
      // Reconcile old/new column names for POS auto-print
      setAutoPrintPosOrders(s.auto_print_pos === true || s.auto_print_pos_orders === true);
      setKitchenPrinterName(s.kitchen_printer_name ?? "");
      setCustomerPrinterName(s.customer_printer_name ?? "");
      setPrintWidth(s.print_width === "58mm" ? "58mm" : "80mm");
      setRawbtEnabled(s.rawbt_enabled === true);
      const baseUrl = s.desktop_app_url
        ?? (s.local_print_url ? s.local_print_url.replace(/\/print\/?$/, "") : "http://127.0.0.1:18181");
      setDesktopAppUrl(baseUrl);
      setPrintKitchenSeparate(s.print_kitchen_separate === true);
      setPrintSoundEnabled(s.print_sound_enabled !== false);
      setPrintRetryEnabled(s.print_retry_enabled !== false);
      setWhatsappEnabled(s.whatsapp_enabled === true);
      setWhatsappPhone(s.whatsapp_phone ?? "");
      setWhatsappTemplate(
        s.whatsapp_message_template && s.whatsapp_message_template.trim()
          ? s.whatsapp_message_template
          : DEFAULT_WHATSAPP_TEMPLATE
      );
      setWhatsappProvider(
        (s.whatsapp_provider as "link" | "twilio" | "360dialog" | null | undefined) === "twilio"
          ? "twilio"
          : (s.whatsapp_provider as "link" | "twilio" | "360dialog" | null | undefined) === "360dialog"
            ? "360dialog"
            : "link"
      );
    } else {
      // No row yet — insert defaults
      await supabase
        .from("restaurant_settings")
        .upsert(
          { restaurant_id: restaurantId, is_accepting_orders: true, allow_cash: true },
          { onConflict: "restaurant_id" }
        );
    }

    // Hours
    const hoursRes = await supabase
      .from("restaurant_hours")
      .select("day_of_week, is_open, open_time, close_time")
      .eq("restaurant_id", restaurantId)
      .order("day_of_week", { ascending: true });

    if (!hoursRes.error) {
      const rows: HourRow[] = (hoursRes.data ?? []).map((r) => ({
        day_of_week: Number(r.day_of_week),
        is_open: Boolean(r.is_open),
        open_time: normalizeTime(r.open_time as string | null, DEFAULT_DAY.open_time),
        close_time: normalizeTime(r.close_time as string | null, DEFAULT_DAY.close_time),
      }));
      setHoursByDay(toDayMap(rows));
    }

    setLoading(false);
  }, [restaurantId, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSave = canManage && !loading;
  const stripeUiStatus = useMemo(
    () =>
      getStripeUiStatus({
        platformConfigured: STRIPE_PLATFORM_CONFIGURED,
        stripeConnected,
        stripeOnboardingCompleted,
        stripeChargesEnabled,
        stripePayoutsEnabled,
        stripeConnectStatus,
      }),
    [
      stripeChargesEnabled,
      stripeConnectStatus,
      stripeConnected,
      stripeOnboardingCompleted,
      stripePayoutsEnabled,
    ]
  );
  const stripeIsActive = stripeUiStatus === "active";
  const onlinePaymentToggleEnabled = canSave && stripeColumnsAvailable && stripeIsActive;
  const onlinePaymentHelperText =
    !stripeColumnsAvailable
      ? "Actualiza tu base de datos para habilitar pagos online."
      : !STRIPE_PLATFORM_CONFIGURED
        ? "Stripe aun no esta configurado por la plataforma."
        : !stripeIsActive
          ? "Conecta y activa tu cuenta Stripe para habilitar pagos online."
          : "Activo en la web del restaurante.";
  const stripeAccountHelperText = stripeAccountId
    ? `Cuenta conectada: ${stripeAccountId}`
    : "Aun no hay una cuenta Stripe asociada.";

  // ── Save: accepting orders (immediate on toggle) ───────────────────────────

  const saveAcceptingOrders = async (value: boolean) => {
    if (!canSave || savingAccepting) return;
    const previous = isAcceptingOrders;
    setIsAcceptingOrders(value);
    setSavingAccepting(true);
    const { error } = await supabase
      .from("restaurant_settings")
      .upsert(
        { restaurant_id: restaurantId, is_accepting_orders: value },
        { onConflict: "restaurant_id" }
      );
    if (error) {
      setIsAcceptingOrders(previous);
      pushToast("error", `Error: ${error.message}`);
    } else {
      pushToast("success", value ? "Restaurante aceptando pedidos." : "Restaurante pausado.");
    }
    setSavingAccepting(false);
  };

  // ── Save: información general ──────────────────────────────────────────────

  const saveGeneral = async () => {
    if (!canSave || savingGeneral) return;
    setSavingGeneral(true);
    const [nameRes, addrRes] = await Promise.all([
      supabase.from("restaurants").update({ name: restaurantName }).eq("id", restaurantId),
      supabase
        .from("restaurant_settings")
        .upsert(
          { restaurant_id: restaurantId, restaurant_address: restaurantAddress },
          { onConflict: "restaurant_id" }
        ),
    ]);
    if (nameRes.error ?? addrRes.error) {
      pushToast("error", `Error: ${nameRes.error?.message ?? addrRes.error?.message ?? "Error desconocido"}`);
    } else {
      pushToast("success", "Información general guardada.");
    }
    setSavingGeneral(false);
  };

  // ── Save: loyalty ──────────────────────────────────────────────────────────

  const saveLoyalty = async () => {
    if (!canSave || savingLoyalty) return;
    setSavingLoyalty(true);
    const ptsPerEur = Math.max(1, Math.round(Number(loyaltyPointsPerEur)));
    const minRedeem = Math.max(1, Math.round(Number(loyaltyMinRedeem)));
    const redeemVal = Math.max(0.01, Number(loyaltyRedeemValue));
    const { error } = await supabase
      .from("restaurant_settings")
      .upsert(
        {
          restaurant_id: restaurantId,
          loyalty_enabled: loyaltyEnabled,
          loyalty_points_per_eur: ptsPerEur,
          loyalty_min_redeem: minRedeem,
          loyalty_redeem_value: redeemVal,
        },
        { onConflict: "restaurant_id" }
      );
    if (error) {
      pushToast("error", `Error: ${error.message}`);
    } else {
      pushToast("success", "Configuración de fidelización guardada.");
    }
    setSavingLoyalty(false);
  };

  // ── Save: SEO ──────────────────────────────────────────────────────────────

  const saveSEO = async () => {
    if (!canSave || savingSEO) return;
    setSavingSEO(true);
    const { error } = await supabase
      .from("restaurants")
      .update({
        meta_title: seoMetaTitle.trim() || null,
        meta_description: seoMetaDesc.trim() || null,
        og_image_url: seoOgImage.trim() || null,
      })
      .eq("id", restaurantId);
    if (error) {
      pushToast("error", `Error: ${error.message}`);
    } else {
      pushToast("success", "SEO guardado.");
    }
    setSavingSEO(false);
  };

  // ── Save: impresión ────────────────────────────────────────────────────────

  const savePrinting = async () => {
    if (!canSave || savingPrinting) return;
    setSavingPrinting(true);
    const baseUrl = desktopAppUrl.trim() || "http://127.0.0.1:18181";
    const { error } = await supabase
      .from("restaurant_settings")
      .upsert(
        {
          restaurant_id: restaurantId,
          print_mode: printMode,
          auto_print_web_orders: printOnNewOrder,
          auto_print_pos_orders: autoPrintPosOrders,
          print_on_new_order: printOnNewOrder,
          print_on_accept: printOnAccept,
          auto_print_on_accept: printOnAccept,
          auto_print_pos: autoPrintPosOrders,
          kitchen_printer_name: kitchenPrinterName.trim() || null,
          customer_printer_name: customerPrinterName.trim() || null,
          print_width: printWidth,
          rawbt_enabled: rawbtEnabled,
          desktop_app_url: baseUrl,
          local_print_url: `${baseUrl}/print`,
          print_kitchen_separate: printKitchenSeparate,
          print_sound_enabled: printSoundEnabled,
          print_retry_enabled: printRetryEnabled,
        },
        { onConflict: "restaurant_id" }
      );
    if (error) pushToast("error", `Error: ${error.message}`);
    else pushToast("success", "Configuración de impresión guardada.");
    setSavingPrinting(false);
  };

  // ── Save: whatsapp ─────────────────────────────────────────────────────────

  const saveWhatsapp = async () => {
    if (!canSave || savingWhatsapp) return;
    setSavingWhatsapp(true);
    const { error } = await supabase
      .from("restaurant_settings")
      .upsert(
        {
          restaurant_id: restaurantId,
          whatsapp_enabled: whatsappEnabled,
          whatsapp_phone: whatsappPhone.trim() || null,
          whatsapp_message_template: whatsappTemplate.trim() || DEFAULT_WHATSAPP_TEMPLATE,
          whatsapp_provider: whatsappProvider,
        },
        { onConflict: "restaurant_id" }
      );
    if (error) pushToast("error", `Error: ${error.message}`);
    else pushToast("success", "Configuración de WhatsApp guardada.");
    setSavingWhatsapp(false);
  };

  // ── Save: delivery ─────────────────────────────────────────────────────────

  const saveDelivery = async () => {
    if (!canSave || savingDelivery) return;
    const radius = Number(deliveryRadiusKm);
    if (!Number.isFinite(radius) || radius < 0) {
      pushToast("error", "Radio de reparto inválido.");
      return;
    }
    setSavingDelivery(true);
    const { error } = await supabase
      .from("restaurant_settings")
      .upsert(
        {
          restaurant_id: restaurantId,
          delivery_radius_km: radius,
          delivery_fee_mode: deliveryFeeMode,
          delivery_fee: Number(deliveryFeeFixed),
          delivery_fee_fixed: Number(deliveryFeeFixed),
          delivery_fee_base: Number(deliveryFeeBase),
          delivery_fee_per_km: Number(deliveryFeePerKm),
          delivery_fee_min: Number(deliveryFeeMin),
          delivery_fee_max: Number(deliveryFeeMax),
          free_delivery_over: Number(freeDeliveryOver),
          min_order_amount: Number(minOrderAmount),
          estimated_delivery_minutes: Math.max(1, Number(estimatedDeliveryMins) || 30),
          estimated_pickup_minutes: Math.max(1, Number(estimatedPickupMins) || 15),
        },
        { onConflict: "restaurant_id" }
      );
    if (error) pushToast("error", `Error guardando reparto: ${error.message}`);
    else pushToast("success", "Ajustes de reparto guardados.");
    setSavingDelivery(false);
  };

  // ── Save: pagos ────────────────────────────────────────────────────────────

  const savePayments = async () => {
    if (!canSave || savingPayments) return;
    if (!allowCash && !allowCardOnDelivery && !onlinePaymentEnabled) {
      pushToast("error", "Habilita al menos un m\u00e9todo de pago.");
      return;
    }
    setSavingPayments(true);
    const normalizedOnline = stripeIsActive && onlinePaymentEnabled;
    const settingsRes = await supabase
      .from("restaurant_settings")
      .upsert(
        {
          restaurant_id: restaurantId,
          allow_cash: allowCash,
          allow_card: allowCardOnDelivery || normalizedOnline,
          allow_card_on_delivery: allowCardOnDelivery,
          allow_card_online: normalizedOnline,
        },
        { onConflict: "restaurant_id" }
      );
    if (settingsRes.error) {
      pushToast("error", `Error guardando pagos: ${settingsRes.error.message}`);
      setSavingPayments(false);
      return;
    }
    if (stripeColumnsAvailable) {
      const restaurantRes = await supabase
        .from("restaurants")
        .update({ online_payment_enabled: normalizedOnline })
        .eq("id", restaurantId);
      if (restaurantRes.error && isMissingColumnError(restaurantRes.error.message)) {
        setStripeColumnsAvailable(false);
      } else if (restaurantRes.error) {
        pushToast("error", `Error guardando Stripe: ${restaurantRes.error.message}`);
        setSavingPayments(false);
        return;
      }
    }
    pushToast("success", "M\u00e9todos de pago guardados.");
    setSavingPayments(false);
  };

  // ── Save: horarios ─────────────────────────────────────────────────────────

  const saveHoursRows = async (rows: HourRow[]) => {
    const payload = rows.map((r) => ({
      restaurant_id: restaurantId,
      day_of_week: r.day_of_week,
      is_open: r.is_open,
      open_time: r.is_open ? r.open_time : null,
      close_time: r.is_open ? r.close_time : null,
    }));

    const upsertRes = await supabase
      .from("restaurant_hours")
      .upsert(payload, { onConflict: "restaurant_id,day_of_week" });

    if (!upsertRes.error) return;

    // Fallback: update/insert per row
    for (const row of rows) {
      const update = await supabase
        .from("restaurant_hours")
        .update({
          is_open: row.is_open,
          open_time: row.is_open ? row.open_time : null,
          close_time: row.is_open ? row.close_time : null,
        })
        .eq("restaurant_id", restaurantId)
        .eq("day_of_week", row.day_of_week);

      if (update.error) {
        const insert = await supabase.from("restaurant_hours").insert({
          restaurant_id: restaurantId,
          day_of_week: row.day_of_week,
          is_open: row.is_open,
          open_time: row.is_open ? row.open_time : null,
          close_time: row.is_open ? row.close_time : null,
        });
        if (insert.error) throw insert.error;
      }
    }
  };

  const saveSingleDay = async (day: number) => {
    if (!canSave || savingDay !== null || savingHoursAll) return;
    const row = hoursByDay[day];
    if (!row) return;
    if (row.is_open && row.open_time >= row.close_time) {
      pushToast("error", "La hora de apertura debe ser anterior al cierre.");
      return;
    }
    setSavingDay(day);
    try {
      await saveHoursRows([row]);
      pushToast("success", `${DAY_LABELS[day]} guardado.`);
    } catch (e) {
      pushToast("error", `Error: ${String((e as { message?: unknown })?.message ?? "Error")}`);
    } finally {
      setSavingDay(null);
    }
  };

  const saveAllHours = async () => {
    if (!canSave || savingHoursAll || savingDay !== null) return;
    const rows: HourRow[] = DAY_ORDER.map((d) => hoursByDay[d]).filter(
      (r): r is HourRow => r !== undefined
    );
    for (const row of rows) {
      if (row.is_open && row.open_time >= row.close_time) {
        pushToast("error", `Horario inválido en ${DAY_LABELS[row.day_of_week]}.`);
        return;
      }
    }
    setSavingHoursAll(true);
    try {
      await saveHoursRows(rows);
      pushToast("success", "Horario guardado.");
    } catch (e) {
      pushToast("error", `Error: ${String((e as { message?: unknown })?.message ?? "Error")}`);
    } finally {
      setSavingHoursAll(false);
    }
  };

  const copyHoursToAll = (sourceDay: number) => {
    const source = hoursByDay[sourceDay];
    if (!source) return;
    setHoursByDay((prev) => {
      const next = { ...prev };
      for (let d = 0; d <= 6; d++) {
        next[d] = { ...source, day_of_week: d };
      }
      return next;
    });
    pushToast("success", `Horario de ${DAY_LABELS[sourceDay]} copiado a todos los días.`);
  };

  // ── Save: zona de reparto ──────────────────────────────────────────────────

  const saveZone = async () => {
    if (!canSave || savingZone) return;
    const lat = baseLat !== "" ? Number(baseLat) : null;
    const lng = baseLng !== "" ? Number(baseLng) : null;
    if (lat !== null && !Number.isFinite(lat)) {
      pushToast("error", "Latitud inválida.");
      return;
    }
    if (lng !== null && !Number.isFinite(lng)) {
      pushToast("error", "Longitud inválida.");
      return;
    }
    setSavingZone(true);
    const { error } = await supabase
      .from("restaurant_settings")
      .upsert(
        { restaurant_id: restaurantId, base_lat: lat, base_lng: lng },
        { onConflict: "restaurant_id" }
      );
    if (error) pushToast("error", `Error guardando zona: ${error.message}`);
    else pushToast("success", "Zona de reparto guardada.");
    setSavingZone(false);
  };

  // ── QR del menú ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const url = `${window.location.origin}${menuPath}`;
    setQrMenuUrl(url);
    void toDataURL(url, { width: 200, margin: 2, color: { dark: "#111827", light: "#ffffff" } })
      .then(setQrDataUrl);
  }, [menuPath]);

  const downloadQr = () => {
    const a = document.createElement("a");
    a.download = `qr-menu-${slug}.png`;
    a.href = qrDataUrl;
    a.click();
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(qrMenuUrl);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: 60,
          color: "var(--admin-text-secondary)",
          fontSize: 15,
        }}
      >
        Cargando ajustes...
      </div>
    );
  }

  const cannotSave = !canSave;

  return (
    <>
      <style>{`
        @keyframes settings-spin { to { transform: rotate(360deg); } }
        .settings-input:focus-visible {
          border-color: var(--brand-primary) !important;
          box-shadow: 0 0 0 3px var(--brand-primary-soft);
          outline: none;
        }
        .settings-select:focus-visible {
          border-color: var(--brand-primary) !important;
          outline: none;
        }
        .day-row-open { background: var(--brand-primary-soft) !important; border-color: var(--brand-primary-border) !important; }
        .settings-shell { display: grid; gap: 16px; max-width: 1180px; }
        .settings-header {
          border: 1px solid #dbe5ef;
          border-radius: 16px;
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 75%);
          box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
          padding: 16px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .settings-save-indicator {
          border-radius: 999px;
          border: 1px solid #dbe5ef;
          background: #fff;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 700;
          color: #334155;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .payment-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          background: #fff;
          border-radius: 10px;
          border: 1px solid #dbe5ef;
          box-shadow: 0 4px 14px rgba(15,23,42,0.05);
        }
      `}</style>

      <section className="admin-panel settings-shell" onChangeCapture={() => setHasPendingVisual(true)}>
        <header className="settings-header">
          <div style={{ display: "grid", gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 23, fontWeight: 800, color: "#0f172a" }}>Ajustes del restaurante</h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
              Configura reparto, pagos, horarios, QR, SEO e impresion de tu negocio.
            </p>
          </div>
          <div
            className="settings-save-indicator"
            style={{
              borderColor: isSavingAny ? "#bfdbfe" : hasPendingVisual ? "#fcd34d" : "#dbe5ef",
              background: isSavingAny ? "#eff6ff" : hasPendingVisual ? "#fffbeb" : "#fff",
              color: isSavingAny ? "#1d4ed8" : hasPendingVisual ? "#92400e" : "#334155",
            }}
          >
            <span>{isSavingAny ? "Guardando..." : hasPendingVisual ? "Cambios pendientes" : "Guardado"}</span>
          </div>
        </header>

        <SettingsTabs items={SETTINGS_TABS} activeTab={activeTab} onChange={setActiveTab} />

        <section style={{ display: "grid", gap: 16 }}>
        <div style={{ display: activeTab === "general" ? "grid" : "none", gap: 16 }}>
{/* ── Banner: restaurante cerrado ── */}
        {!isAcceptingOrders && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}></span>
            <div>
              <strong style={{ color: "#b91c1c", fontSize: 14 }}>
                Tu restaurante no está aceptando pedidos
              </strong>
              <p style={{ margin: 0, fontSize: 13, color: "#dc2626" }}>
                Los clientes no pueden realizar pedidos en este momento.
              </p>
            </div>
          </div>
        )}

        {/* ── Estado del restaurante ── */}
        <Card
          title="Estado del restaurante"
          subtitle="Activa o pausa los pedidos al instante. El cambio se guarda automáticamente."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Toggle
              checked={isAcceptingOrders}
              onChange={(v) => { void saveAcceptingOrders(v); }}
              disabled={cannotSave || savingAccepting}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--admin-text-primary)" }}>
                {isAcceptingOrders ? "Aceptando pedidos" : "Pausado"}
              </div>
              <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 2 }}>
                {isAcceptingOrders
                  ? "Los clientes pueden realizar pedidos."
                  : "Los clientes no pueden realizar pedidos."}
              </div>
            </div>
            {savingAccepting && (
              <span style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>Guardando...</span>
            )}
          </div>
        </Card>

        {/* ── Información general ── */}
        <Card title="Información general" subtitle="Datos básicos de tu restaurante">
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Nombre del restaurante">
              <input
                className="settings-input"
                type="text"
                value={restaurantName}
                onChange={(e) => { setRestaurantName(e.target.value); }}
                disabled={cannotSave}
                style={inputStyle}
              />
            </Field>
            <Field label="Dirección del restaurante">
              <input
                className="settings-input"
                type="text"
                value={restaurantAddress}
                onChange={(e) => { setRestaurantAddress(e.target.value); }}
                disabled={cannotSave}
                placeholder="Calle, número, ciudad..."
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <SaveButton
              onClick={() => { void saveGeneral(); }}
              saving={savingGeneral}
              disabled={cannotSave}
            />
          </div>
        </Card>

        </div>

        <div style={{ display: activeTab === "delivery" ? "grid" : "none", gap: 16 }}>
        {/* ── Reparto ── */}
        <Card title="Reparto" subtitle="Radio de entrega, tarifas y pedido mínimo">
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Radio de reparto (km)" tooltip="Distancia máxima en km desde tu restaurante hasta la que puedes repartir">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={0.5}
                  value={deliveryRadiusKm}
                  onChange={(e) => { setDeliveryRadiusKm(e.target.value); }}
                  disabled={cannotSave}
                  style={{ accentColor: "var(--brand-primary)", cursor: cannotSave ? "not-allowed" : "pointer" }}
                />
                <input
                  className="settings-input"
                  type="number"
                  min={0}
                  step={0.5}
                  value={deliveryRadiusKm}
                  onChange={(e) => { setDeliveryRadiusKm(e.target.value); }}
                  disabled={cannotSave}
                  style={inputStyle}
                />
              </div>
            </Field>

            <Field label="Modo de gastos de envío">
              <select
                className="settings-select"
                value={deliveryFeeMode}
                onChange={(e) => { setDeliveryFeeMode(e.target.value); }}
                disabled={cannotSave}
                style={{
                  ...inputStyle,
                  background: cannotSave ? "#f9fafb" : "#fff",
                  cursor: cannotSave ? "not-allowed" : "pointer",
                }}
              >
                <option value="fixed">Fijo</option>
                <option value="distance">Por distancia</option>
              </select>
            </Field>

            {deliveryFeeMode === "fixed" ? (
              <Field label="Gastos de envío (€)">
                <input
                  className="settings-input"
                  type="number"
                  min={0}
                  step={0.01}
                  value={deliveryFeeFixed}
                  onChange={(e) => { setDeliveryFeeFixed(e.target.value); }}
                  disabled={cannotSave}
                  style={inputStyle}
                />
              </Field>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Base (€)">
                  <input className="settings-input" type="number" min={0} step={0.01} value={deliveryFeeBase} onChange={(e) => { setDeliveryFeeBase(e.target.value); }} disabled={cannotSave} style={inputStyle} />
                </Field>
                <Field label="Por km (€)">
                  <input className="settings-input" type="number" min={0} step={0.01} value={deliveryFeePerKm} onChange={(e) => { setDeliveryFeePerKm(e.target.value); }} disabled={cannotSave} style={inputStyle} />
                </Field>
                <Field label="Mínimo (€)">
                  <input className="settings-input" type="number" min={0} step={0.01} value={deliveryFeeMin} onChange={(e) => { setDeliveryFeeMin(e.target.value); }} disabled={cannotSave} style={inputStyle} />
                </Field>
                <Field label="Máximo (€)">
                  <input className="settings-input" type="number" min={0} step={0.01} value={deliveryFeeMax} onChange={(e) => { setDeliveryFeeMax(e.target.value); }} disabled={cannotSave} style={inputStyle} />
                </Field>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Envío gratis desde (€)" hint="0 = siempre con coste">
                <input
                  className="settings-input"
                  type="number"
                  min={0}
                  step={0.01}
                  value={freeDeliveryOver}
                  onChange={(e) => { setFreeDeliveryOver(e.target.value); }}
                  disabled={cannotSave}
                  style={inputStyle}
                />
              </Field>
              <Field label="Pedido mínimo (€)" tooltip="Importe mínimo del pedido para poder hacer el checkout. 0 = sin mínimo">
                <input
                  className="settings-input"
                  type="number"
                  min={0}
                  step={0.01}
                  value={minOrderAmount}
                  onChange={(e) => { setMinOrderAmount(e.target.value); }}
                  disabled={cannotSave}
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Tiempo estimado de entrega (min)">
              <input
                className="settings-input"
                type="number"
                min={1}
                max={300}
                step={1}
                value={estimatedDeliveryMins}
                onChange={(e) => { setEstimatedDeliveryMins(e.target.value); }}
                disabled={cannotSave}
                style={inputStyle}
              />
            </Field>
            <Field label="Tiempo estimado de recogida (min)">
              <input
                className="settings-input"
                type="number"
                min={1}
                max={300}
                step={1}
                value={estimatedPickupMins}
                onChange={(e) => { setEstimatedPickupMins(e.target.value); }}
                disabled={cannotSave}
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <SaveButton
              onClick={() => { void saveDelivery(); }}
              saving={savingDelivery}
              disabled={cannotSave}
            />
          </div>
        </Card>

        </div>

        <div style={{ display: activeTab === "payments" ? "grid" : "none", gap: 16 }}>
        {/* ── Métodos de pago ── */}
        <Card title="Metodos de pago" subtitle="Elige que metodos de pago acepta tu restaurante">
          <div style={{ display: "grid", gap: 10 }}>
            <PaymentMethodToggle
              icon="EUR"
              title="Efectivo"
              description="El cliente paga al repartidor en mano."
              action={<Toggle checked={allowCash} onChange={setAllowCash} disabled={cannotSave} />}
            />
            <PaymentMethodToggle
              icon="POS"
              title="Tarjeta en la puerta"
              description="Datafono al entregar el pedido."
              action={<Toggle checked={allowCardOnDelivery} onChange={setAllowCardOnDelivery} disabled={cannotSave} />}
            />
            <StripeConnectCard
              status={stripeUiStatus}
              disabled={!canSave}
              platformMessage="Stripe aun no configurado por la plataforma. Cuando este listo, podras conectar tu cuenta y activar cobros online."
              onPrimaryAction={() => {
                if (!canSave) return;
                if (!STRIPE_PLATFORM_CONFIGURED) {
                  pushToast("error", "Stripe aun no configurado por la plataforma.");
                  return;
                }
                if (stripeUiStatus === "not_connected") {
                  pushToast("success", "Flujo de conexion preparado. Podras conectarlo cuando Stripe este activado.");
                  return;
                }
                if (stripeUiStatus === "onboarding_pending") {
                  pushToast("success", "Onboarding pendiente detectado. Continua cuando Stripe Connect este activo.");
                  return;
                }
                pushToast("success", "Conexion Stripe lista para revisar.");
              }}
              onSecondaryAction={() => {
                if (!canSave) return;
                pushToast("success", "Desconexion preparada para la fase de integracion real.");
              }}
            />
            <PaymentMethodToggle
              icon="WEB"
              title="Permitir pago online en la web"
              description="Activa este metodo para que el cliente pueda pagar online antes de confirmar su pedido."
              action={
                <Toggle
                  checked={onlinePaymentEnabled}
                  onChange={setOnlinePaymentEnabled}
                  disabled={!onlinePaymentToggleEnabled}
                />
              }
              helperText={onlinePaymentHelperText}
            />
            <div
              style={{
                borderRadius: 10,
                border: "1px solid #dbe5ef",
                background: "#f8fafc",
                color: "#475569",
                padding: "10px 12px",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              Para aceptar pagos online, cada restaurante debe conectar su cuenta Stripe. El dinero se ingresa
              directamente en su cuenta Stripe.
              <br />
              {stripeAccountHelperText}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <SaveButton
              onClick={() => { void savePayments(); }}
              saving={savingPayments}
              disabled={cannotSave}
            />
          </div>
        </Card>

        </div>
<div style={{ display: activeTab === "hours" ? "grid" : "none", gap: 16 }}>
        {/* ── Horario de apertura ── */}
        <Card title="Horario de apertura" subtitle="Define los días y horas en que tu restaurante está abierto">
          {/* Day indicators + save all */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {DAY_ORDER.map((d) => {
                const open = hoursByDay[d]?.is_open ?? false;
                return (
                  <span
                    key={d}
                    style={{
                      padding: "3px 9px",
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 500,
                      background: open ? "var(--brand-primary-soft)" : "#f3f4f6",
                      color: open ? "var(--brand-hover)" : "var(--admin-text-muted)",
                      border: `1px solid ${open ? "var(--brand-primary-border)" : "#e5e7eb"}`,
                    }}
                  >
                    {DAY_LABELS[d].slice(0, 2)}
                  </span>
                );
              })}
            </div>
            <SaveButton
              onClick={() => { void saveAllHours(); }}
              saving={savingHoursAll}
              disabled={cannotSave || savingDay !== null}
              label="Guardar todos"
            />
          </div>

          {/* Day rows */}
          <div style={{ display: "grid", gap: 8 }}>
            {DAY_ORDER.map((day) => {
              const row = hoursByDay[day] ?? { day_of_week: day, ...DEFAULT_DAY };
              const isSavingThis = savingDay === day;
              const anyBusy = savingDay !== null || savingHoursAll;

              return (
                <div
                  key={day}
                  className={row.is_open ? "day-row-open" : undefined}
                  style={{
                    border: "1px solid var(--admin-card-border)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    background: "#fafafa",
                    display: "grid",
                    gap: 10,
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Toggle
                        checked={row.is_open}
                        onChange={(v) => {
                          setHoursByDay((prev) => ({
                            ...prev,
                            [day]: { ...row, is_open: v },
                          }));
                        }}
                        disabled={cannotSave}
                      />
                      <strong style={{ fontSize: 14, color: "var(--admin-text-primary)" }}>
                        {DAY_LABELS[day]}
                      </strong>
                      {!row.is_open && (
                        <span style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
                          Cerrado
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => { copyHoursToAll(day); }}
                        title="Copiar este horario a todos los días"
                        style={{
                          background: "none",
                          border: "1px solid var(--admin-card-border)",
                          borderRadius: 6,
                          padding: "4px 9px",
                          fontSize: 12,
                          cursor: "pointer",
                          color: "var(--admin-text-secondary)",
                        }}
                      >
                        Copiar a todos
                      </button>
                      <button
                        type="button"
                        onClick={() => { void saveSingleDay(day); }}
                        disabled={cannotSave || anyBusy}
                        style={{
                          background:
                            cannotSave || anyBusy
                              ? "#e5e7eb"
                              : "var(--brand-primary)",
                          color:
                            cannotSave || anyBusy ? "var(--admin-text-muted)" : "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "4px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: cannotSave || anyBusy ? "not-allowed" : "pointer",
                        }}
                      >
                        {isSavingThis ? "..." : "Guardar"}
                      </button>
                    </div>
                  </div>

                  {row.is_open && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Field label="Apertura">
                        <input
                          type="time"
                          value={row.open_time}
                          onChange={(e) => {
                            setHoursByDay((prev) => ({
                              ...prev,
                              [day]: { ...row, open_time: e.target.value },
                            }));
                          }}
                          style={{ ...inputStyle, background: "#fff" }}
                        />
                      </Field>
                      <Field label="Cierre">
                        <input
                          type="time"
                          value={row.close_time}
                          onChange={(e) => {
                            setHoursByDay((prev) => ({
                              ...prev,
                              [day]: { ...row, close_time: e.target.value },
                            }));
                          }}
                          style={{ ...inputStyle, background: "#fff" }}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        </div>

        <div style={{ display: activeTab === "zone" ? "grid" : "none", gap: 16 }}>
        {/* ── Zona de reparto ── */}
        <Card
          title="Zona de reparto"
          subtitle="Arrastra el pin para marcar la ubicación de tu restaurante. El círculo muestra el radio de entrega."
        >
          {/* Map */}
          {(() => {
            const lat = baseLat !== "" && Number.isFinite(Number(baseLat)) ? Number(baseLat) : 40.4168;
            const lng = baseLng !== "" && Number.isFinite(Number(baseLng)) ? Number(baseLng) : -3.7038;
            const center: [number, number] = [lat, lng];
            const radiusM = Math.max(0, Number(deliveryRadiusKm) || 0) * 1000;

            return (
              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--admin-card-border)" }}>
                <MapContainer
                  center={center}
                  zoom={13}
                  style={{ height: 300, width: "100%" }}
                  key={`${baseLat}-${baseLng}`}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapClickHandler
                    onMove={(newLat, newLng) => {
                      setBaseLat(String(newLat.toFixed(6)));
                      setBaseLng(String(newLng.toFixed(6)));
                    }}
                  />
                  <DraggableMarker
                    position={center}
                    onMove={(newLat, newLng) => {
                      setBaseLat(String(newLat.toFixed(6)));
                      setBaseLng(String(newLng.toFixed(6)));
                    }}
                  />
                  {radiusM > 0 && (
                    <Circle
                      center={center}
                      radius={radiusM}
                      pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.1, weight: 2 }}
                    />
                  )}
                </MapContainer>
              </div>
            );
          })()}

          {/* Geolocation button */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => {
                if (!navigator.geolocation) return;
                setGeolocating(true);
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setBaseLat(String(pos.coords.latitude.toFixed(6)));
                    setBaseLng(String(pos.coords.longitude.toFixed(6)));
                    setGeolocating(false);
                  },
                  () => { setGeolocating(false); }
                );
              }}
              disabled={cannotSave || geolocating}
              style={{
                background: "var(--brand-primary-soft)",
                color: "var(--brand-hover)",
                border: "1px solid var(--brand-primary-border)",
                borderRadius: 8,
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 500,
                cursor: cannotSave || geolocating ? "not-allowed" : "pointer",
                opacity: cannotSave || geolocating ? 0.6 : 1,
              }}
            >
              {geolocating ? "Obteniendo..." : "Usar mi ubicación actual"}
            </button>
          </div>

          {/* Lat/Lng inputs (fallback / precision) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Latitud base">
              <input
                className="settings-input"
                type="number"
                step="0.000001"
                value={baseLat}
                onChange={(e) => { setBaseLat(e.target.value); }}
                placeholder="40.416775"
                disabled={cannotSave}
                style={inputStyle}
              />
            </Field>
            <Field label="Longitud base">
              <input
                className="settings-input"
                type="number"
                step="0.000001"
                value={baseLng}
                onChange={(e) => { setBaseLng(e.target.value); }}
                placeholder="-3.703790"
                disabled={cannotSave}
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <SaveButton
              onClick={() => { void saveZone(); }}
              saving={savingZone}
              disabled={cannotSave}
            />
          </div>
        </Card>

        </div>

        <div style={{ display: activeTab === "qr" ? "grid" : "none", gap: 16 }}>
        {/* ── Código QR del menú ── */}
        <div id="qr-section">
          <Card
            title="Código QR del menú"
            subtitle="Comparte el QR para que los clientes accedan al menú directamente"
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR del menú"
                  style={{ width: 200, height: 200, borderRadius: 8, border: "1px solid var(--admin-card-border)" }}
                />
              ) : (
                <div
                  style={{
                    width: 200,
                    height: 200,
                    borderRadius: 8,
                    border: "1px solid var(--admin-card-border)",
                    background: "#f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--admin-text-muted)",
                    fontSize: 13,
                  }}
                >
                  Generando...
                </div>
              )}
              <span
                style={{
                  fontSize: 13,
                  color: "var(--admin-text-secondary)",
                  wordBreak: "break-all",
                  textAlign: "center",
                  maxWidth: 300,
                }}
              >
                {qrMenuUrl}
              </span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={downloadQr}
                  disabled={!qrDataUrl}
                  style={{
                    background: qrDataUrl ? "var(--brand-primary)" : "#9ca3af",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 18px",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: qrDataUrl ? "pointer" : "not-allowed",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  ↓ Descargar QR
                </button>
                <button
                  type="button"
                  onClick={() => { void copyLink(); }}
                  style={{
                    background: copiedLink ? "#16a34a" : "transparent",
                    color: copiedLink ? "#fff" : "var(--brand-primary)",
                    border: `1.5px solid ${copiedLink ? "#16a34a" : "var(--brand-primary)"}`,
                    borderRadius: 8,
                    padding: "9px 18px",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.2s",
                  }}
                >
                  {copiedLink ? "¡Copiado!" : "Copiar enlace"}
                </button>
              </div>
            </div>
          </Card>
        </div>
        </div>
      </section>

      {/* ── SEO ── */}
      <section style={{ display: "grid", gap: 16 }}>
        <div style={{ display: activeTab === "seo" ? "grid" : "none", gap: 16 }}>
        <Card title="Metadatos SEO" subtitle="Controla cómo aparece tu restaurante en buscadores y redes sociales.">
          <Field
            label="Meta título"
            hint={`(${seoMetaTitle.length}/60)`}
          >
            <input
              style={inputStyle}
              value={seoMetaTitle}
              onChange={(e) => setSeoMetaTitle(e.target.value.slice(0, 60))}
              placeholder={restaurantName || "Nombre del restaurante"}
              maxLength={60}
              disabled={!canManage}
            />
          </Field>
          <Field
            label="Meta descripción"
            hint={`(${seoMetaDesc.length}/160)`}
          >
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
              value={seoMetaDesc}
              onChange={(e) => setSeoMetaDesc(e.target.value.slice(0, 160))}
              placeholder={`Pide online en ${restaurantName || "nuestro restaurante"}. Entrega a domicilio y recogida.`}
              maxLength={160}
              disabled={!canManage}
            />
          </Field>
          <Field label="Imagen OG (og:image)" hint="Recomendado: 1200×630 px — URL de la imagen">
            <input
              style={inputStyle}
              value={seoOgImage}
              onChange={(e) => setSeoOgImage(e.target.value)}
              placeholder="https://..."
              disabled={!canManage}
            />
          </Field>

          {/* Google preview */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Vista previa en Google
            </div>
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "14px 16px",
                maxWidth: 480,
                background: "#fff",
                display: "grid",
                gap: 2,
              }}
            >
              <div style={{ fontSize: 11, color: "#006621", marginBottom: 2 }}>
                {typeof window !== "undefined" ? window.location.hostname : "turestaurante.com"} ›
              </div>
              <div
                style={{
                  fontSize: 18,
                  color: "#1a0dab",
                  fontWeight: 400,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {seoMetaTitle || restaurantName || "Nombre del restaurante"}
              </div>
              <div style={{ fontSize: 13, color: "#545454", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {seoMetaDesc || `Pide online en ${restaurantName || "nuestro restaurante"}. Entrega a domicilio y recogida.`}
              </div>
            </div>
          </div>

          <SaveButton onClick={() => void saveSEO()} saving={savingSEO} disabled={!canSave} />
        </Card>

        </div>

        <div style={{ display: activeTab === "loyalty" ? "grid" : "none", gap: 16 }}>
        {/* ── Fidelización ── */}
        <Card title="Programa de fidelización" subtitle="Recompensa a tus clientes con puntos por cada pedido">
          <Field label="Activar programa de puntos">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Toggle checked={loyaltyEnabled} onChange={setLoyaltyEnabled} disabled={!canManage} />
              <span style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                {loyaltyEnabled ? "Activo — los clientes acumulan puntos" : "Inactivo"}
              </span>
            </div>
          </Field>
          {loyaltyEnabled && (
            <>
              <Field label="Puntos por euro gastado" hint="(ej. 10 pts por cada €1)">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={loyaltyPointsPerEur}
                  onChange={(e) => setLoyaltyPointsPerEur(e.target.value)}
                  disabled={!canManage}
                  style={{ ...inputStyle, maxWidth: 120 }}
                />
              </Field>
              <Field label="Puntos mínimos para canjear" hint="(ej. 100 puntos)">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={loyaltyMinRedeem}
                  onChange={(e) => setLoyaltyMinRedeem(e.target.value)}
                  disabled={!canManage}
                  style={{ ...inputStyle, maxWidth: 120 }}
                />
              </Field>
              <Field label="Valor del canje (€ por 100 pts)" hint="(ej. 1.00 € por 100 pts)">
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={loyaltyRedeemValue}
                  onChange={(e) => setLoyaltyRedeemValue(e.target.value)}
                  disabled={!canManage}
                  style={{ ...inputStyle, maxWidth: 120 }}
                />
              </Field>
              <div
                style={{
                  background: "var(--brand-primary-soft)",
                  border: "1px solid var(--brand-primary-border)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "var(--brand-hover)",
                }}
              >
                Ejemplo: un pedido de 20 € genera {Math.round(Number(loyaltyPointsPerEur) * 20)} pts.
                Con {loyaltyMinRedeem} pts el cliente obtiene {Number(loyaltyRedeemValue).toFixed(2)} € de descuento.
              </div>
            </>
          )}
          <SaveButton onClick={() => void saveLoyalty()} saving={savingLoyalty} disabled={!canSave} />
        </Card>

        </div>

        <div style={{ display: activeTab === "printing" ? "grid" : "none", gap: 16 }}>
          <PrintingSection
            canManage={canManage}
            restaurantName={restaurantName}
            printMode={printMode}
            setPrintMode={setPrintMode}
            desktopAppUrl={desktopAppUrl}
            setDesktopAppUrl={setDesktopAppUrl}
            customerPrinterName={customerPrinterName}
            setCustomerPrinterName={setCustomerPrinterName}
            kitchenPrinterName={kitchenPrinterName}
            setKitchenPrinterName={setKitchenPrinterName}
            printKitchenSeparate={printKitchenSeparate}
            setPrintKitchenSeparate={setPrintKitchenSeparate}
            printWidth={printWidth}
            setPrintWidth={setPrintWidth}
            printOnNewOrder={printOnNewOrder}
            setPrintOnNewOrder={setPrintOnNewOrder}
            printOnAccept={printOnAccept}
            setPrintOnAccept={setPrintOnAccept}
            autoPrintPosOrders={autoPrintPosOrders}
            setAutoPrintPosOrders={setAutoPrintPosOrders}
            printSoundEnabled={printSoundEnabled}
            setPrintSoundEnabled={setPrintSoundEnabled}
            printRetryEnabled={printRetryEnabled}
            setPrintRetryEnabled={setPrintRetryEnabled}
            rawbtEnabled={rawbtEnabled}
            setRawbtEnabled={setRawbtEnabled}
            saving={savingPrinting}
            onSave={() => { void savePrinting(); }}
          />
        </div>

        {/* ── Marketing ── */}
        <div style={{ display: activeTab === "marketing" ? "grid" : "none", gap: 16 }}>

          {/* ── Chatbot de WhatsApp ── */}
          <Card
            title="Chatbot de WhatsApp"
            subtitle="Configura notificaciones por WhatsApp para confirmar pedidos con tus clientes"
          >
            {/* Toggle principal */}
            <Field label="Activar notificaciones WhatsApp">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Toggle
                  checked={whatsappEnabled}
                  onChange={setWhatsappEnabled}
                  disabled={!canSave}
                />
                <span style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                  {whatsappEnabled
                    ? "Activo — los clientes verán el botón de WhatsApp al finalizar su pedido"
                    : "Inactivo"}
                </span>
              </div>
            </Field>

            {whatsappEnabled && (
              <>
                {/* Número del restaurante */}
                <Field
                  label="Número de WhatsApp del restaurante"
                  hint="Con código de país, sin espacios (ej. +34612345678)"
                >
                  <input
                    style={inputStyle}
                    type="tel"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+34 612 345 678"
                    disabled={!canSave}
                  />
                  <span style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 4, display: "block" }}>
                    Los clientes verán este número para confirmar pedidos
                  </span>
                </Field>

                {/* Plantilla del mensaje */}
                <Field label="Plantilla de mensaje al cliente">
                  <textarea
                    style={{ ...inputStyle, resize: "vertical", minHeight: 110, fontFamily: "monospace", fontSize: 13 }}
                    value={whatsappTemplate}
                    onChange={(e) => setWhatsappTemplate(e.target.value)}
                    disabled={!canSave}
                  />
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--admin-text-secondary)",
                      marginTop: 4,
                      lineHeight: 1.6,
                    }}
                  >
                    Variables disponibles:{" "}
                    {[
                      "{order_number}",
                      "{customer_name}",
                      "{total}",
                      "{estimated_time}",
                      "{restaurant_name}",
                      "{items_list}",
                      "{order_type}",
                    ].map((v) => (
                      <code
                        key={v}
                        style={{
                          background: "#f3f4f6",
                          borderRadius: 4,
                          padding: "1px 5px",
                          fontSize: 11,
                          fontFamily: "monospace",
                          marginRight: 4,
                        }}
                      >
                        {v}
                      </code>
                    ))}
                  </div>
                </Field>

                {/* Vista previa del mensaje */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Vista previa del mensaje
                  </div>
                  <div
                    style={{
                      background: "#dcf8c6",
                      border: "1px solid #b5e7a0",
                      borderRadius: 12,
                      borderBottomRightRadius: 2,
                      padding: "10px 14px",
                      maxWidth: 340,
                      fontSize: 13,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      color: "#1a1a1a",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                    }}
                  >
                    {buildOrderConfirmationMessage(
                      {
                        id: "demo-order-abc123",
                        customer_name: "María García",
                        items: [
                          { name: "Kebab mixto", quantity: 2 },
                          { name: "Fanta naranja", quantity: 1 },
                        ],
                        total: 18.5,
                        order_type: "delivery",
                        estimated_minutes: 30,
                      },
                      restaurantName || "Mi Restaurante",
                      whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE
                    )}
                  </div>
                </div>

                {/* Proveedor */}
                <Field label="Proveedor de envío">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {(
                      [
                        { value: "link" as const, label: "WhatsApp Link", desc: "Activo — el cliente pulsa el botón", active: true },
                        { value: "twilio" as const, label: "Twilio", desc: "Próximamente — requiere configuración", active: false },
                        { value: "360dialog" as const, label: "360dialog", desc: "Próximamente — requiere configuración", active: false },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { if (canSave && opt.active) setWhatsappProvider(opt.value); }}
                        style={{
                          border: `2px solid ${whatsappProvider === opt.value ? "var(--brand-primary)" : "var(--admin-card-border)"}`,
                          borderRadius: 10,
                          padding: "10px 12px",
                          textAlign: "left",
                          cursor: opt.active && canSave ? "pointer" : "not-allowed",
                          background: whatsappProvider === opt.value
                            ? "var(--brand-primary-soft)"
                            : opt.active ? "#fff" : "#f9fafb",
                          opacity: opt.active ? 1 : 0.55,
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--admin-text-primary)" }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--admin-text-secondary)", marginTop: 3, lineHeight: 1.4 }}>
                          {opt.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                  {whatsappProvider === "link" && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--admin-text-secondary)",
                        marginTop: 8,
                        padding: "8px 12px",
                        background: "#f8fafc",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        lineHeight: 1.5,
                      }}
                    >
                      Con <strong>WhatsApp Link</strong> el cliente debe pulsar el botón para enviar el mensaje.{" "}
                      Con <strong>API</strong> el mensaje se envía automáticamente (requiere cuenta Twilio o 360dialog).
                    </div>
                  )}
                </Field>

                {/* Botón de prueba */}
                {whatsappPhone.trim() && (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        const msg = buildOrderConfirmationMessage(
                          {
                            id: "test-order-abc123",
                            customer_name: "Cliente de prueba",
                            items: [],
                            total: 15.0,
                            order_type: "pickup",
                            estimated_minutes: 20,
                          },
                          restaurantName || "Mi Restaurante",
                          whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE
                        );
                        window.open(
                          `https://wa.me/${whatsappPhone.replace(/[\s\-\(\)]/g, "")}?text=${encodeURIComponent(msg)}`,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        background: "#25d366",
                        color: "#fff",
                        border: "none",
                        borderRadius: 10,
                        padding: "9px 16px",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      Probar configuración
                    </button>
                    <span style={{ fontSize: 12, color: "var(--admin-text-muted)", marginLeft: 10 }}>
                      Abre WhatsApp con un mensaje de prueba al número configurado
                    </span>
                  </div>
                )}
              </>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <SaveButton
                onClick={() => { void saveWhatsapp(); }}
                saving={savingWhatsapp}
                disabled={!canSave}
              />
            </div>
          </Card>

        </div>
      </section>
      </section>

      {/* ── Toasts ── */}
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          display: "grid",
          gap: 8,
          zIndex: 60,
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            style={{
              border: `1px solid ${toast.type === "error" ? "#fecaca" : "var(--brand-primary-border)"}`,
              background: toast.type === "error" ? "#fef2f2" : "var(--brand-primary-soft)",
              color: toast.type === "error" ? "#991b1b" : "var(--brand-hover)",
              borderRadius: 10,
              padding: "10px 14px",
              minWidth: 220,
              maxWidth: 360,
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
              fontWeight: 500,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{toast.type === "success" ? "✓" : "✕"}</span>
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}




















