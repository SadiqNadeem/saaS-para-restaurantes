// ─── Types ────────────────────────────────────────────────────────────────────

export type PosTicketItem = {
  qty: number;
  name: string;
  unitPrice: number;
  modifiers?: Array<{ name: string; price: number }>;
  notes?: string;
};

export type PosTicketData = {
  orderId: string;
  createdAt?: string | null;
  restaurantName: string;
  orderType: string | null;
  customerName?: string | null;
  paymentMethod?: string | null;
  cashGiven?: number | null;
  changeDue?: number | null;
  subtotal: number;
  deliveryFee?: number;
  total: number;
  items: PosTicketItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function eur(n: number | null | undefined): string {
  return `${(n ?? 0).toFixed(2)}\u20AC`;
}

function fmtDatetime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}  ${time}`;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in:  "MOSTRADOR",
  counter:  "MOSTRADOR",
  pickup:   "RECOGER",
  delivery: "DELIVERY",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash:             "Efectivo",
  card_on_delivery: "Tarjeta",
  card_online:      "Online",
  card:             "Tarjeta",
};

// ─── Customer ticket HTML renderer ────────────────────────────────────────────

function renderTicketBody(data: PosTicketData): string {
  const {
    orderId,
    createdAt,
    restaurantName,
    orderType,
    customerName,
    paymentMethod,
    cashGiven,
    changeDue,
    subtotal,
    deliveryFee = 0,
    total,
    items,
  } = data;

  const shortId       = orderId.slice(-6).toUpperCase();
  const datetime      = fmtDatetime(createdAt);
  const typeLabel     = ORDER_TYPE_LABELS[orderType ?? ""] ?? (orderType?.toUpperCase() ?? "");
  const paymentLabel  = PAYMENT_LABELS[paymentMethod ?? ""] ?? (paymentMethod ?? "");
  const isCash        = paymentMethod === "cash";

  const itemsHtml = items.map((item) => {
    const lineTotal = item.unitPrice * item.qty;
    const modsHtml = (item.modifiers ?? [])
      .map((mod) => {
        const priceStr = mod.price > 0 ? ` (+${eur(mod.price)})` : "";
        return `<div class="indent">+ ${esc(mod.name)}${esc(priceStr)}</div>`;
      })
      .join("");
    const notesHtml = item.notes
      ? `<div class="indent italic">${esc(item.notes)}</div>`
      : "";

    return `
      <div class="row">
        <span>${esc(item.qty)}x ${esc(item.name)}</span>
        <span class="nowrap">${esc(eur(lineTotal))}</span>
      </div>
      ${modsHtml}${notesHtml}`;
  }).join("");

  const deliveryRow = deliveryFee > 0
    ? `<div class="row"><span>Env&iacute;o</span><span class="nowrap">${esc(eur(deliveryFee))}</span></div>`
    : "";

  const cashBlock = isCash && cashGiven != null && cashGiven > 0 ? `
    <hr class="sep" />
    <div class="row"><span>Entregado</span><span class="nowrap">${esc(eur(cashGiven))}</span></div>
    <div class="row"><span>Cambio</span><span class="nowrap">${esc(eur(changeDue ?? 0))}</span></div>
  ` : "";

  return `
<div id="ticket-root">
  <div class="center bold lg">${esc(restaurantName)}</div>
  <hr class="sep" />
  ${datetime ? `<div>${esc(datetime)}</div>` : ""}
  <div class="bold">${esc(typeLabel)}</div>
  ${customerName ? `<div>${esc(customerName)}</div>` : ""}
  <hr class="sep" />
  ${itemsHtml}
  <hr class="sep" />
  <div class="row"><span>Subtotal</span><span class="nowrap">${esc(eur(subtotal))}</span></div>
  ${deliveryRow}
  <hr class="sep-solid" />
  <div class="row bold lg"><span>TOTAL</span><span class="nowrap">${esc(eur(total))}</span></div>
  <div class="row sm muted"><span>Pago</span><span>${esc(paymentLabel)}</span></div>
  ${cashBlock}
  <hr class="sep" />
  <div class="center">Gracias por su pedido!</div>
  <div class="center sm muted">Pedido #${esc(shortId)}</div>
