/**
 * KebabPromo — Vídeo promocional del SaaS de restaurantes
 * 60 s · 1800 frames · 30 fps · 1920×1080
 *
 * Escenas (frame dentro de cada <Sequence> empieza en 0)
 *   S1   0– 149   Hook              "¿Sigues gestionando tu restaurante con papel?"
 *   S2  150– 299   Solución         Presentamos la plataforma
 *   S3  300– 599   Carta digital    Smartphone con menú interactivo
 *   S4  600– 899   Admin pedidos    Panel en tiempo real
 *   S5  900–1139   TPV / POS        Terminal punto de venta
 *   S6 1140–1349   Mesas con QR     Plano del restaurante
 *   S7 1350–1559   Marketing        Cupones · WhatsApp · Fidelización
 *   S8 1560–1799   CTA + confetti   Fade out final
 */

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  random,
} from "remotion";
import type {FC} from "react";

// ─── Design tokens (from kebab-saas-v1/src/index.css) ────────────────────────
const C = {
  bg: "#0a0a0a",
  card: "#1e293b",
  cardAlt: "#0f172a",
  green: "#4ec580",        // --brand-primary
  greenDark: "#2e8b57",    // --brand-hover
  greenSoft: "rgba(78,197,128,0.14)",   // --brand-primary-soft
  greenBorder: "rgba(78,197,128,0.45)", // --brand-primary-border
  white: "#ffffff",
  textPrimary: "#e2e8f0",
  textMuted: "#94a3b8",
  // Status tokens (from index.css)
  statusPending: {bg: "#fef3c7", color: "#92400e"},
  statusAccepted: {bg: "#dbeafe", color: "#1e40af"},
  statusPreparing: {bg: "#ffedd5", color: "#9a3412"},
  statusDelivered: {bg: "#dcfce7", color: "#14532d"},
};

// ─── Animation helpers ────────────────────────────────────────────────────────

