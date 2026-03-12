import { supabase } from "../../lib/supabase";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticIssue = {
  id: string;
  severity: DiagnosticSeverity;
  title: string;
  description: string;
  solution: string;
  actionLabel?: string;
  actionPath?: string; // relative path within admin, e.g. 'products'
  autoFixable?: boolean;
};

export async function runDiagnostics(restaurantId: string): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];

  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun, 6=Sat — matches restaurant_hours.day_of_week
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  const [
    productsRes,
    settingsRes,
    hoursCountRes,
    todayHoursRes,
    stuckOrdersRes,
    categoriesRes,
    zeroPriceRes,
    restaurantRes,
  ] = await Promise.all([
    // Check 1: Active products
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true),

    // Checks 2, 7, 8: Settings
    supabase
      .from("restaurant_settings")
      .select("is_accepting_orders, delivery_radius_km, allow_cash, allow_card, allow_card_on_delivery, allow_card_online")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),

    // Check 3: Open hours count
    supabase
      .from("restaurant_hours")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("is_open", true),

    // Check 4: Today's open hours
    supabase
      .from("restaurant_hours")
      .select("open_time, close_time")
      .eq("restaurant_id", restaurantId)
      .eq("day_of_week", currentDay)
      .eq("is_open", true)
      .maybeSingle(),

    // Check 5: Stuck pending orders (> 15 min)
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending")
      .lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString()),

    // Check 6: Categories
    supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId),

    // Check 9: Zero-price active products
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("price", 0)
      .eq("is_active", true),

    // Check 10: SEO
    supabase
      .from("restaurants")
      .select("meta_title")
      .eq("id", restaurantId)
      .maybeSingle(),
  ]);

  type SettingsRow = {
    is_accepting_orders?: boolean | null;
    delivery_radius_km?: number | null;
    allow_cash?: boolean | null;
    allow_card?: boolean | null;
    allow_card_on_delivery?: boolean | null;
    allow_card_online?: boolean | null;
  };

  const settings = settingsRes.data as SettingsRow | null;

  // CHECK 1 — No active products
  if ((productsRes.count ?? 0) === 0) {
    issues.push({
      id: "no_products",
      severity: "error",
      title: "Sin productos activos",
      description: "Tu carta está vacía. Los clientes no pueden hacer pedidos.",
      solution: "Crea al menos un producto para empezar a recibir pedidos.",
      actionLabel: "Crear producto",
      actionPath: "products",
    });
  }

  // CHECK 2 — Not accepting orders
  if (settings && settings.is_accepting_orders === false) {
    issues.push({
      id: "not_accepting",
      severity: "error",
      title: "No estás aceptando pedidos",
      description: "El restaurante está cerrado para pedidos online.",
      solution: 'Activa "Aceptar pedidos" en Ajustes si quieres recibir pedidos ahora.',
      actionLabel: "Ir a Ajustes",
      actionPath: "settings",
      autoFixable: true,
    });
  }

  // CHECK 3 — No open hours configured
  if ((hoursCountRes.count ?? 0) === 0) {
    issues.push({
      id: "no_hours",
      severity: "error",
      title: "Horario no configurado",
      description: "No tienes ningún día de apertura configurado.",
      solution: "Configura tus horarios en Ajustes para que los clientes puedan pedir.",
      actionLabel: "Configurar horario",
      actionPath: "settings",
    });
  }

  // CHECK 4 — Today outside opening hours
  const todayRow = todayHoursRes.data as { open_time?: string; close_time?: string } | null;
  if (todayRow?.open_time && todayRow?.close_time) {
    const [openH = 0, openM = 0] = todayRow.open_time.split(":").map(Number);
    const [closeH = 0, closeM = 0] = todayRow.close_time.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (currentTimeMinutes < openMinutes || currentTimeMinutes >= closeMinutes) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const currentTimeStr = `${pad(currentHour)}:${pad(currentMinute)}`;
      issues.push({
        id: "outside_hours",
        severity: "warning",
        title: "Fuera de horario",
        description: `Son las ${currentTimeStr} y tu horario de hoy es ${todayRow.open_time}–${todayRow.close_time}.`,
        solution: "Los clientes no pueden pedir fuera de tu horario configurado.",
        actionLabel: "Ver horario",
        actionPath: "settings",
      });
    }
  }

  // CHECK 5 — Stuck pending orders (> 15 min)
  const stuckCount = stuckOrdersRes.count ?? 0;
  if (stuckCount > 0) {
    issues.push({
      id: "stuck_orders",
      severity: "error",
      title: `${stuckCount} pedido(s) sin atender`,
      description: "Tienes pedidos pendientes desde hace más de 15 minutos.",
      solution: "Revisa los pedidos y acéptalos o cancélalos.",
      actionLabel: "Ver pedidos",
      actionPath: "orders",
    });
  }

  // CHECK 6 — No categories
  if ((categoriesRes.count ?? 0) === 0) {
    issues.push({
      id: "no_categories",
      severity: "warning",
      title: "Sin categorías",
      description: "No tienes categorías creadas. Los productos sin categoría son difíciles de encontrar.",
      solution: 'Crea categorías como "Principales", "Bebidas" o "Postres".',
      actionLabel: "Crear categoría",
      actionPath: "categories",
    });
  }

  // CHECK 7 — No delivery radius configured
  if (settings && !(settings.delivery_radius_km && settings.delivery_radius_km > 0)) {
    issues.push({
      id: "no_delivery_radius",
      severity: "warning",
      title: "Zona de reparto no configurada",
      description: "No has definido la zona de reparto para delivery.",
      solution: "Configura el radio de reparto en Ajustes → Reparto.",
      actionLabel: "Configurar delivery",
      actionPath: "settings",
    });
  }

  // CHECK 8 — No payment method enabled
  if (
    settings &&
    !settings.allow_cash &&
    !settings.allow_card &&
    !settings.allow_card_on_delivery &&
    !settings.allow_card_online
  ) {
    issues.push({
      id: "no_payment",
      severity: "error",
      title: "Sin método de pago",
      description: "No tienes ningún método de pago activado.",
      solution: "Activa efectivo o tarjeta en Ajustes.",
      actionLabel: "Configurar pagos",
      actionPath: "settings",
    });
  }

  // CHECK 9 — Products with price 0
  const zeroPriceCount = zeroPriceRes.count ?? 0;
  if (zeroPriceCount > 0) {
    issues.push({
      id: "zero_price_products",
      severity: "warning",
      title: `${zeroPriceCount} producto(s) con precio 0€`,
      description: "Tienes productos activos con precio cero.",
      solution: "Revisa los precios de tus productos.",
      actionLabel: "Ver productos",
      actionPath: "products",
    });
  }

  // CHECK 10 — No SEO
  const restaurantRow = restaurantRes.data as { meta_title?: string | null } | null;
  if (!restaurantRow?.meta_title) {
    issues.push({
      id: "no_seo",
      severity: "info",
      title: "SEO no configurado",
      description: "Tu carta no tiene título ni descripción para buscadores.",
      solution: "Configura el SEO en Ajustes para aparecer en Google.",
      actionLabel: "Configurar SEO",
      actionPath: "settings",
    });
  }

  return issues;
}

/** Lightweight check — only errors, fewer queries. Used by AdminLayout banner. */
export async function runErrorCheck(restaurantId: string): Promise<number> {
  const issues = await runDiagnostics(restaurantId);
  return issues.filter((i) => i.severity === "error").length;
}