</div>`;
}

// ─── Kitchen ticket HTML renderer ─────────────────────────────────────────────

function renderKitchenBody(data: PosTicketData): string {
  const { orderId, createdAt, restaurantName, items } = data;
  const shortId = orderId.slice(-6).toUpperCase();
  const time = fmtTime(createdAt);

  const itemsHtml = items.map((item) => {
    const modsHtml = (item.modifiers ?? [])
      .map((mod) => `<div class="indent">+ ${esc(mod.name)}</div>`)
      .join("");
    const notesHtml = item.notes
      ? `<div class="indent italic note">Nota: ${esc(item.notes)}</div>`
      : "";

    return `
      <div class="item-row">
        <span class="item-qty">${esc(item.qty)}x</span>
        <span class="item-name">${esc(item.name)}</span>
      </div>
      ${modsHtml}${notesHtml}`;
  }).join("");

  return `
<div id="ticket-root">
  <div class="center restaurant">${esc(restaurantName)}</div>
  <div class="center header">COCINA — Pedido #${esc(shortId)} — ${esc(time)}</div>
  <hr class="sep-solid" />
  ${itemsHtml}
  <hr class="sep" />
</div>`;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS_80MM = `
  @page { size: 80mm auto; margin: 0; }
  html, body {
    width: 80mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    overflow: visible;
  }
  body {
    font-family: ui-monospace, Menlo, 'Courier New', Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
  }
  #ticket-root {
    width: 80mm;
    padding: 4mm 5mm 25mm;
    box-sizing: border-box;
    overflow: visible;
  }
  .center  { text-align: center; }
  .bold    { font-weight: 700; }
  .lg      { font-size: 14px; }
  .sm      { font-size: 11px; }
  .muted   { color: #555; }
  .nowrap  { white-space: nowrap; flex-shrink: 0; }
  .indent  { padding-left: 14px; margin-top: 1px; font-size: 11px; }
  .italic  { font-style: italic; }
  .row     { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; }
  .sep     { border: none; border-top: 1px dashed #000; margin: 5px 0; }
  .sep-solid { border: none; border-top: 1px solid #000; margin: 4px 0; }

  @media print {
    @page { size: 80mm auto; margin: 0; }
    html, body { width: 80mm; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
    #ticket-root { position: absolute; left: 0; top: 0; width: 80mm; padding-bottom: 30mm; overflow: visible; }
  }
`;

const CSS_KITCHEN = `
  @page { size: 80mm auto; margin: 0; }
  html, body {
    width: 80mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    overflow: visible;
  }
  body {
    font-family: ui-monospace, Menlo, 'Courier New', Consolas, monospace;
    font-size: 15px;
    line-height: 1.5;
  }
  #ticket-root {
    width: 80mm;
    padding: 4mm 5mm 25mm;
    box-sizing: border-box;
    overflow: visible;
  }
  .center     { text-align: center; }
  .restaurant { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
  .header     { font-size: 16px; font-weight: 900; margin-bottom: 4px; }
  .indent     { padding-left: 16px; font-size: 13px; }
  .italic     { font-style: italic; }
  .note       { color: #555; }
  .item-row   { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 2px; }
  .item-qty   { font-size: 20px; font-weight: 900; min-width: 28px; }
  .item-name  { font-size: 18px; font-weight: 700; }
  .sep        { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .sep-solid  { border: none; border-top: 2px solid #000; margin: 6px 0; }

  @media print {
    @page { size: 80mm auto; margin: 0; }
    html, body { width: 80mm; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
    #ticket-root { position: absolute; left: 0; top: 0; width: 80mm; padding-bottom: 30mm; overflow: visible; }
  }
`;

// ─── Print popup helper ────────────────────────────────────────────────────────

async function openPrintPopup(css: string, body: string): Promise<void> {
  const popup = window.open("", "_blank", "width=480,height=800");
  if (!popup) {
    throw new Error("No se pudo abrir la ventana de impresión (popup bloqueado).");
  }

  popup.document.open();
  popup.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title>` +
    `<style>${css}</style></head><body>${body}</body></html>`
  );
  popup.document.close();

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Timeout al preparar la impresión."));
    }, 8000);

    popup.onload = () => {
      window.clearTimeout(timeout);
      popup.focus();
      popup.print();
      popup.onafterprint = () => {
        window.setTimeout(() => popup.close(), 300);
      };
      resolve();
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function printPosTicket(data: PosTicketData): Promise<void> {
  await openPrintPopup(CSS_80MM, renderTicketBody(data));
}

export async function printKitchenTicket(data: PosTicketData): Promise<void> {
  await openPrintPopup(CSS_KITCHEN, renderKitchenBody(data));
}
