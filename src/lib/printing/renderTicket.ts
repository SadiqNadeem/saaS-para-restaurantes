export type PrintMode = "customer" | "kitchen";

export type TicketLine = {
  quantity: number;
  name: string;
  unitPrice: number;
  extras?: Array<{ name: string; price: number }>;
  modifiers?: Array<{ name: string; price: number }>;
};

export type TicketOrder = {
  id: string;
  createdAt?: string | null;
  orderType?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  addressLine?: string | null;
  notes?: string | null;
  paymentMethod?: string | null;
  cashGiven?: number | null;
  changeDue?: number | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: TicketLine[];
};

export type TicketSettings = {
  restaurantName?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  logoUrl?: string | null;
  businessPhone?: string | null;
};

function toMoney(value: number) {
  return `${Number(value ?? 0).toFixed(2)} EUR`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toDateLabel(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function renderTicketHtml(
  order: TicketOrder,
  mode: PrintMode = "customer",
  settings?: TicketSettings | null
): string {
  const restaurantName = settings?.restaurantName || "Restaurante";
  const shortOrderId = order.id.slice(0, 8);

  const itemsHtml = order.items
    .map((item) => {
      const subtotal = Number(item.quantity) * Number(item.unitPrice);
      const modifiers = item.modifiers ?? [];
      const extras = item.extras ?? [];
      const modifiersHtml = modifiers
        .map((modifier) => {
          const modifierPrice = Number(modifier.price ?? 0);
          const modifierPriceText =
            mode === "customer" && modifierPrice > 0 ? ` (+${toMoney(modifierPrice)})` : "";
          return `<li>+ ${escapeHtml(modifier.name)}${escapeHtml(modifierPriceText)}</li>`;
        })
        .join("");
      const extrasHtml = extras
        .map((extra) => {
          const extraPrice = Number(extra.price ?? 0);
          const extraPriceText =
            mode === "customer" && extraPrice > 0 ? ` (+${toMoney(extraPrice)})` : "";
          return `<li>* ${escapeHtml(extra.name)}${escapeHtml(extraPriceText)}</li>`;
        })
        .join("");

      return `
        <div style="margin:0 0 8px 0;">
          <div class="line">
            <strong>${escapeHtml(`${item.quantity}x ${item.name}`)}</strong>
            ${mode === "customer" ? `<span>${escapeHtml(toMoney(subtotal))}</span>` : ""}
          </div>
          ${
            modifiersHtml || extrasHtml
              ? `<ul style="margin:4px 0 0 14px;padding:0;">${modifiersHtml}${extrasHtml}</ul>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  return `
    <div id="ticket-root">
      <div style="text-align:center;font-weight:700;">${escapeHtml(restaurantName)}</div>
      ${
        settings?.logoUrl
          ? `<div style="text-align:center;margin:4px 0;"><img src="${escapeHtml(
              settings.logoUrl
            )}" alt="logo" style="max-width: 200px; width: 100%; height: auto; margin: 0 auto 6px; display: block;" /></div>`
          : ""
      }
      ${
        settings?.receiptHeader
          ? `<div style="text-align:center;white-space:pre-wrap;">${escapeHtml(settings.receiptHeader)}</div>`
          : ""
      }
      ${
        settings?.businessPhone
          ? `<div style="text-align:center;">Tel: ${escapeHtml(settings.businessPhone)}</div>`
          : ""
      }
      <hr />
      <div><strong>Pedido:</strong> ${escapeHtml(shortOrderId)}</div>
      <div><strong>Fecha:</strong> ${escapeHtml(toDateLabel(order.createdAt))}</div>
      <div><strong>Tipo:</strong> ${escapeHtml(order.orderType ?? "-")}</div>
      <div><strong>Cliente:</strong> ${escapeHtml(order.customerName ?? "-")}</div>
      <div><strong>Telefono:</strong> ${escapeHtml(order.customerPhone ?? "-")}</div>
      ${order.addressLine ? `<div><strong>Direccion:</strong> ${escapeHtml(order.addressLine)}</div>` : ""}
      ${order.notes ? `<div><strong>Notas:</strong> ${escapeHtml(order.notes)}</div>` : ""}
      <hr />
      <div style="font-weight:700;">${mode === "kitchen" ? "COMANDA COCINA" : "TICKET CLIENTE"}</div>
      <div style="margin-top:6px;">${itemsHtml || "<div>Sin lineas</div>"}</div>
      <hr />
      ${
        mode === "customer"
          ? `<div><strong>Subtotal:</strong> ${escapeHtml(toMoney(order.subtotal))}</div>`
          : ""
      }
      ${
        mode === "customer"
          ? `<div><strong>Envio:</strong> ${escapeHtml(toMoney(order.deliveryFee))}</div>`
          : ""
      }
      ${mode === "customer" ? `<div><strong>Total:</strong> ${escapeHtml(toMoney(order.total))}</div>` : ""}
      ${mode === "customer" ? `<div><strong>Pago:</strong> ${escapeHtml(order.paymentMethod ?? "-")}</div>` : ""}
      ${
        mode === "customer" && order.paymentMethod === "cash"
          ? `<div><strong>Entrega:</strong> ${escapeHtml(toMoney(Number(order.cashGiven ?? 0)))}</div>`
          : ""
      }
      ${
        mode === "customer" && order.paymentMethod === "cash"
          ? `<div><strong>Cambio:</strong> ${escapeHtml(toMoney(Number(order.changeDue ?? 0)))}</div>`
          : ""
      }
      ${
        settings?.receiptFooter
          ? `<hr /><div style="text-align:center;white-space:pre-wrap;">${escapeHtml(settings.receiptFooter)}</div>`
          : ""
      }
    </div>
  `;
}