function fi(f: number, s: number, e: number, from = 0, to = 1): number {
  return interpolate(f, [s, e], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Fade in, hold, fade out */
function ramp(
  f: number,
  inS: number,
  inE: number,
  outS: number,
  outE: number
): number {
  return Math.min(fi(f, inS, inE), fi(f, outS, outE, 1, 0));
}

function up(f: number, start: number, dur = 16, dist = 28): number {
  return interpolate(f, [start, start + dur], [dist, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

/** Dot-grid texture */
const Grid: FC<{opacity?: number}> = ({opacity = 1}) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage: `radial-gradient(rgba(78,197,128,0.07) 1px, transparent 1px)`,
      backgroundSize: "48px 48px",
      opacity,
    }}
  />
);

/** Radial green glow */
const Glow: FC<{
  size?: number;
  top?: string;
  left?: string;
  alpha?: number;
}> = ({size = 800, top = "50%", left = "50%", alpha = 1}) => (
  <div
    style={{
      position: "absolute",
      width: size,
      height: size * 0.6,
      borderRadius: "50%",
      background:
        "radial-gradient(ellipse, rgba(78,197,128,0.2) 0%, transparent 65%)",
      top,
      left,
      transform: "translate(-50%, -50%)",
      opacity: alpha,
      pointerEvents: "none",
    }}
  />
);

/** Small eyebrow label above headings */
const Label: FC<{children: string; alpha?: number; color?: string}> = ({
  children,
  alpha = 1,
  color = C.green,
}) => (
  <div
    style={{
      fontSize: 22,
      fontFamily: "Arial, sans-serif",
      fontWeight: 700,
      letterSpacing: 5,
      textTransform: "uppercase" as const,
      color,
      opacity: alpha,
      marginBottom: 22,
    }}
  >
    {children}
  </div>
);

/** Mac-style browser chrome */
const BrowserChrome: FC<{url: string}> = ({url}) => (
  <div
    style={{
      background: "#1a1a2e",
      borderRadius: "14px 14px 0 0",
      padding: "12px 20px",
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}
  >
    {[["#ff5f57"], ["#ffbd2e"], ["#28c940"]].map(([bg], i) => (
      <div
        key={i}
        style={{width: 12, height: 12, borderRadius: "50%", background: bg}}
      />
    ))}
    <div
      style={{
        marginLeft: 16,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 6,
        padding: "4px 0",
        fontSize: 14,
        color: C.textMuted,
        fontFamily: "Arial, sans-serif",
        flex: 1,
        textAlign: "center",
      }}
    >
      {url}
    </div>
  </div>
);

// ─── S1 — Hook ────────────────────────────────────────────────────────────────
const Scene1: FC = () => {
  const frame = useCurrentFrame();
  const alpha = ramp(frame, 0, 14, 132, 150);

  const line1 = ["¿Sigues", "gestionando", "tu", "restaurante"];
  const line2 = ["con", "papel", "y", "lápiz?"];

  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        justifyContent: "center",
        alignItems: "center",
        opacity: alpha,
      }}
    >
      <Grid />
      <Glow size={900} alpha={0.6} />

      <div
        style={{textAlign: "center", padding: "0 200px", zIndex: 1}}
      >
        {/* Line 1 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            justifyContent: "center",
            gap: "0 20px",
            marginBottom: 14,
          }}
        >
          {line1.map((w, i) => {
            const d = 6 + i * 10;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  fontSize: 88,
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 900,
                  color: C.white,
                  opacity: fi(frame, d, d + 14),
                  transform: `translateY(${up(frame, d, 14, 30)}px)`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>

        {/* Line 2 — "papel y lápiz" in green */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            justifyContent: "center",
            gap: "0 20px",
          }}
        >
          {line2.map((w, i) => {
            const d = 52 + i * 10;
            const isAccent = i === 1 || i === 2;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  fontSize: 88,
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 900,
                  color: isAccent ? C.green : C.white,
                  opacity: fi(frame, d, d + 14),
                  transform: `translateY(${up(frame, d, 14, 30)}px)`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── S2 — Solution intro ──────────────────────────────────────────────────────
const Scene2: FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const alpha = ramp(frame, 0, 14, 132, 150);

  const logoScale = spring({frame, fps, config: {damping: 14, stiffness: 100}});
  const logoAlpha = fi(frame, 0, 16);
  const logoX = fi(frame, 0, 20, -100, 0);

  const subAlpha = fi(frame, 24, 38);
  const subY = up(frame, 24, 16, 22);

  const bullets = [
    {icon: "🌯", text: "Carta digital y pedidos online"},
    {icon: "🖥️", text: "TPV profesional integrado"},
    {icon: "📱", text: "Gestión de mesas con QR"},
    {icon: "💌", text: "Marketing y fidelización"},
  ];

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(135deg, #071510 0%, #0d2a1a 50%, #0a0a0a 100%)",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column" as const,
        opacity: alpha,
      }}
    >
      <Grid />
      <Glow size={1000} alpha={0.8} />

      <div style={{textAlign: "center", zIndex: 1}}>
        {/* Brand headline */}
        <div
          style={{
            opacity: logoAlpha,
            transform: `translateX(${logoX}px) scale(${logoScale})`,
            marginBottom: 18,
          }}
        >
          <h1
            style={{
              fontSize: 112,
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              margin: 0,
              color: C.green,
              letterSpacing: -2,
            }}
          >
            Tu Restaurante Digital
          </h1>
        </div>

        {/* Tagline */}
        <div
          style={{
            opacity: subAlpha,
            transform: `translateY(${subY}px)`,
            fontSize: 40,
            color: C.textMuted,
            fontFamily: "Arial, sans-serif",
            marginBottom: 56,
            letterSpacing: 0.3,
          }}
        >
          Todo lo que necesitas. En una sola plataforma.
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: 20,
            justifyContent: "center",
            flexWrap: "wrap" as const,
          }}
        >
          {bullets.map((b, i) => {
            const d = 42 + i * 14;
            return (
              <div
                key={i}
                style={{
                  opacity: fi(frame, d, d + 16),
                  transform: `translateY(${up(frame, d, 16, 20)}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: C.greenSoft,
                  border: `1.5px solid ${C.greenBorder}`,
                  borderRadius: 50,
                  padding: "14px 32px",
                  fontSize: 26,
                  color: C.green,
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 600,
                }}
              >
                <span style={{fontSize: 24}}>{b.icon}</span>
                {b.text}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── S3 — Carta digital + smartphone ─────────────────────────────────────────

const PhoneMenu: FC<{frame: number}> = ({frame}) => {
  const categories = ["Kebabs", "Durum", "Bebidas", "Extras"];
  const products = [
    {name: "Kebab Mixto", price: "7.50€", emoji: "🥙"},
    {name: "Durum Pollo", price: "6.00€", emoji: "🌯"},
    {name: "Patatas Fritas", price: "2.50€", emoji: "🍟"},
  ];
  const addPulse = 1 + Math.sin(frame * 0.2) * 0.04;

  return (
    <div
      style={{
        width: 360,
        height: 660,
        borderRadius: 40,
        background: "#111",
        border: "9px solid #2a2a2a",
        overflow: "hidden",
        position: "relative" as const,
        boxShadow: "0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      {/* Notch */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 110,
          height: 26,
          background: "#2a2a2a",
          borderRadius: "0 0 18px 18px",
          zIndex: 10,
        }}
      />

      {/* Restaurant header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${C.greenDark}, ${C.green})`,
          padding: "44px 18px 18px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontFamily: "Arial, sans-serif",
            fontWeight: 900,
            color: C.white,
          }}
        >
          🌯 Kebab Palace
        </div>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.8)",
            marginTop: 4,
            fontFamily: "Arial, sans-serif",
          }}
        >
          ⏱ 20-30 min · Abierto ahora
        </div>
      </div>

      {/* Category pills */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 14px",
          background: "#111",
          overflowX: "hidden" as const,
        }}
      >
        {categories.map((cat, i) => (
          <div
            key={i}
            style={{
              background: i === 0 ? C.green : "#222",
              color: i === 0 ? "#000" : C.textMuted,
              borderRadius: 20,
              padding: "5px 13px",
              fontSize: 12,
              fontFamily: "Arial, sans-serif",
              fontWeight: 600,
              whiteSpace: "nowrap" as const,
              opacity: fi(frame, 18 + i * 8, 30 + i * 8),
            }}
          >
            {cat}
          </div>
        ))}
      </div>

      {/* Products */}
      <div style={{padding: "8px 12px", background: "#111"}}>
        {products.map((p, i) => {
          const d = 38 + i * 20;
          return (
            <div
              key={i}
              style={{
                opacity: fi(frame, d, d + 16),
                transform: `translateY(${up(frame, d, 16, 18)}px)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#1a1a1a",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 8,
              }}
            >
              <div
                style={{display: "flex", alignItems: "center", gap: 10}}
              >
                <span style={{fontSize: 28}}>{p.emoji}</span>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      color: C.white,
                      fontFamily: "Arial, sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.green,
                      fontFamily: "Arial, sans-serif",
                      fontWeight: 600,
                    }}
                  >
                    {p.price}
                  </div>
                </div>
              </div>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: C.green,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: "#000",
                  fontWeight: 900,
                  transform: `scale(${addPulse})`,
                }}
              >
                +
              </div>
            </div>
          );
        })}
      </div>

      {/* Add to cart bar */}
      <div
        style={{
          padding: "10px 12px",
          background: "#111",
          borderTop: "1px solid #222",
        }}
      >
        <div
          style={{
            background: C.green,
            borderRadius: 10,
            padding: "12px",
            textAlign: "center",
            fontSize: 15,
            fontFamily: "Arial, sans-serif",
            fontWeight: 800,
            color: "#000",
            transform: `scale(${addPulse})`,
            opacity: fi(frame, 88, 102),
          }}
        >
          Ver carrito — 7.50 €
        </div>
      </div>
    </div>
  );
};

const Scene3: FC = () => {
  const frame = useCurrentFrame();
  const alpha = ramp(frame, 0, 14, 278, 300);

  const leftAlpha = fi(frame, 0, 18);
  const leftY = up(frame, 0, 18, 26);
  const phoneAlpha = fi(frame, 14, 30);
  const phoneScale = fi(frame, 14, 32, 0.88, 1);
  const qrAlpha = fi(frame, 95, 110);

  return (
    <AbsoluteFill style={{background: C.bg, opacity: alpha}}>
      <Grid />
      <Glow size={700} left="72%" top="55%" alpha={0.45} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 100,
          padding: "0 110px",
          zIndex: 1,
          position: "relative" as const,
          width: "100%",
          height: "100%",
        }}
      >
        {/* Left text */}
        <div
          style={{
            flex: 1,
            opacity: leftAlpha,
            transform: `translateY(${leftY}px)`,
          }}
        >
          <Label alpha={fi(frame, 0)}>Carta digital</Label>
          <h2
            style={{
              fontSize: 72,
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              color: C.white,
              margin: "0 0 20px",
              lineHeight: 1.1,
            }}
          >
            Tu carta,<br />
            <span style={{color: C.green}}>siempre disponible</span>
          </h2>
          <p
            style={{
              fontSize: 30,
              color: C.textMuted,
              fontFamily: "Arial, sans-serif",
              margin: "0 0 48px",
              lineHeight: 1.5,
            }}
          >
            Desde cualquier dispositivo.
            <br />
            Sin app. Sin registro.
          </p>

          {/* QR callout */}
          <div
            style={{
              opacity: qrAlpha,
              transform: `translateY(${up(frame, 95, 14, 20)}px)`,
              display: "flex",
              alignItems: "center",
              gap: 20,
              background: C.greenSoft,
              border: `1.5px solid ${C.greenBorder}`,
              borderRadius: 16,
              padding: "20px 28px",
              maxWidth: 460,
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                background: C.white,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 34,
                flexShrink: 0,
              }}
            >
              ▦
            </div>
            <div>
              <div
                style={{
                  fontSize: 22,
                  color: C.green,
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 700,
                }}
              >
                Escanea y pide en mesa
              </div>
              <div
                style={{
                  fontSize: 17,
                  color: C.textMuted,
                  fontFamily: "Arial, sans-serif",
                }}
              >
                Pedido directo al TPV
              </div>
            </div>
          </div>
        </div>

        {/* Phone mockup */}
        <div
          style={{
            flexShrink: 0,
            opacity: phoneAlpha,
            transform: `scale(${phoneScale})`,
          }}
        >
          <PhoneMenu frame={frame} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── S4 — Admin orders ────────────────────────────────────────────────────────

type OrderStatus = "pending" | "accepted" | "preparing";

const StatusChip: FC<{status: OrderStatus}> = ({status}) => {
  const styles: Record<OrderStatus, {bg: string; color: string; label: string}> = {
    pending: {...C.statusPending, label: "Pendiente"},
    accepted: {...C.statusAccepted, label: "Aceptado"},
    preparing: {...C.statusPreparing, label: "Preparando"},
  };
  const s = styles[status];
  return (
    <div
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: 50,
        padding: "6px 18px",
        fontSize: 15,
        fontFamily: "Arial, sans-serif",
        fontWeight: 700,
      }}
    >
      {s.label}
    </div>
  );
};

const OrderRow: FC<{
  id: string;
  name: string;
  items: string;
  total: string;
  status: OrderStatus;
  isNew?: boolean;
  frame: number;
  delay: number;
}> = ({id, name, items, total, status, isNew, frame, delay}) => {
  const rowAlpha = fi(frame, delay, delay + 16);
  const rowY = up(frame, delay, 16, 20);
  const glowSize = isNew ? 6 + Math.sin(frame * 0.28) * 3 : 0;

  return (
    <div
      style={{
        opacity: rowAlpha,
        transform: `translateY(${rowY}px)`,
        background: C.card,
        border: `1.5px solid ${isNew ? C.greenBorder : "rgba(255,255,255,0.06)"}`,
        borderRadius: 12,
        padding: "16px 22px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
        boxShadow: isNew ? `0 0 20px ${C.greenSoft}` : "none",
      }}
    >
      <div style={{display: "flex", alignItems: "center", gap: 14}}>
        {isNew && (
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: C.green,
              flexShrink: 0,
              boxShadow: `0 0 ${glowSize}px ${C.green}`,
            }}
          />
        )}
        <div>
          <div
            style={{
              fontSize: 19,
              color: C.white,
              fontFamily: "Arial, sans-serif",
              fontWeight: 700,
            }}
          >
            {name}{" "}
            <span
              style={{
                color: C.textMuted,
                fontWeight: 400,
                fontSize: 15,
              }}
            >
              #{id}
            </span>
          </div>
          <div
            style={{
              fontSize: 15,
              color: C.textMuted,
              fontFamily: "Arial, sans-serif",
              marginTop: 3,
            }}
          >
            {items}
          </div>
        </div>
      </div>
      <div style={{display: "flex", alignItems: "center", gap: 16}}>
        <div
          style={{
            fontSize: 20,
            color: C.green,
            fontFamily: "Arial, sans-serif",
            fontWeight: 700,
          }}
        >
          {total}
        </div>
        <StatusChip status={status} />
      </div>
    </div>
  );
};

const Scene4: FC = () => {
  const frame = useCurrentFrame();
  const alpha = ramp(frame, 0, 14, 278, 300);

  const textAlpha = fi(frame, 0, 16);
  const textY = up(frame, 0, 16, 24);

  // Live notification slides in
  const notifAlpha = fi(frame, 46, 60);
  const notifX = fi(frame, 46, 62, 80, 0);

  // Order #1 status progression
  const order1Status: OrderStatus =
    frame < 85 ? "pending" : frame < 165 ? "accepted" : "preparing";

  // Live dot pulse
  const dotGlow = 6 + Math.sin(frame * 0.22) * 3;

  return (
    <AbsoluteFill style={{background: C.bg, opacity: alpha}}>
      <Grid />
      <Glow size={600} top="30%" alpha={0.35} />

      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          padding: "0 80px",
          gap: 80,
          zIndex: 1,
          position: "relative" as const,
        }}
      >
        {/* Left overlay */}
        <div
          style={{
            width: 460,
            flexShrink: 0,
            opacity: textAlpha,
            transform: `translateY(${textY}px)`,
          }}
        >
          <Label alpha={fi(frame, 0)}>Panel de pedidos</Label>
          <h2
            style={{
              fontSize: 62,
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              color: C.white,
              margin: "0 0 20px",
              lineHeight: 1.15,
            }}
          >
            Gestiona pedidos<br />
            <span style={{color: C.green}}>en tiempo real</span>
          </h2>
          <p
            style={{
              fontSize: 26,
              color: C.textMuted,
              fontFamily: "Arial, sans-serif",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Notificaciones instantáneas
            <br />
            Control total desde el panel
          </p>
        </div>

        {/* Browser mock */}
        <div style={{flex: 1}}>
          <BrowserChrome url="app.turestaurante.com/admin/orders" />
          <div
            style={{
              background: C.cardAlt,
              borderRadius: "0 0 14px 14px",
              padding: "22px 24px",
              border: "1px solid rgba(255,255,255,0.06)",
              borderTop: "none",
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  color: C.white,
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 800,
                }}
              >
                Pedidos de hoy
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: fi(frame, 8, 20),
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: C.green,
                    boxShadow: `0 0 ${dotGlow}px ${C.green}`,
                  }}
                />
                <span
                  style={{
                    fontSize: 15,
                    color: C.green,
                    fontFamily: "Arial, sans-serif",
                    fontWeight: 600,
                  }}
                >
                  En directo
                </span>
              </div>
            </div>

            {/* Notification banner */}
            <div
              style={{
                opacity: notifAlpha,
                transform: `translateX(${notifX}px)`,
                background: `linear-gradient(90deg, ${C.greenSoft}, rgba(78,197,128,0.04))`,
                border: `1.5px solid ${C.greenBorder}`,
                borderRadius: 10,
                padding: "10px 18px",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 17,
                color: C.green,
                fontFamily: "Arial, sans-serif",
                fontWeight: 600,
              }}
            >
              <span style={{fontSize: 22}}>🔔</span>
              Nuevo pedido — Carlos M. #1249
            </div>

            {/* Order rows */}
            <OrderRow
              id="1249"
              name="Carlos M."
              items="2× Kebab Mixto · 1× Coca-Cola"
              total="17.50 €"
              status={order1Status}
              isNew
              frame={frame}
              delay={10}
            />
            <OrderRow
              id="1248"
              name="Ana García"
              items="1× Durum Pollo · Patatas"
              total="9.50 €"
              status="accepted"
              frame={frame}
              delay={18}
            />
            <OrderRow
              id="1247"
              name="Paco Ruiz"
              items="3× Kebab Mixto · Ensalada"
              total="25.00 €"
              status="preparing"
              frame={frame}
              delay={26}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── S5 — POS / TPV ───────────────────────────────────────────────────────────
const Scene5: FC = () => {
  const frame = useCurrentFrame();
  const alpha = ramp(frame, 0, 14, 218, 240);

  const textAlpha = fi(frame, 0, 16);
  const textY = up(frame, 0, 16, 24);

  const posGrid = [
    {name: "Kebab Mixto", price: "7.50 €", emoji: "🥙"},
    {name: "Durum Pollo", price: "6.00 €", emoji: "🌯"},
    {name: "Falafel Wrap", price: "6.50 €", emoji: "🌮"},
    {name: "Patatas Fritas", price: "2.50 €", emoji: "🍟"},
    {name: "Coca-Cola", price: "1.80 €", emoji: "🥤"},
    {name: "Agua", price: "1.00 €", emoji: "💧"},
  ];

  const cartItems = [
    {name: "Kebab Mixto", qty: 2, total: "15.00 €", delay: 58},
    {name: "Durum Pollo", qty: 1, total: "6.00 €", delay: 78},
    {name: "Coca-Cola", qty: 2, total: "3.60 €", delay: 98},
  ];

  const cobrarAlpha = fi(frame, 128, 144);
  const cobrarPulse = 1 + Math.sin(frame * 0.16) * 0.025;
  const cobrarGlow = 22 + Math.sin(frame * 0.16) * 8;

  return (
    <AbsoluteFill style={{background: C.bg, opacity: alpha}}>
      <Grid opacity={0.6} />

      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          padding: "0 80px",
          gap: 80,
          zIndex: 1,
          position: "relative" as const,
        }}
      >
        {/* Left text */}
        <div
          style={{
            width: 440,
            flexShrink: 0,
            opacity: textAlpha,
            transform: `translateY(${textY}px)`,
          }}
        >
          <Label alpha={fi(frame, 0)}>TPV / POS</Label>
          <h2
            style={{
              fontSize: 62,
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              color: C.white,
              margin: "0 0 20px",
              lineHeight: 1.15,
            }}
          >
            TPV profesional<br />
            <span style={{color: C.green}}>integrado</span>
          </h2>
          <p
            style={{
              fontSize: 26,
              color: C.textMuted,
              fontFamily: "Arial, sans-serif",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Venta en mostrador
            <br />
            Mesas · Delivery
            <br />
            Control de caja
          </p>
        </div>

        {/* POS mock */}
        <div
          style={{
            flex: 1,
            background: C.cardAlt,
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.07)",
            height: 580,
            display: "flex",
          }}
        >
          {/* Product grid */}
          <div
            style={{
              flex: 1,
              padding: "20px",
              borderRight: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                fontSize: 17,
                color: C.textMuted,
                fontFamily: "Arial, sans-serif",
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              Productos
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              {posGrid.map((p, i) => (
                <div
                  key={i}
                  style={{
                    opacity: fi(frame, 8 + i * 9, 22 + i * 9),
                    transform: `scale(${fi(frame, 8 + i * 9, 24 + i * 9, 0.86, 1)})`,
                    background: C.card,
                    borderRadius: 10,
                    padding: "16px 10px",
                    textAlign: "center",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{fontSize: 30, marginBottom: 6}}>{p.emoji}</div>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.white,
                      fontFamily: "Arial, sans-serif",
                      fontWeight: 600,
                      lineHeight: 1.2,
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: C.green,
                      fontFamily: "Arial, sans-serif",
                      fontWeight: 700,
                      marginTop: 4,
                    }}
                  >
                    {p.price}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div
            style={{
              width: 270,
              padding: "20px",
              display: "flex",
              flexDirection: "column" as const,
            }}
          >
            <div
              style={{
                fontSize: 17,
                color: C.textMuted,
                fontFamily: "Arial, sans-serif",
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              Carrito
            </div>
            <div style={{flex: 1}}>
              {cartItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    opacity: fi(frame, item.delay, item.delay + 14),
                    transform: `translateY(${up(frame, item.delay, 14, 14)}px)`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    paddingBottom: 12,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        color: C.white,
                        fontFamily: "Arial, sans-serif",
                        fontWeight: 600,
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.textMuted,
                        fontFamily: "Arial, sans-serif",
                      }}
                    >
                      ×{item.qty}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: C.green,
                      fontFamily: "Arial, sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {item.total}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 14,
                  opacity: fi(frame, 112, 126),
                }}
              >
                <span
                  style={{
                    fontSize: 19,
                    color: C.white,
                    fontFamily: "Arial, sans-serif",
                    fontWeight: 700,
                  }}
                >
                  Total
                </span>
                <span
                  style={{
                    fontSize: 21,
                    color: C.green,
                    fontFamily: "Arial, sans-serif",
                    fontWeight: 900,
                  }}
                >
                  24.60 €
                </span>
              </div>
              <div
                style={{
                  opacity: cobrarAlpha,
                  transform: `scale(${cobrarPulse})`,
                  background: C.green,
                  borderRadius: 10,
                  padding: "15px",
                  textAlign: "center",
                  fontSize: 20,
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 900,
                  color: "#000",
                  boxShadow: `0 0 ${cobrarGlow}px rgba(78,197,128,0.45)`,
                }}
              >
                Cobrar 24.60 €
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── S6 — Mesas / floor plan ──────────────────────────────────────────────────
const Scene6: FC = () => {
  const frame = useCurrentFrame();
  const alpha = ramp(frame, 0, 14, 190, 210);

  const textAlpha = fi(frame, 0, 16);
  const textY = up(frame, 0, 16, 24);

  const tables = [
    {id: 1, delay: 10},
    {id: 2, delay: 18},
    {id: 3, delay: 26},
    {id: 4, delay: 34},
    {id: 5, delay: 42},
    {id: 6, delay: 50},
  ];

  const t3Occupied = frame >= 80;
  const t3Pulse = t3Occupied ? 1 + Math.sin(frame * 0.2) * 0.02 : 1;

  const notifAlpha = fi(frame, 88, 102);
  const notifX = fi(frame, 88, 104, 70, 0);

  return (
    <AbsoluteFill style={{background: C.bg, opacity: alpha}}>
      <Grid />

      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          padding: "0 80px",
          gap: 80,
          zIndex: 1,
          position: "relative" as const,
        }}
      >
        {/* Left text */}
        <div
          style={{
            width: 460,
            flexShrink: 0,
            opacity: textAlpha,
            transform: `translateY(${textY}px)`,
          }}
        >
          <Label alpha={fi(frame, 0)}>Gestión de mesas</Label>
          <h2
            style={{
              fontSize: 62,
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              color: C.white,
              margin: "0 0 20px",
              lineHeight: 1.15,
            }}
          >
            Mesas con QR<br />
            <span style={{color: C.green}}>integrado</span>
          </h2>
          <p
            style={{
              fontSize: 26,
              color: C.textMuted,
              fontFamily: "Arial, sans-serif",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Los clientes piden directamente
            <br />
            desde su móvil en la mesa
          </p>
        </div>

        {/* Floor plan */}
        <div style={{flex: 1, display: "flex", flexDirection: "column" as const, gap: 32, alignItems: "center"}}>
          <div
            style={{
              background: C.cardAlt,
              borderRadius: 16,
              padding: "28px 36px",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                fontSize: 15,
                color: C.textMuted,
                fontFamily: "Arial, sans-serif",
                marginBottom: 22,
                textAlign: "center",
              }}
            >
              Planta del restaurante
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 18,
              }}
            >
              {tables.map((t) => {
                const isOcc = t.id === 3 && t3Occupied;
                return (
                  <div
                    key={t.id}
                    style={{
                      opacity: fi(frame, t.delay, t.delay + 16),
                      transform: `scale(${isOcc ? t3Pulse : 1})`,
                      width: 120,
                      height: 100,
                      background: isOcc ? C.greenSoft : C.card,
                      border: `2px solid ${isOcc ? C.greenBorder : "rgba(255,255,255,0.07)"}`,
                      borderRadius: 12,
                      display: "flex",
                      flexDirection: "column" as const,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      boxShadow: isOcc
                        ? `0 0 20px rgba(78,197,128,0.25)`
                        : "none",
                    }}
                  >
                    <span style={{fontSize: 26}}>🪑</span>
                    <span
                      style={{
                        fontSize: 13,
                        color: isOcc ? C.green : C.textMuted,
                        fontFamily: "Arial, sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      Mesa {t.id}
                    </span>
                    {isOcc && (
                      <span
                        style={{
                          fontSize: 10,
                          color: C.green,
                          fontFamily: "Arial, sans-serif",
                        }}
                      >
                        Ocupada
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* QR notification */}
          <div
            style={{
              opacity: notifAlpha,
              transform: `translateX(${notifX}px)`,
              background: C.greenSoft,
              border: `1.5px solid ${C.greenBorder}`,
              borderRadius: 14,
              padding: "16px 28px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span style={{fontSize: 30}}>📱</span>
            <div>
              <div
                style={{
                  fontSize: 19,
                  color: C.green,
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 700,
                }}
              >
                Mesa 3 — Nuevo pedido
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: C.textMuted,
                  fontFamily: "Arial, sans-serif",
                }}
              >
                Cliente escaneó el QR · Ahora mismo
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── S7 — Marketing ───────────────────────────────────────────────────────────
const Scene7: FC = () => {
  const frame = useCurrentFrame();
  const alpha = ramp(frame, 0, 14, 190, 210);

  const headerAlpha = fi(frame, 0, 16);
  const headerY = up(frame, 0, 16, 22);

  const cards = [
    {
      delay: 22,
      content: (
        <div
          style={{
            background: "linear-gradient(135deg, #0d1f10, #142010)",
            border: `1.5px solid ${C.greenBorder}`,
            borderRadius: 16,
            padding: "28px",
            textAlign: "center",
            height: 240,
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <div style={{fontSize: 38}}>🎟️</div>
          <div
            style={{
              fontSize: 16,
              color: C.textMuted,
              fontFamily: "Arial, sans-serif",
            }}
          >
            Cupón de bienvenida
          </div>
          <div
            style={{
              background: C.greenSoft,
              border: `2px dashed ${C.green}`,
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 26,
              color: C.green,
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              letterSpacing: 2,
            }}
          >
            BIENVENIDA10
          </div>
          <div
            style={{
              fontSize: 18,
              color: C.green,
              fontFamily: "Arial, sans-serif",
              fontWeight: 700,
            }}
          >
            10% de descuento
          </div>
        </div>
      ),
    },
    {
      delay: 40,
      content: (
        <div
          style={{
            background: "#141a20",
            border: "1.5px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: "28px",
            height: 240,
            display: "flex",
            flexDirection: "column" as const,
            justifyContent: "space-between",
          }}
        >
          <div style={{display: "flex", alignItems: "center", gap: 12}}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "#25D366",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              📱
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: C.textMuted,
                  fontFamily: "Arial, sans-serif",
                }}
              >
                WhatsApp Business
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: C.white,
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 700,
                }}
              >
                Tu Restaurante
              </div>
            </div>
          </div>
          <div
            style={{
              background: "#25D366",
              borderRadius: "12px 12px 12px 0",
              padding: "12px 16px",
              fontSize: 15,
              color: "#000",
              fontFamily: "Arial, sans-serif",
              lineHeight: 1.4,
            }}
          >
            🎉 ¡Hola! Tu pedido está listo.
            <br />
            Tiempo estimado: 15 min. 🛵
          </div>
          <div
            style={{
              fontSize: 12,
              color: C.textMuted,
              fontFamily: "Arial, sans-serif",
            }}
          >
            Enviado automáticamente ✓✓
          </div>
        </div>
      ),
    },
    {
      delay: 58,
      content: (
        <div
          style={{
            background: "linear-gradient(135deg, #16103a, #0e0c28)",
            border: "1.5px solid rgba(168,85,247,0.4)",
            borderRadius: 16,
            padding: "28px",
            textAlign: "center",
            height: 240,
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <div style={{fontSize: 36}}>⭐</div>
          <div
            style={{
              fontSize: 15,
              color: C.textMuted,
              fontFamily: "Arial, sans-serif",
            }}
          >
            Puntos acumulados
          </div>
          <div
            style={{
              fontSize: 64,
              color: "#a855f7",
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            150
          </div>
          <div
            style={{
              fontSize: 16,
              color: "#a855f7",
              fontFamily: "Arial, sans-serif",
              fontWeight: 600,
            }}
          >
            puntos
          </div>
          <div
            style={{
              fontSize: 13,
              color: C.textMuted,
              fontFamily: "Arial, sans-serif",
              marginTop: 4,
            }}
          >
            ¡Próximo: descuento de 5 €!
          </div>
        </div>
      ),
    },
  ];

  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column" as const,
        opacity: alpha,
      }}
    >
      <Grid />
      <Glow size={700} top="40%" alpha={0.3} />

      <div
        style={{
          textAlign: "center",
          marginBottom: 52,
          opacity: headerAlpha,
          transform: `translateY(${headerY}px)`,
          zIndex: 1,
        }}
      >
        <Label alpha={1}>Marketing automático</Label>
        <h2
          style={{
            fontSize: 72,
            fontFamily: "Arial, sans-serif",
            fontWeight: 900,
            color: C.white,
            margin: 0,
          }}
        >
          Cupones · WhatsApp ·{" "}
          <span style={{color: C.green}}>Fidelización</span>
        </h2>
      </div>

      <div
        style={{display: "flex", gap: 32, padding: "0 120px", zIndex: 1, width: "100%"}}
      >
        {cards.map((card, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              opacity: fi(frame, card.delay, card.delay + 18),
              transform: `translateY(${up(frame, card.delay, 18, 28)}px) scale(${fi(frame, card.delay, card.delay + 18, 0.92, 1)})`,
            }}
          >
            {card.content}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ─── S8 — CTA + confetti + fade to black ──────────────────────────────────────

const CONFETTI_COLORS = [
  C.green,
  "#86efac",
  "#34d399",
  "#ffffff",
  "#a3e635",
  "#fde68a",
  "#6ee7b7",
];

const Confetti: FC<{frame: number}> = ({frame}) => {
  const start = 22;
  const progress = Math.max(0, frame - start);

  const particles = Array.from({length: 55}, (_, i) => ({
    x: random(`cx${i}`) * 1920,
    startY: random(`cy${i}`) * -100 - 10,
    speed: random(`cs${i}`) * 7 + 3,
    color:
      CONFETTI_COLORS[
        Math.floor(random(`cc${i}`) * CONFETTI_COLORS.length)
      ],
    rot: random(`cr${i}`) * 360,
    rotSpeed: (random(`crs${i}`) - 0.5) * 7,
    w: random(`cw${i}`) * 14 + 7,
    h: random(`ch${i}`) * 7 + 4,
  }));

  return (
    <>
      {particles.map((p, i) => {
        const y = p.startY + progress * p.speed;
        if (y > 1120) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: p.x,
              top: y,
              width: p.w,
              height: p.h,
              background: p.color,
              transform: `rotate(${p.rot + progress * p.rotSpeed}deg)`,
              borderRadius: 2,
              opacity: fi(frame, start, start + 12),
            }}
          />
        );
      })}
    </>
  );
};

const Scene8: FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const fadeToBlack = fi(frame, 210, 240);
  const wrapAlpha = fi(frame, 0, 18);

  const logoScale = spring({
    frame,
    fps,
    config: {damping: 14, stiffness: 100},
  });
  const logoAlpha = fi(frame, 0, 18);

  const headlineAlpha = fi(frame, 22, 38);
  const headlineY = up(frame, 22, 18, 28);

  const urlAlpha = fi(frame, 46, 60);

  const btnAlpha = fi(frame, 56, 70);
  const btnScale = spring({
    frame: Math.max(0, frame - 56),
    fps,
    config: {damping: 13, stiffness: 130},
  });
  const btnPulse = 1 + Math.sin(frame * 0.13) * 0.022;
  const btnGlow = 44 + Math.sin(frame * 0.13) * 14;

  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column" as const,
        opacity: wrapAlpha,
      }}
    >
      <Grid opacity={0.4} />
      <Glow size={1100} alpha={0.55} />

      {/* Confetti */}
      <Confetti frame={frame} />

      {/* Content */}
      <div style={{textAlign: "center", zIndex: 1}}>
        {/* Brand pill */}
        <div
          style={{
            opacity: logoAlpha,
            transform: `scale(${logoScale})`,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 16,
              background: C.greenSoft,
              border: `1.5px solid ${C.greenBorder}`,
              borderRadius: 20,
              padding: "14px 40px",
            }}
          >
            <span style={{fontSize: 42}}>🌯</span>
            <span
              style={{
                fontSize: 50,
                fontFamily: "Arial, sans-serif",
                fontWeight: 900,
                color: C.green,
                letterSpacing: -1,
              }}
            >
              Tu Restaurante Digital
            </span>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            opacity: headlineAlpha,
            transform: `translateY(${headlineY}px)`,
            marginBottom: 18,
          }}
        >
          <h1
            style={{
              fontSize: 100,
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              color: C.white,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Empieza{" "}
            <span style={{color: C.green}}>gratis</span> hoy
          </h1>
        </div>

        {/* URL */}
        <div
          style={{
            opacity: urlAlpha,
            fontSize: 32,
            color: C.textMuted,
            fontFamily: "Arial, sans-serif",
            marginBottom: 52,
          }}
        >
          turestaurante.com
        </div>

        {/* CTA button */}
        <div
          style={{
            opacity: btnAlpha,
            transform: `scale(${btnScale * btnPulse})`,
          }}
        >
          <div
            style={{
              background: `linear-gradient(90deg, ${C.greenDark}, ${C.green})`,
              borderRadius: 60,
              padding: "28px 88px",
              fontSize: 44,
              color: "#000",
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              letterSpacing: 0.5,
              display: "inline-flex",
              alignItems: "center",
              gap: 18,
              boxShadow: `0 0 ${btnGlow}px rgba(78,197,128,0.65), 0 14px 44px rgba(0,0,0,0.5)`,
            }}
          >
            Crear mi restaurante{" "}
            <span style={{fontSize: 40, opacity: 0.9}}>→</span>
          </div>
        </div>
      </div>

      {/* Fade to black */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#000",
          opacity: fadeToBlack,
          zIndex: 200,
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Main composition ─────────────────────────────────────────────────────────
export const KebabPromo: FC = () => (
  <AbsoluteFill style={{background: C.bg}}>
    {/* S1  0–149   Hook */}
    <Sequence from={0} durationInFrames={150}>
      <Scene1 />
    </Sequence>

    {/* S2  150–299  Solution intro */}
    <Sequence from={150} durationInFrames={150}>
      <Scene2 />
    </Sequence>

    {/* S3  300–599  Storefront */}
    <Sequence from={300} durationInFrames={300}>
      <Scene3 />
    </Sequence>

    {/* S4  600–899  Admin orders */}
    <Sequence from={600} durationInFrames={300}>
      <Scene4 />
    </Sequence>

    {/* S5  900–1139 POS/TPV */}
    <Sequence from={900} durationInFrames={240}>
      <Scene5 />
    </Sequence>

    {/* S6  1140–1349 Floor plan */}
    <Sequence from={1140} durationInFrames={210}>
      <Scene6 />
    </Sequence>

    {/* S7  1350–1559 Marketing */}
    <Sequence from={1350} durationInFrames={210}>
      <Scene7 />
    </Sequence>

    {/* S8  1560–1799 CTA + confetti */}
    <Sequence from={1560} durationInFrames={240}>
      <Scene8 />
    </Sequence>
  </AbsoluteFill>
);
