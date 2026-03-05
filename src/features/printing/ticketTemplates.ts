export type TicketMode = "kitchen" | "customer";

export type TicketAddress = {
  line?: string | null;
  street?: string | null;
  number?: string | null;
  portal?: string | null;
  floor?: string | null;
  door?: string | null;
  block?: string | null;
  stair?: string | null;
  notes?: string | null;
};

export type TicketItem = {
  quantity: number;
  name: string;
  unitPrice?: number | null;
  modifiers?: { name: string; price?: number | null }[];
  extras?: { name: string; price?: number | null }[];
};

export type TicketOrder = {
  id: string;
  createdAt?: string | null;
  orderType?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: TicketAddress | null;
  items?: TicketItem[];
  total?: number | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: unknown): string {
  return String(value ?? "").trim();
}

function truncate(value: string, width: number): string {
  if (value.length <= width) {
    return value;
  }
  return `${value.slice(0, Math.max(0, width - 1))}...`;
}

function money(value: unknown): string {
  return `${toNumber(value).toFixed(2)} EUR`;
}

function dateValue(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function repeatChar(char: string, size: number): string {
  return Array.from({ length: size }).map(() => char).join("");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeOrder(raw: unknown): TicketOrder {
  if (!raw || typeof raw !== "object") {
    return { id: "-", items: [] };
  }

  const row = raw as Record<string, unknown>;

  const itemsRaw = Array.isArray(row.items)
    ? row.items
    : Array.isArray(row.order_items)
      ? row.order_items
      : [];

  const items: TicketItem[] = itemsRaw.map((itemRaw) => {
    const item = (itemRaw ?? {}) as Record<string, unknown>;

    const modifiersRaw = Array.isArray(item.modifiers) ? item.modifiers : [];
    const extrasRaw = Array.isArray(item.extras) ? item.extras : [];

    return {
      quantity: toNumber(item.quantity ?? item.qty, 1),
      name: safeString(item.name ?? item.product_name ?? "Producto") || "Producto",
      unitPrice:
        item.unitPrice === null ||
        item.unit_price === null ||
        item.price === null
          ? null
          : toNumber(item.unitPrice ?? item.unit_price ?? item.price, 0),
      modifiers: modifiersRaw.map((modifierRaw) => {
        const modifier = (modifierRaw ?? {}) as Record<string, unknown>;
        return {
          name: safeString(modifier.name ?? modifier.option_name ?? "Modificador") || "Modificador",
          price: toNumber(modifier.price ?? 0),
        };
      }),
      extras: extrasRaw.map((extraRaw) => {
        const extra = (extraRaw ?? {}) as Record<string, unknown>;
        return {
          name: safeString(extra.name ?? "Extra") || "Extra",
          price: toNumber(extra.price ?? 0),
        };
      }),
    };
  });

  return {
    id: safeString(row.id) || "-",
    createdAt: (row.created_at as string | null | undefined) ?? null,
    orderType: (row.order_type as string | null | undefined) ?? null,
    customerName:
      (row.customer_name as string | null | undefined) ??
      (row.customerName as string | null | undefined) ??
      null,
    customerPhone:
      (row.customer_phone as string | null | undefined) ??
      (row.phone as string | null | undefined) ??
      null,
    address: {
      line:
        (row.address_line as string | null | undefined) ??
        (row.addressText as string | null | undefined) ??
        null,
      street: (row.street as string | null | undefined) ?? null,
      number: (row.number as string | null | undefined) ?? null,
      portal: (row.portal as string | null | undefined) ?? null,
      floor: (row.floor as string | null | undefined) ?? null,
      door: (row.door as string | null | undefined) ?? null,
      block: (row.block as string | null | undefined) ?? null,
      stair: (row.stair as string | null | undefined) ?? null,
      notes:
        (row.instructions as string | null | undefined) ??
        (row.notes as string | null | undefined) ??
        null,
    },
    items,
    total: toNumber(row.total ?? 0),
  };
}

export function buildTicketText(rawOrder: unknown, mode: TicketMode): string {
  const width = 42;
  const separator = repeatChar("-", width);
  const order = normalizeOrder(rawOrder);
  const lines: string[] = [];

  lines.push("KEBAB SAAS V1");
  lines.push(separator);
  lines.push(`Pedido: ${truncate(order.id, width - 8)}`);
  lines.push(`Fecha: ${truncate(dateValue(order.createdAt ?? null), width - 7)}`);
  lines.push(`Tipo: ${truncate(order.orderType ?? "-", width - 6)}`);
  lines.push(`Cliente: ${truncate(order.customerName ?? "-", width - 9)}`);
  lines.push(`Telefono: ${truncate(order.customerPhone ?? "-", width - 10)}`);

  const addressLine = order.address?.line;
  const addressStreet = [order.address?.street, order.address?.number]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (addressLine || addressStreet) {
    lines.push(separator);
    lines.push("Direccion:");
    if (addressLine) {
      lines.push(` ${truncate(addressLine, width - 1)}`);
    } else if (addressStreet) {
      lines.push(` ${truncate(addressStreet, width - 1)}`);
    }

    const buildingParts = [
      order.address?.portal ? `Portal ${order.address.portal}` : "",
      order.address?.floor ? `Piso ${order.address.floor}` : "",
      order.address?.door ? `Puerta ${order.address.door}` : "",
      order.address?.block ? `Bloque ${order.address.block}` : "",
      order.address?.stair ? `Escalera ${order.address.stair}` : "",
    ].filter(Boolean);

    if (buildingParts.length > 0) {
      lines.push(` ${truncate(buildingParts.join(", "), width - 1)}`);
    }

    if (order.address?.notes) {
      lines.push(` Nota: ${truncate(order.address.notes, width - 7)}`);
    }
  }

  lines.push(separator);
  lines.push(mode === "kitchen" ? "COMANDA COCINA" : "TICKET CLIENTE");

  for (const item of order.items ?? []) {
    const qty = toNumber(item.quantity, 1);
    const itemName = `${qty}x ${item.name}`;
    if (mode === "kitchen") {
      lines.push(truncate(itemName, width));
    } else {
      const unitPrice = toNumber(item.unitPrice, 0);
      const right = money(unitPrice * qty);
      const leftWidth = Math.max(1, width - right.length - 1);
      lines.push(`${truncate(itemName, leftWidth)} ${right}`);
    }

    for (const modifier of item.modifiers ?? []) {
      const prefix = `  + ${modifier.name}`;
      if (mode === "kitchen") {
        lines.push(truncate(prefix, width));
      } else {
        const modifierPrice = toNumber(modifier.price, 0);
        const priceText = modifierPrice > 0 ? `(+${money(modifierPrice)})` : "";
        lines.push(truncate(`${prefix} ${priceText}`.trim(), width));
      }
    }

    for (const extra of item.extras ?? []) {
      const prefix = `  * ${extra.name}`;
      if (mode === "kitchen") {
        lines.push(truncate(prefix, width));
      } else {
        const extraPrice = toNumber(extra.price, 0);
        const priceText = extraPrice > 0 ? `(+${money(extraPrice)})` : "";
        lines.push(truncate(`${prefix} ${priceText}`.trim(), width));
      }
    }
  }

  lines.push(separator);
  if (mode === "customer") {
    lines.push(`TOTAL: ${money(order.total ?? 0)}`);
    lines.push(separator);
  }

  lines.push("Gracias por tu pedido");

  return `${lines.join("\n")}\n`;
}

export function buildTicketHtml(rawOrder: unknown, mode: TicketMode): string {
  const order = normalizeOrder(rawOrder);

  const headerAddress = [
    order.address?.line,
    [order.address?.street, order.address?.number].filter(Boolean).join(" ").trim(),
  ].filter(Boolean)[0];

  const buildingParts = [
    order.address?.portal ? `Portal ${order.address.portal}` : "",
    order.address?.floor ? `Piso ${order.address.floor}` : "",
    order.address?.door ? `Puerta ${order.address.door}` : "",
    order.address?.block ? `Bloque ${order.address.block}` : "",
    order.address?.stair ? `Escalera ${order.address.stair}` : "",
  ].filter(Boolean);

  const itemsHtml = (order.items ?? [])
    .map((item) => {
      const qty = toNumber(item.quantity, 1);
      const unitPrice = toNumber(item.unitPrice, 0);
      const subtotal = unitPrice * qty;

      const modifiersHtml = (item.modifiers ?? [])
        .map((modifier) => {
          const modifierPrice = toNumber(modifier.price, 0);
          const priceText = mode === "customer" && modifierPrice > 0 ? ` (+${money(modifierPrice)})` : "";
          return `<li>+ ${escapeHtml(modifier.name)}${escapeHtml(priceText)}</li>`;
        })
        .join("");

      const extrasHtml = (item.extras ?? [])
        .map((extra) => {
          const extraPrice = toNumber(extra.price, 0);
          const priceText = mode === "customer" && extraPrice > 0 ? ` (+${money(extraPrice)})` : "";
          return `<li>* ${escapeHtml(extra.name)}${escapeHtml(priceText)}</li>`;
        })
        .join("");

      return `
        <div style="margin:0 0 10px;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <strong>${escapeHtml(`${qty}x ${item.name}`)}</strong>
            ${
              mode === "customer"
                ? `<span>${escapeHtml(money(subtotal))}</span>`
                : ""
            }
          </div>
          ${modifiersHtml || extrasHtml ? `<ul style="margin:4px 0 0 16px;padding:0;">${modifiersHtml}${extrasHtml}</ul>` : ""}
        </div>
      `;
    })
    .join("");

  return `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; max-width: 360px; background:#fff; color:#111; padding:12px; border:1px solid #ddd;">
      <div style="text-align:center; font-weight:700;">KEBAB SAAS V1</div>
      <hr />
      <div><strong>Pedido:</strong> ${escapeHtml(order.id)}</div>
      <div><strong>Fecha:</strong> ${escapeHtml(dateValue(order.createdAt ?? null))}</div>
      <div><strong>Tipo:</strong> ${escapeHtml(order.orderType ?? "-")}</div>
      <div><strong>Cliente:</strong> ${escapeHtml(order.customerName ?? "-")}</div>
      <div><strong>Telefono:</strong> ${escapeHtml(order.customerPhone ?? "-")}</div>
      ${headerAddress ? `<div><strong>Direccion:</strong> ${escapeHtml(headerAddress)}</div>` : ""}
      ${buildingParts.length ? `<div><strong>Edificio:</strong> ${escapeHtml(buildingParts.join(", "))}</div>` : ""}
      ${order.address?.notes ? `<div><strong>Notas:</strong> ${escapeHtml(order.address.notes)}</div>` : ""}
      <hr />
      <div style="font-weight:700; margin-bottom:6px;">${mode === "kitchen" ? "COMANDA COCINA" : "TICKET CLIENTE"}</div>
      ${itemsHtml || "<div>Sin items</div>"}
      ${
        mode === "customer"
          ? `<hr /><div style="display:flex;justify-content:space-between;font-weight:700;"><span>TOTAL</span><span>${escapeHtml(
              money(order.total ?? 0)
            )}</span></div>`
          : ""
      }
    </div>
  `;
}
