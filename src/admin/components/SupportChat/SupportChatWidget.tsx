import { useCallback, useEffect, useState } from "react";
import { UnifiedAssistantDrawer } from "./UnifiedAssistantDrawer";

export function SupportChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    const handler = () => {
      setIsOpen(true);
      setHasOpened(true);
    };
    window.addEventListener("open-support-chat", handler);
    return () => window.removeEventListener("open-support-chat", handler);
  }, []);

  const handleOpen = useCallback(() => {
    if (import.meta.env.DEV) {
      console.info("[AI_DEBUG] clicked assistant fab open");
    }
    setIsOpen(true);
    setHasOpened(true);
  }, []);

  const handleClose = useCallback(() => {
    if (import.meta.env.DEV) {
      console.info("[AI_DEBUG] clicked assistant fab close");
    }
    setIsOpen(false);
  }, []);

  return (
    <>
      <style>{`
        @keyframes assistant-fab-pulse {
          0%, 100% { box-shadow: 0 5px 16px rgba(78,197,128,0.40); }
          50% { box-shadow: 0 7px 24px rgba(78,197,128,0.62); }
        }
      `}</style>

      <button
        type="button"
        onClick={isOpen ? handleClose : handleOpen}
        aria-label={isOpen ? "Cerrar asistente" : "Abrir asistente"}
        style={{
          position: "fixed",
          bottom: 88,
          right: 24,
          zIndex: 1190,
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 50,
          padding: "0 18px",
          borderRadius: 25,
          border: "none",
          background: isOpen ? "var(--brand-hover, #16a34a)" : "var(--brand-primary, #4ec580)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 700,
          animation: !hasOpened ? "assistant-fab-pulse 2.6s ease-in-out infinite" : "none",
          transition: "background 0.15s ease",
        }}
      >
        <span>Asistente</span>
      </button>

      <UnifiedAssistantDrawer isOpen={isOpen} onClose={handleClose} />
    </>
  );
}

