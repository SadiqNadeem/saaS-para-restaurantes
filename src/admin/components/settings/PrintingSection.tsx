/**
 * PrintingSection — redesigned 7-card printing configuration
 * Rendered inside AdminSettingsPage when the "Impresion" tab is active.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkDesktopAppConnection,
  getPrinterList,
  printViaDesktopApp,
} from "../../../lib/printing/desktopAppService";
import {
  generateTicketHTML,
  printBrowser,
} from "../../../lib/printing/ticketService";
import type { PrintWidth } from "../../../lib/printing/ticketService";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrintMode = "browser" | "desktop_app";

export interface PrintingSectionProps {
  canManage: boolean;
  restaurantName: string;
  // Mode
  printMode: PrintMode;
  setPrintMode: (v: PrintMode) => void;
  desktopAppUrl: string;
  setDesktopAppUrl: (v: string) => void;
  // Printers
  customerPrinterName: string;
  setCustomerPrinterName: (v: string) => void;
  kitchenPrinterName: string;
  setKitchenPrinterName: (v: string) => void;
  printKitchenSeparate: boolean;
  setPrintKitchenSeparate: (v: boolean) => void;
  // Format
  printWidth: PrintWidth;
  setPrintWidth: (v: PrintWidth) => void;
  // Auto-print
  printOnNewOrder: boolean;
  setPrintOnNewOrder: (v: boolean) => void;
  printOnAccept: boolean;
  setPrintOnAccept: (v: boolean) => void;
  autoPrintPosOrders: boolean;
  setAutoPrintPosOrders: (v: boolean) => void;
  // Sound & retry
  printSoundEnabled: boolean;
  setPrintSoundEnabled: (v: boolean) => void;
  printRetryEnabled: boolean;
  setPrintRetryEnabled: (v: boolean) => void;
  // RawBT
  rawbtEnabled: boolean;
  setRawbtEnabled: (v: boolean) => void;
  // Save
  saving: boolean;
  onSave: () => void;
}

// ─── UI Primitives ────────────────────────────────────────────────────────────

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
      className="ui-switch"
      onClick={() => { if (!disabled) onChange(!checked); }}
      style={{
        width: 52, height: 30, borderRadius: 999, border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--brand-primary)" : "#d1d5db",
        position: "relative", flexShrink: 0,
        transition: "background 0.2s",
        opacity: disabled ? 0.55 : 1, padding: 0,
      }}
    >
      <span className="ui-switch-thumb" style={{
        position: "absolute", top: 3,
        left: 3, width: 24, height: 24,
        borderRadius: "50%", background: "#fff",
        transform: checked ? "translateX(22px)" : "translateX(0)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)", display: "block",
      }} />
    </button>
  );
}

function SCard({ title, subtitle, children, accent }: {
  title: string; subtitle?: string; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <article style={{
      background: "#fff",
      border: `1px solid ${accent ? "var(--brand-primary-border)" : "#dbe5ef"}`,
      borderRadius: 16,
      boxShadow: accent
        ? "0 0 0 3px var(--brand-primary-soft), 0 10px 22px rgba(15,23,42,0.07)"
        : "0 10px 22px rgba(15,23,42,0.07)",
      padding: "20px",
      display: "grid", gap: 18,
    }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--admin-text-primary)" }}>
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

function ToggleRow({
  icon, label, description, checked, onChange, disabled,
}: {
  icon: string; label: string; description: string;
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 14,
      padding: "12px 14px", background: "#fff", borderRadius: 10,
      border: "1px solid #dbe5ef",
      boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
    }}>
      <span style={{ fontSize: 20, lineHeight: 1, marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--admin-text-primary)" }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 2 }}>
          {description}
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function playTestBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // No AudioContext support
  }
}

function buildTestTicketData(restaurantName: string, type: "customer" | "kitchen") {
  return {
    orderId: "test-00000001",
    createdAt: new Date().toISOString(),
    restaurantName,
    orderType: "pickup",
    customerName: "Cliente de Prueba",
    paymentMethod: type === "customer" ? "cash" : undefined,
    cashGiven: type === "customer" ? 15 : undefined,
    changeDue: type === "customer" ? 4.5 : undefined,
    subtotal: type === "customer" ? 10.5 : undefined,
    total: type === "customer" ? 10.5 : undefined,
    notes: "Sin cebolla",
    items: [
      { quantity: 1, name: "Kebab Especial", unitPrice: 8.5, modifiers: [{ name: "Salsa picante" }] },
      { quantity: 1, name: "Refresco", unitPrice: 2.0 },
    ],
  };
}

// ─── Ticket preview ───────────────────────────────────────────────────────────

function TicketPreview({ width, restaurantName }: { width: PrintWidth; restaurantName: string }) {
  const narrow = width === "58mm";
  const w = narrow ? 160 : 210;
  const name = restaurantName || "Mi Restaurante";
  return (
    <div style={{
      display: "flex", justifyContent: "center", padding: "8px 0",
    }}>
      <div style={{
        width: w, fontFamily: "monospace", fontSize: narrow ? 10 : 11,
        background: "#fff", border: "1px solid #d1d5db",
        borderRadius: 6, padding: "10px 12px",
        boxShadow: "2px 2px 6px rgba(0,0,0,0.10)",
        lineHeight: 1.5, color: "#111",
        transition: "width 0.25s",
      }}>
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: narrow ? 11 : 13 }}>
          {name.toUpperCase().slice(0, 20)}
        </div>
        <div style={{ textAlign: "center", fontSize: narrow ? 9 : 10, color: "#555", marginBottom: 4 }}>
          {new Date().toLocaleDateString("es-ES")} {new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div style={{ borderTop: "1px dashed #333", margin: "4px 0" }} />
        <div style={{ fontWeight: 700 }}>RECOGER</div>
        <div>Cliente de Prueba</div>
        <div style={{ borderTop: "1px dashed #333", margin: "4px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>1x Kebab Especial</span><span>8.50€</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>1x Refresco</span><span>2.00€</span>
        </div>
        <div style={{ borderTop: "1px solid #333", margin: "4px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>TOTAL</span><span>10.50€</span>
        </div>
        <div style={{ textAlign: "center", fontSize: narrow ? 9 : 10, marginTop: 6, color: "#555" }}>
          Gracias por su pedido!
        </div>
      </div>
    </div>
  );
}

// ─── FAQ Accordion ────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "¿Por qué necesito una app?",
    a: "Los navegadores no pueden acceder directamente a impresoras USB o de red. La app actúa como puente local entre el navegador y tu impresora térmica, permitiendo impresión automática sin popups.",
  },
  {
    q: "¿Es compatible con todas las impresoras?",
    a: "La app es compatible con cualquier impresora instalada en Windows: térmica (Epson, Star, Bixolon), láser, inyección de tinta. Cualquier impresora que aparezca en el Panel de Control de Windows funcionará.",
  },
  {
    q: "¿Funciona en red/WiFi?",
    a: "Sí. La app puede estar en cualquier PC de la misma red. Cambia la URL base a la IP local del PC de impresión, por ejemplo: http://192.168.1.50:18181",
  },
];

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {FAQ_ITEMS.map((item, i) => (
        <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: "100%", textAlign: "left", padding: "10px 14px",
              background: open === i ? "#f8fafc" : "#fff",
              border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "var(--admin-text-primary)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            {item.q}
            <span style={{ color: "var(--admin-text-muted)", fontSize: 12 }}>
              {open === i ? "▲" : "▼"}
            </span>
          </button>
          {open === i && (
            <div style={{ padding: "8px 14px 12px", fontSize: 13, color: "var(--admin-text-secondary)", borderTop: "1px solid #f3f4f6" }}>
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PrintingSection({
  canManage,
  restaurantName,
  printMode, setPrintMode,
  desktopAppUrl, setDesktopAppUrl,
  customerPrinterName, setCustomerPrinterName,
  kitchenPrinterName, setKitchenPrinterName,
  printKitchenSeparate, setPrintKitchenSeparate,
  printWidth, setPrintWidth,
  printOnNewOrder, setPrintOnNewOrder,
  printOnAccept, setPrintOnAccept,
  autoPrintPosOrders, setAutoPrintPosOrders,
  printSoundEnabled, setPrintSoundEnabled,
  printRetryEnabled, setPrintRetryEnabled,
  rawbtEnabled, setRawbtEnabled,
  saving, onSave,
}: PrintingSectionProps) {
  // ── Connection state ────────────────────────────────────────────────────────
  type ConnStatus = "idle" | "checking" | "ok" | "error";
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connVersion, setConnVersion] = useState<string | undefined>();
  const [printerList, setPrinterList] = useState<string[]>([]);
  const [fetchingPrinters, setFetchingPrinters] = useState(false);

  // ── Test print state ────────────────────────────────────────────────────────
  const [testPrintMsg, setTestPrintMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const testPrintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-check connection when mode changes to desktop_app ──────────────────
  useEffect(() => {
    if (printMode === "desktop_app") {
      void handleCheckConnection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printMode]);

  const handleCheckConnection = useCallback(async () => {
    setConnStatus("checking");
    const result = await checkDesktopAppConnection(desktopAppUrl);
    if (result.connected) {
      setConnStatus("ok");
      setConnVersion(result.version);
      if (result.printers && result.printers.length > 0) {
        setPrinterList(result.printers);
      } else {
        await fetchPrinters();
      }
    } else {
      setConnStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopAppUrl]);

  const fetchPrinters = async () => {
    setFetchingPrinters(true);
    const list = await getPrinterList(desktopAppUrl);
    setPrinterList(list);
    setFetchingPrinters(false);
  };

  const handleTestPrint = async (type: "customer" | "kitchen") => {
    const data = buildTestTicketData(restaurantName || "Mi Restaurante", type);
    const html = generateTicketHTML(data, type, printWidth);

    let ok = false;
    let errorMsg = "";

    try {
      if (printMode === "desktop_app") {
        const printerName = type === "kitchen" ? kitchenPrinterName : customerPrinterName;
        const result = await printViaDesktopApp(desktopAppUrl, html, printerName || undefined);
        ok = result.success;
        errorMsg = result.error ?? "";
      } else {
        printBrowser(html);
        ok = true;
      }
    } catch (err) {
      ok = false;
      errorMsg = err instanceof Error ? err.message : "Error desconocido";
    }

    const msg = ok ? " Enviado a la impresora" : ` Error: ${errorMsg}`;
    setTestPrintMsg({ ok, text: msg });
    if (testPrintTimeoutRef.current) clearTimeout(testPrintTimeoutRef.current);
    testPrintTimeoutRef.current = setTimeout(() => setTestPrintMsg(null), 5000);
  };

  const isConnected = connStatus === "ok";
  const showPrinterCard = printMode === "desktop_app";
  const anyAutoPrint = printOnNewOrder || printOnAccept || autoPrintPosOrders;

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--admin-card-border)", borderRadius: 8,
    padding: "8px 10px", fontSize: 14, color: "var(--admin-text-primary)",
    background: "#fff", width: "100%", boxSizing: "border-box", outline: "none",
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

  // ─── CARD 1: Modo de impresión ───────────────────────────────────────────────
  const card1 = (
    <SCard title="Modo de impresión" subtitle="Elige cómo se envían los tickets a la impresora">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {(
          [
            {
              value: "browser" as const,
              icon: "",
              title: "Navegador",
              badge: null,
              desc: "Funciona en cualquier dispositivo. El ticket se abre en una ventana y el usuario pulsa imprimir.",
            },
            {
              value: "desktop_app" as const,
              icon: "",
              title: "App Windows",
              badge: " Recomendado para TPV",
              desc: "Impresión automática real para TPV Windows. Requiere instalar la app local.",
            },
          ] as const
        ).map((opt) => {
          const selected = printMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { if (canManage) setPrintMode(opt.value); }}
              style={{
                border: `2px solid ${selected ? "var(--brand-primary)" : "#e5e7eb"}`,
                borderRadius: 12, padding: "14px",
                textAlign: "left", cursor: canManage ? "pointer" : "not-allowed",
                background: selected ? "var(--brand-primary-soft)" : "#fff",
                transition: "border-color 0.15s, background 0.15s",
                opacity: canManage ? 1 : 0.6, position: "relative",
              }}
            >
              {opt.badge && (
                <span style={{
                  position: "absolute", top: -1, right: -1,
                  background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a",
                  borderRadius: "0 10px 0 8px", padding: "2px 8px",
                  fontSize: 10, fontWeight: 700,
                }}>
                  {opt.badge}
                </span>
              )}
              <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--admin-text-primary)", marginBottom: 4 }}>
                {opt.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", lineHeight: 1.5 }}>
                {opt.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop app URL + connection status */}
      {printMode === "desktop_app" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)", display: "block", marginBottom: 6 }}>
              URL de la app local
            </label>
            <input
              className="settings-input"
              type="url"
              value={desktopAppUrl}
              onChange={(e) => { setDesktopAppUrl(e.target.value); setConnStatus("idle"); }}
              disabled={!canManage}
              placeholder="http://127.0.0.1:18181"
              style={inputStyle}
            />
          </div>

          {/* Connection indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {connStatus === "idle" && (
              <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>
                 Sin verificar
              </span>
            )}
            {connStatus === "checking" && (
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                 Verificando conexión...
              </span>
            )}
            {connStatus === "ok" && (
              <span style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                 Conectada{connVersion ? ` — v${connVersion}` : " — app detectada"}
              </span>
            )}
            {connStatus === "error" && (
              <span style={{ fontSize: 13, color: "#dc2626" }}>
                 No detectada
              </span>
            )}

            <button
              type="button"
              onClick={() => { void handleCheckConnection(); }}
              disabled={connStatus === "checking"}
              style={{
                background: "#fff", border: "1px solid #d1d5db",
                borderRadius: 8, padding: "6px 14px", fontSize: 13,
                cursor: connStatus === "checking" ? "not-allowed" : "pointer",
                opacity: connStatus === "checking" ? 0.7 : 1,
              }}
            >
              {connStatus === "checking" ? "Probando..." : connStatus === "error" ? " Reintentar" : "Probar conexión"}
            </button>
          </div>
        </div>
      )}

      {/* RawBT (browser mode) */}
      {printMode === "browser" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 14px", background: "#f8fafc",
          border: "1px solid #e5e7eb", borderRadius: 10,
        }}>
          <Toggle checked={rawbtEnabled} onChange={setRawbtEnabled} disabled={!canManage} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>RawBT para Android</div>
            <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 2 }}>
              {rawbtEnabled
                ? "Activo — abre la app RawBT directamente para imprimir"
                : "Inactivo — usa la ventana de impresión del navegador"}
            </div>
          </div>
        </div>
      )}
    </SCard>
  );

  // ─── CARD 2: Impresoras ──────────────────────────────────────────────────────
  const card2 = showPrinterCard ? (
    <SCard
      title="Impresoras"
      subtitle={isConnected ? "Selecciona las impresoras conectadas al PC" : "Conéctate primero a la app para ver las impresoras disponibles"}
    >
      {isConnected ? (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Customer printer */}
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
               Impresora de cliente
            </label>
            {printerList.length > 0 ? (
              <select
                value={customerPrinterName}
                onChange={(e) => setCustomerPrinterName(e.target.value)}
                disabled={!canManage}
                style={selectStyle}
              >
                <option value="">— Impresora predeterminada —</option>
                {printerList.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="settings-input"
                  type="text"
                  value={customerPrinterName}
                  onChange={(e) => setCustomerPrinterName(e.target.value)}
                  disabled={!canManage}
                  placeholder="Epson TM-T88V"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => { void fetchPrinters(); }}
                  disabled={fetchingPrinters}
                  style={{
                    background: "#fff", border: "1px solid #d1d5db",
                    borderRadius: 8, padding: "8px 12px", fontSize: 12,
                    cursor: fetchingPrinters ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {fetchingPrinters ? "Buscando..." : " Buscar"}
                </button>
              </div>
            )}
          </div>

          {/* Kitchen printer */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Toggle checked={printKitchenSeparate} onChange={setPrintKitchenSeparate} disabled={!canManage} />
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)" }}>
                 Usar impresora separada para cocina
              </label>
            </div>
            {printKitchenSeparate && (
              <div style={{ paddingLeft: 16 }}>
                {printerList.length > 0 ? (
                  <select
                    value={kitchenPrinterName}
                    onChange={(e) => setKitchenPrinterName(e.target.value)}
                    disabled={!canManage}
                    style={selectStyle}
                  >
                    <option value="">— Misma que cliente —</option>
                    {printerList.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <input
                    className="settings-input"
                    type="text"
                    value={kitchenPrinterName}
                    onChange={(e) => setKitchenPrinterName(e.target.value)}
                    disabled={!canManage}
                    placeholder="Star TSP100"
                    style={inputStyle}
                  />
                )}
              </div>
            )}
          </div>

          {printerList.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
              {printerList.length} impresora{printerList.length !== 1 ? "s" : ""} detectada{printerList.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          padding: "14px 16px", background: "#f8fafc",
          border: "1px solid #e5e7eb", borderRadius: 10,
          fontSize: 13, color: "var(--admin-text-secondary)", lineHeight: 1.6,
        }}>
          En modo navegador no es necesario configurar impresoras.
          El sistema usará la impresora predeterminada del navegador.
        </div>
      )}
    </SCard>
  ) : (
    <SCard title="Impresoras" subtitle="Configura las impresoras del TPV">
      <div style={{
        padding: "14px 16px", background: "#f8fafc",
        border: "1px solid #e5e7eb", borderRadius: 10,
        fontSize: 13, color: "var(--admin-text-secondary)", lineHeight: 1.6,
      }}>
        En modo navegador no es necesario configurar impresoras.
        El sistema usará la impresora predeterminada del navegador.
      </div>
    </SCard>
  );

  // ─── CARD 3: Formato del ticket ──────────────────────────────────────────────
  const card3 = (
    <SCard title="Formato del ticket" subtitle="Elige el ancho y ve cómo quedará el ticket">
      <div>
        <label style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)", display: "block", marginBottom: 8 }}>
          Ancho del ticket
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["58mm", "80mm"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => { if (canManage) setPrintWidth(w); }}
              style={{
                border: `2px solid ${printWidth === w ? "var(--brand-primary)" : "#e5e7eb"}`,
                borderRadius: 8, padding: "6px 20px",
                background: printWidth === w ? "var(--brand-primary-soft)" : "#fff",
                color: printWidth === w ? "var(--brand-hover)" : "var(--admin-text-primary)",
                fontWeight: printWidth === w ? 700 : 400,
                fontSize: 14, cursor: canManage ? "pointer" : "not-allowed",
                opacity: canManage ? 1 : 0.6,
              }}
            >
              {w}{printWidth === w ? " ✓" : ""}
            </button>
          ))}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--admin-text-secondary)" }}>
          80mm es el más común. Usa 58mm para impresoras pequeñas.
        </p>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)", marginBottom: 8 }}>
          Vista previa del ticket
        </div>
        <TicketPreview width={printWidth} restaurantName={restaurantName} />
      </div>
    </SCard>
  );

  // ─── CARD 4: Impresión automática ────────────────────────────────────────────
  const card4 = (
    <SCard title="Impresión automática" subtitle="¿Cuándo imprimir automáticamente?">
      <div style={{ display: "grid", gap: 10 }}>
        <ToggleRow
          icon=""
          label="Al recibir pedido web"
          description="Imprime al instante cuando llega un pedido online."
          checked={printOnNewOrder}
          onChange={setPrintOnNewOrder}
          disabled={!canManage}
        />
        <ToggleRow
          icon=""
          label="Al aceptar pedido"
          description="Imprime cuando cambias el estado a «Aceptado»."
          checked={printOnAccept}
          onChange={setPrintOnAccept}
          disabled={!canManage}
        />
        <ToggleRow
          icon=""
          label="Al crear venta en TPV"
          description="Imprime automáticamente al cobrar en el TPV."
          checked={autoPrintPosOrders}
          onChange={setAutoPrintPosOrders}
          disabled={!canManage}
        />
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", background: "#f8fafc",
        border: "1px solid #e5e7eb", borderRadius: 10,
      }}>
        <Toggle checked={printKitchenSeparate} onChange={setPrintKitchenSeparate} disabled={!canManage} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}> Imprimir ticket de cocina por separado</div>
          <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 2 }}>
            Además del ticket del cliente, imprime uno para cocina sin precios.
          </div>
        </div>
      </div>
    </SCard>
  );

  // ─── CARD 5: Sonido y alertas ─────────────────────────────────────────────────
  const card5 = (
    <SCard title="Sonido y alertas" subtitle="Notificaciones sonoras para nuevos pedidos">
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <ToggleRow
            icon=""
            label="Sonido al recibir pedido nuevo"
            description="Reproduce un pitido cuando llega un nuevo pedido."
            checked={printSoundEnabled}
            onChange={setPrintSoundEnabled}
            disabled={!canManage}
          />
          {printSoundEnabled && (
            <div style={{ paddingLeft: 16, paddingTop: 8 }}>
              <button
                type="button"
                onClick={playTestBeep}
                style={{
                  background: "#fff", border: "1px solid #d1d5db",
                  borderRadius: 8, padding: "6px 14px", fontSize: 13,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                }}
              >
                 Probar sonido
              </button>
            </div>
          )}
        </div>
        <ToggleRow
          icon=""
          label="Reintentar si falla la impresión"
          description="Si la impresión falla, lo intenta hasta 2 veces más."
          checked={printRetryEnabled}
          onChange={setPrintRetryEnabled}
          disabled={!canManage}
        />
      </div>
    </SCard>
  );

  // ─── CARD 6: Prueba de impresión ─────────────────────────────────────────────
  const configSummaryParts = [
    `Modo: ${printMode === "desktop_app" ? "App Windows" : "Navegador"}`,
    customerPrinterName ? `Impresora: ${customerPrinterName}` : null,
    `Ancho: ${printWidth}`,
    `Auto: ${anyAutoPrint ? "Sí" : "No"}`,
  ].filter(Boolean);

  const card6 = (
    <SCard title=" Probar configuración" subtitle="Imprime un ticket de prueba para verificar que todo funciona" accent>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => { void handleTestPrint("customer"); }}
          style={{
            flex: 1, minWidth: 150,
            background: "var(--brand-primary)", color: "#fff",
            border: "none", borderRadius: 10,
            padding: "12px 16px", fontSize: 14, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8,
          }}
        >
           Imprimir ticket cliente
        </button>
        <button
          type="button"
          onClick={() => { void handleTestPrint("kitchen"); }}
          style={{
            flex: 1, minWidth: 150,
            background: "#f3f4f6", color: "var(--admin-text-primary)",
            border: "1px solid #e5e7eb", borderRadius: 10,
            padding: "12px 16px", fontSize: 14, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8,
          }}
        >
           Imprimir ticket cocina
        </button>
      </div>

      {testPrintMsg && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500,
          background: testPrintMsg.ok ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${testPrintMsg.ok ? "#bbf7d0" : "#fecaca"}`,
          color: testPrintMsg.ok ? "#15803d" : "#dc2626",
        }}>
          {testPrintMsg.text}
        </div>
      )}

      <div style={{
        padding: "8px 12px", background: "#f8fafc",
        border: "1px solid #e5e7eb", borderRadius: 8,
        fontSize: 12, color: "var(--admin-text-secondary)",
      }}>
        {configSummaryParts.join(" | ")}
      </div>
    </SCard>
  );

  // ─── CARD 7: App Windows (only if desktop_app mode) ──────────────────────────
  const card7 = printMode === "desktop_app" ? (
    <SCard title="App de impresión Windows" subtitle="Descarga e instala la app en el PC con la impresora">
      <div style={{ display: "grid", gap: 16 }}>
        {/* Steps */}
        <div style={{ display: "grid", gap: 10 }}>
          {[
            {
              n: 1, text: "Descarga la app de impresión",
              action: (
                <button
                  type="button"
                  onClick={() => alert("La app estará disponible próximamente.")}
                  style={{
                    background: "var(--brand-primary)", color: "#fff",
                    border: "none", borderRadius: 8,
                    padding: "6px 14px", fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Descargar app ↓
                </button>
              ),
            },
            { n: 2, text: "Instálala en el PC conectado a la impresora" },
            { n: 3, text: "Ejecuta la app — se queda en segundo plano en la bandeja del sistema" },
            { n: 4, text: "Vuelve aquí y pulsa «Probar conexión»" },
          ].map(({ n, text, action }) => (
            <div key={n} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "10px 14px", background: "#f8fafc",
              border: "1px solid #e5e7eb", borderRadius: 10,
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: "50%",
                background: "var(--brand-primary)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                {n}
              </span>
              <div style={{ flex: 1, fontSize: 13, color: "var(--admin-text-primary)", paddingTop: 3 }}>
                {text}
              </div>
              {action}
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-text-primary)", marginBottom: 8 }}>
            Preguntas frecuentes
          </div>
          <FaqAccordion />
        </div>
      </div>
    </SCard>
  ) : null;

  // ─── Save button ─────────────────────────────────────────────────────────────
  const saveBar = (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        type="button"
        onClick={onSave}
        disabled={!canManage || saving}
        style={{
          background: (!canManage || saving) ? "#9ca3af" : "var(--brand-primary)",
          color: "#fff", border: "none", borderRadius: 10,
          padding: "10px 24px", fontWeight: 700, fontSize: 14,
          cursor: (!canManage || saving) ? "not-allowed" : "pointer",
          display: "inline-flex", alignItems: "center", gap: 8,
        }}
      >
        {saving && (
          <span style={{
            width: 13, height: 13,
            border: "2px solid rgba(255,255,255,0.35)",
            borderTop: "2px solid #fff", borderRadius: "50%",
            display: "inline-block",
            animation: "settings-spin 0.8s linear infinite",
          }} />
        )}
        {saving ? "Guardando..." : "Guardar configuración de impresión"}
      </button>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--admin-text-primary)" }}>
           Configuración de impresión
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--admin-text-secondary)" }}>
          Configura cómo se imprimen los tickets de pedidos y TPV
        </p>
      </div>
      {card1}
      {card2}
      {card3}
      {card4}
      {card5}
      {card6}
      {card7}
      {saveBar}
    </div>
  );
}
