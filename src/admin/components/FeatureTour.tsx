import { useLayoutEffect, useState } from "react";
import type { CSSProperties } from "react";

type TourStep = {
  target: string;
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
};

type FeatureTourProps = {
  steps: TourStep[];
  tourKey: string;
  onComplete?: () => void;
};

type HighlightRect = { top: number; left: number; width: number; height: number } | null;

export function FeatureTour({ steps, tourKey, onComplete }: FeatureTourProps) {
  const storageKey = `tour_completed_${tourKey}`;
  const [active, setActive] = useState(() => {
    try { return !localStorage.getItem(storageKey); } catch { return true; }
  });
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<HighlightRect>(null);

  const currentStep = steps[stepIdx];

  useLayoutEffect(() => {
    if (!active || !currentStep) return;
    const el = document.querySelector(currentStep.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height });
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [active, stepIdx, currentStep]);

  if (!active || !currentStep) return null;

  const complete = () => {
    try { localStorage.setItem(storageKey, "1"); } catch {}
    setActive(false);
    onComplete?.();
  };

  const next = () => {
    if (stepIdx < steps.length - 1) setStepIdx((i) => i + 1);
    else complete();
  };

  const PADDING = 8;

  const highlightStyle: CSSProperties = rect
    ? {
        position: "fixed",
        top: rect.top - window.scrollY - PADDING,
        left: rect.left - window.scrollX - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
        borderRadius: 10,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
        zIndex: 9990,
        pointerEvents: "none",
        border: "2px solid var(--brand-primary, #4ec580)",
      }
    : {};

  const popupStyle: CSSProperties = {
    position: "fixed",
    zIndex: 9991,
    width: 300,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  };

  if (rect) {
    const winH = window.innerHeight;
    const winW = window.innerWidth;
    const POPUP_H = 200;
    const POPUP_W = 300;
    if (rect.top + window.scrollY - window.scrollY > POPUP_H + 40) {
      Object.assign(popupStyle, {
        top: Math.max(12, rect.top - window.scrollY - POPUP_H - 20),
        left: Math.min(winW - POPUP_W - 16, Math.max(16, rect.left - window.scrollX)),
        transform: "none",
      });
    } else {
      Object.assign(popupStyle, {
        top: Math.min(winH - POPUP_H - 16, rect.top - window.scrollY + rect.height + 20),
        left: Math.min(winW - POPUP_W - 16, Math.max(16, rect.left - window.scrollX)),
        transform: "none",
      });
    }
  }

  return (
    <>
      {rect && (
        <div
          aria-hidden
          style={highlightStyle}
        />
      )}

      <div
        role="dialog"
        aria-label={`Tour: ${currentStep.title}`}
        style={{
          ...popupStyle,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
          border: "1px solid #e5e7eb",
          padding: "16px 18px",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <strong style={{ fontSize: 15, color: "#111827", lineHeight: 1.3 }}>{currentStep.title}</strong>
          <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap", marginTop: 2 }}>
            Paso {stepIdx + 1} de {steps.length}
          </span>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{currentStep.content}</p>

        <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
          {steps.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === stepIdx ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === stepIdx ? "var(--color-primary, #17212B)" : "#d1d5db",
                transition: "width 0.2s ease, background 0.2s ease",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={complete}
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              fontSize: 12,
              padding: "4px 0",
              textDecoration: "underline",
            }}
          >
            Saltar tour
          </button>
          <button
            type="button"
            onClick={next}
            style={{
              background: "var(--color-primary, #17212B)",
              border: "none",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 16px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {stepIdx < steps.length - 1 ? "Siguiente →" : "Finalizar"}
          </button>
        </div>
      </div>

      {!rect && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9989,
          }}
        />
      )}
    </>
  );
}
