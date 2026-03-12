// Unified ticket printing service: browser popup, RawBT (Android), desktop app

export type TicketType = "customer" | "kitchen";
export type PrintWidth = "58mm" | "80mm";
export type PrintMode = "browser" | "desktop_app";

export type PrintSettings = {
  printMode: PrintMode;
  printWidth: PrintWidth;
  rawbtEnabled: boolean;
  localPrintUrl: string;
  kitchenPrinterName: string | null;
  customerPrinterName: string | null;
  autoPrintWebOrders: boolean;
  autoPrintPosOrders: boolean;
  printOnNewOrder: boolean;
  printOnAccept: boolean;
};

export type TicketItem = {
  quantity: number;
  name: string;
  unitPrice?: number | null;
  modifiers?: Array<{ name: string; price?: number | null }>;
  extras?: Array<{ name: string; price?: number | null }>;
  notes?: string | null;
};

export type TicketData = {
  orderId: string;
  createdAt?: string | null;
  restaurantName: string;
  restaurantHeader?: string | null;
  restaurantFooter?: string | null;
  orderType?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  addressLine?: string | null;
  notes?: string | null;
  paymentMethod?: string | null;
  cashGiven?: number | null;
  changeDue?: number | null;
  subtotal?: number | null;
  deliveryFee?: number | null;
  total?: number | null;
  items: TicketItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function eur(n: number | null | undefined): string {
  return `${(n ?? 0).toFixed(2)}\u20AC`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "MOSTRADOR",
  counter: "MOSTRADOR",
  pickup: "RECOGER",
  delivery: "DELIVERY",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card_on_delivery: "Tarjeta",
  card_online: "Online",
  card: "Tarjeta",
};

// ─── CSS generation ───────────────────────────────────────────────────────────

function buildCss(width: PrintWidth, kitchen: boolean): string {
  const w = width;
  const baseFontSize = kitchen ? "15px" : "12px";
  const paddingBottom = kitchen ? "30mm" : "25mm";
  return `
    @page { size: ${w} auto; margin: 0; }
    html, body { width: ${w}; margin: 0; padding: 0; background: #fff; color: #000; overflow: visible; }
    body { font-family: ui-monospace, Menlo, 'Courier New', Consolas, monospace; font-size: ${baseFontSize}; line-height: 1.4; }
    #ticket-root { width: ${w}; padding: 4mm 5mm ${paddingBottom}; box-sizing: border-box; overflow: visible; }
    .c { text-align: center; }
    .b { font-weight: 700; }
    .lg { font-size: ${kitchen ? "18px" : "14px"}; }
    .sm { font-size: 11px; }
    .mut { color: #555; }
    .nw { white-space: nowrap; flex-shrink: 0; }
    .ind { padding-left: 14px; margin-top: 1px; font-size: 11px; }
    .ita { font-style: italic; }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; }
    .sep { border: none; border-top: 1px dashed #000; margin: 5px 0; }
    .seps { border: none; border-top: 1px solid #000; margin: 4px 0; }
    .iqty { font-size: 20px; font-weight: 900; min-width: 28px; }
    .inam { font-size: ${kitchen ? "18px" : "14px"}; font-weight: 700; }
    @media print {
      @page { size: ${w} auto; margin: 0; }
      html, body { width: ${w}; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
      #ticket-root { position: absolute; left: 0; top: 0; width: ${w}; padding-bottom: ${paddingBottom}; overflow: visible; }
    }
  `;
}

// ─── HTML generation ──────────────────────────────────────────────────────────

export function generateTicketHTML(
  data: TicketData,
  type: TicketType,
  width: PrintWidth
): string {
  const {
    orderId, createdAt, restaurantName, restaurantHeader, restaurantFooter,
    orderType, customerName, addressLine, notes, paymentMethod,
    cashGiven, changeDue, subtotal, deliveryFee, total, items,
  } = data;

  const shortId = orderId.slice(-6).toUpperCase();
  const typeLabel = ORDER_TYPE_LABELS[orderType ?? ""] ?? (orderType?.toUpperCase() ?? "");
  const paymentLabel = PAYMENT_LABELS[paymentMethod ?? ""] ?? (paymentMethod ?? "-");
  const isCash = paymentMethod === "cash";

  let body: string;

  if (type === "kitchen") {
    const itemsHtml = items
      .map((item) => {
        const modsHtml = (item.modifiers ?? [])
          .map((m) => `<div class="ind">+ ${esc(m.name)}</div>`)
          .join("");
        const extrasHtml = (item.extras ?? [])
          .map((e) => `<div class="ind">* ${esc(e.name)}</div>`)
          .join("");
        const notesHtml = item.notes
          ? `<div class="ind ita">Nota: ${esc(item.notes)}</div>`
          : "";
        return `
          <div style="display:flex;align-items:baseline;gap:8px;margin:6px 0 2px;">
            <span class="iqty">${esc(item.quantity)}x</span>
            <span class="inam">${esc(item.name)}</span>
          </div>
          ${modsHtml}${extrasHtml}${notesHtml}`;
      })
      .join("");

    body = `
      <div id="ticket-root">
        <div class="c b">${esc(restaurantName)}</div>
        <div class="c b lg">COCINA &mdash; #${esc(shortId)}</div>
        ${createdAt ? `<div class="c sm">${esc(fmtDate(createdAt))}</div>` : ""}
        ${typeLabel ? `<div class="c b">${esc(typeLabel)}</div>` : ""}
        ${customerName ? `<div class="c">${esc(customerName)}</div>` : ""}
        <hr class="seps" />
        ${itemsHtml || "<div>Sin items</div>"}
        <hr class="sep" />
        ${notes ? `<div class="sm ita">Notas: ${esc(notes)}</div>` : ""}
      </div>`;
  } else {
    const itemsHtml = items
      .map((item) => {
        const lineTotal = (item.unitPrice ?? 0) * item.quantity;
        const modsHtml = (item.modifiers ?? [])
          .map((m) => {
            const p = m.price ?? 0;
            return `<div class="ind">${esc(`+ ${m.name}`)}${p > 0 ? ` <span class="mut">(+${eur(p)})</span>` : ""}</div>`;
          })
          .join("");
        const extrasHtml = (item.extras ?? [])
          .map((e) => {
            const p = e.price ?? 0;
            return `<div class="ind">${esc(`* ${e.name}`)}${p > 0 ? ` <span class="mut">(+${eur(p)})</span>` : ""}</div>`;
          })
          .join("");
        const notesHtml = item.notes
          ? `<div class="ind ita sm mut">${esc(item.notes)}</div>`
          : "";
        return `
          <div class="row"><span>${esc(item.quantity)}x ${esc(item.name)}</span><span class="nw">${esc(eur(lineTotal))}</span></div>
          ${modsHtml}${extrasHtml}${notesHtml}`;
      })
      .join("");

    const cashBlock =
      isCash && cashGiven
        ? `<hr class="sep" />
           <div class="row"><span>Entregado</span><span class="nw">${esc(eur(cashGiven))}</span></div>
           <div class="row"><span>Cambio</span><span class="nw">${esc(eur(changeDue ?? 0))}</span></div>`
        : "";

    body = `
      <div id="ticket-root">
        <div class="c b lg">${esc(restaurantName)}</div>
        ${restaurantHeader ? `<div class="c sm">${esc(restaurantHeader)}</div>` : ""}
        <hr class="sep" />
        ${fmtDate(createdAt) ? `<div>${esc(fmtDate(createdAt))}</div>` : ""}
        ${typeLabel ? `<div class="b">${esc(typeLabel)}</div>` : ""}
        ${customerName ? `<div>${esc(customerName)}</div>` : ""}
        ${addressLine ? `<div class="sm mut">${esc(addressLine)}</div>` : ""}
        <hr class="sep" />
        ${itemsHtml || "<div>Sin items</div>"}
        <hr class="sep" />
        ${subtotal != null ? `<div class="row"><span>Subtotal</span><span class="nw">${esc(eur(subtotal))}</span></div>` : ""}
        ${deliveryFee ? `<div class="row"><span>Env&iacute;o</span><span class="nw">${esc(eur(deliveryFee))}</span></div>` : ""}
        <hr class="seps" />
        <div class="row b lg"><span>TOTAL</span><span class="nw">${esc(eur(total ?? 0))}</span></div>
        <div class="row sm mut"><span>Pago</span><span>${esc(paymentLabel)}</span></div>
        ${cashBlock}
        <hr class="sep" />
        <div class="c">Gracias por su pedido!</div>
        <div class="c sm mut">Pedido #${esc(shortId)}</div>
        ${restaurantFooter ? `<hr class="sep" /><div class="c sm">${esc(restaurantFooter)}</div>` : ""}
      </div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title><style>${buildCss(width, type === "kitchen")}</style></head><body>${body}</body></html>`;
}

// ─── Print methods ────────────────────────────────────────────────────────────

export function printBrowser(fullHtml: string): void {
  const popup = window.open("", "_blank", "width=500,height=800");
  if (!popup) {
    throw new Error("No se pudo abrir la ventana de impresión (popup bloqueado).");
  }
  popup.document.open();
  popup.document.write(fullHtml);
  popup.document.close();

  let printed = false;
  popup.onload = () => {
    if (printed) return;
    printed = true;
    popup.focus();
    popup.print();
    popup.onafterprint = () => { window.setTimeout(() => popup.close(), 300); };
  };
  // Fallback if onload doesn't fire
  window.setTimeout(() => {
    if (!printed) {
      printed = true;
      popup.focus();
      popup.print();
    }
  }, 1200);
}

export function printRawBT(data: TicketData, type: TicketType): void {
  const W = 42;
  const sep = "-".repeat(W);
  const shortId = data.orderId.slice(-6).toUpperCase();
  const lines: string[] = [];

  lines.push(data.restaurantName.toUpperCase());
  lines.push(sep);
  lines.push(`Pedido: #${shortId}`);
  if (data.createdAt) lines.push(`Fecha: ${fmtDate(data.createdAt)}`);
  if (data.orderType) {
    lines.push(`Tipo: ${ORDER_TYPE_LABELS[data.orderType] ?? data.orderType}`);
  }
  if (data.customerName) lines.push(`Cliente: ${data.customerName}`);
  if (data.addressLine) lines.push(`Dir: ${data.addressLine}`);
  lines.push(sep);
  lines.push(type === "kitchen" ? "COMANDA COCINA" : "TICKET CLIENTE");
  lines.push("");

  for (const item of data.items) {
    if (type === "kitchen") {
      lines.push(`${item.quantity}x ${item.name}`);
    } else {
      lines.push(`${item.quantity}x ${item.name} ${eur((item.unitPrice ?? 0) * item.quantity)}`);
    }
    for (const m of item.modifiers ?? []) lines.push(` + ${m.name}`);
    for (const e of item.extras ?? []) lines.push(` * ${e.name}`);
    if (item.notes) lines.push(` Nota: ${item.notes}`);
  }

  lines.push(sep);
  if (type === "customer") {
    if (data.subtotal != null) lines.push(`Subtotal: ${eur(data.subtotal)}`);
    if (data.deliveryFee) lines.push(`Envio: ${eur(data.deliveryFee)}`);
    lines.push(`TOTAL: ${eur(data.total ?? 0)}`);
    if (data.paymentMethod) {
      lines.push(`Pago: ${PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod}`);
    }
    if (data.paymentMethod === "cash" && data.cashGiven) {
      lines.push(`Entregado: ${eur(data.cashGiven)}`);
      lines.push(`Cambio: ${eur(data.changeDue ?? 0)}`);
    }
  }
  lines.push("Gracias por su pedido!");
  lines.push("");

  const text = lines.join("\n");
  // btoa doesn't handle non-ASCII; encode as UTF-8 then base64
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  const encoded = btoa(binary);
  window.open(`rawbt://print?data=${encoded}`, "_blank");
}

export async function printDesktopApp(
  html: string,
  printerName: string | null | undefined,
  localUrl: string
): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(localUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, printer: printerName ?? "" }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`App de impresión respondió con error ${res.status}`);
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function printTicket(
  data: TicketData,
  type: TicketType,
  settings: PrintSettings
): Promise<void> {
  const html = generateTicketHTML(data, type, settings.printWidth);
  const printerName =
    type === "kitchen" ? settings.kitchenPrinterName : settings.customerPrinterName;

  if (settings.printMode === "desktop_app") {
    await printDesktopApp(html, printerName, settings.localPrintUrl);
    return;
  }

  if (settings.rawbtEnabled) {
    printRawBT(data, type);
    return;
  }

  printBrowser(html);
}
