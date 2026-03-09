import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { supabase } from "../../lib/supabase";

export type QRTable = {
  id: string;
  name: string;
  qr_token: string;
};

type TableQRModalProps = {
  table: QRTable;
  restaurantSlug: string;
  onClose: () => void;
  onTokenRegenerated?: (newToken: string) => void;
};

function getTableUrl(slug: string, qrToken: string): string {
  const { protocol, host } = window.location;
  return `${protocol}//${host}/r/${slug}/mesa/${qrToken}`;
}

export default function TableQRModal({
  table,
  restaurantSlug,
  onClose,
  onTokenRegenerated,
}: TableQRModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrUrl, setQrUrl] = useState(getTableUrl(restaurantSlug, table.qr_token));
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateConfirm, setRegenerateConfirm] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 260,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [qrUrl]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `mesa-${table.name.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>QR Mesa ${table.name}</title>
          <style>
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, sans-serif; }
            img { width: 260px; height: 260px; }
            h2 { margin: 16px 0 0; font-size: 20px; font-weight: 700; }
            p { margin: 6px 0 0; font-size: 13px; color: #666; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" alt="QR Mesa ${table.name}" />
          <h2>${table.name}</h2>
          <p>Escanea para hacer tu pedido</p>
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleRegenerate = async () => {
    if (!regenerateConfirm) {
      setRegenerateConfirm(true);
      return;
    }
    setRegenerating(true);
    const newToken = crypto.randomUUID();
    const { error } = await supabase
      .from("restaurant_tables")
      .update({ qr_token: newToken })
      .eq("id", table.id);

    if (!error) {
      const newUrl = getTableUrl(restaurantSlug, newToken);
      setQrUrl(newUrl);
      onTokenRegenerated?.(newToken);
    }
    setRegenerating(false);
    setRegenerateConfirm(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 28,
          width: "min(360px, 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>
            QR — {table.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 20, color: "#6b7280", lineHeight: 1, padding: "2px 4px" }}
          >
            ×
          </button>
        </div>

        {/* QR canvas */}
        <canvas ref={canvasRef} style={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />

        {/* Table name */}
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#111827" }}>{table.name}</p>

        {/* URL preview */}
        <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", wordBreak: "break-all", textAlign: "center" }}>
          {qrUrl}
        </p>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, width: "100%", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleDownload}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "transparent", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Descargar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "transparent", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Imprimir
          </button>
        </div>

        {/* Regenerate */}
        {!regenerateConfirm ? (
          <button
            type="button"
            onClick={() => setRegenerateConfirm(true)}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "transparent", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Regenerar QR
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#ef4444", textAlign: "center" }}>
              Los QRs impresos dejarán de funcionar. ¿Confirmar?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setRegenerateConfirm(false)}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "transparent", color: "#6b7280", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Cancelar
              </button>
              <button type="button" onClick={() => void handleRegenerate()} disabled={regenerating}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 700, cursor: regenerating ? "not-allowed" : "pointer" }}>
                {regenerating ? "Regenerando..." : "Sí, regenerar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
