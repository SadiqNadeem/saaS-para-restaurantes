import { useEffect, useRef, useState } from "react";

type HelpTooltipProps = {
  text: string;
  position?: "top" | "right" | "bottom" | "left";
  size?: "sm" | "md";
};

export function HelpTooltip({ text, position = "top", size = "sm" }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible]);

  const btnSize = size === "sm" ? 16 : 20;
  const fontSize = size === "sm" ? 10 : 12;

  const tooltipPos: Record<string, React.CSSProperties> = {
    top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
    left: { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  };

  const arrowPos: Record<string, React.CSSProperties> = {
    top: { bottom: -4, left: "50%", marginLeft: -4 },
    bottom: { top: -4, left: "50%", marginLeft: -4 },
    right: { left: -4, top: "50%", marginTop: -4 },
    left: { right: -4, top: "50%", marginTop: -4 },
  };

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}
    >
      <button
        type="button"
        aria-label="Ayuda"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={(e) => { e.stopPropagation(); setVisible((v) => !v); }}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        style={{
          width: btnSize,
          height: btnSize,
          borderRadius: "50%",
          border: "1.5px solid #cbd5e1",
          background: "#f8fafc",
          color: "#64748b",
          fontSize,
          fontWeight: 700,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          lineHeight: 1,
          marginLeft: 4,
          outline: "none",
          transition: "border-color 0.15s",
        }}
      >
        ?
      </button>

      {visible && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 9999,
            maxWidth: 280,
            width: "max-content",
            background: "#1e293b",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 11px",
            fontSize: 12,
            lineHeight: 1.5,
            fontWeight: 400,
            whiteSpace: "normal",
            pointerEvents: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
            animation: "ht-fade 0.15s ease forwards",
            ...tooltipPos[position],
          }}
        >
          {text}
          <span
            aria-hidden
            style={{
              position: "absolute",
              width: 8,
              height: 8,
              background: "#1e293b",
              transform: "rotate(45deg)",
              ...arrowPos[position],
            }}
          />
        </span>
      )}
    </span>
  );
}
