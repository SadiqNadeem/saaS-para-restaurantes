export async function printHtml58mm(html: string): Promise<void> {
  const popup = window.open("", "_blank", "width=420,height=720");
  if (!popup) {
    throw new Error("No se pudo abrir la ventana de impresion (popup bloqueado).");
  }

  popup.document.open();
  popup.document.write(`
    <html>
      <head>
        <title>Ticket</title>
        <style>
          @page { size: 58mm auto; margin: 0; }
          html, body {
            width: 58mm;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #111;
          }
          body {
            font-family: ui-monospace, Menlo, Consolas, monospace;
            font-size: 12px;
            line-height: 1.35;
            overflow: visible !important;
            min-height: auto !important;
            height: auto !important;
          }
          #ticket-root {
            width: 58mm;
            margin: 0;
            padding: 0;
            overflow: visible !important;
            min-height: auto !important;
            height: auto !important;
          }
          .line {
            display: flex;
            justify-content: space-between;
            gap: 8px;
          }
          @media print {
            @page { size: 58mm auto; margin: 0; }
            html, body {
              width: 58mm;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              min-height: auto !important;
              height: auto !important;
            }
            body * { visibility: hidden !important; }
            #ticket-root, #ticket-root * { visibility: visible !important; }
            #ticket-root {
              position: absolute;
              left: 0;
              top: 0;
              width: 58mm;
              padding-bottom: 25mm !important;
              min-height: auto !important;
              height: auto !important;
              overflow: visible !important;
            }
            #ticket-root::after {
              content: "";
              display: block;
              height: 60mm;
            }
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `);
  popup.document.close();

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Timeout al preparar la impresion."));
    }, 8000);

    popup.onload = () => {
      window.clearTimeout(timeoutId);
      popup.focus();
      popup.print();
      popup.onafterprint = () => {
        window.setTimeout(() => popup.close(), 300);
      };
      resolve();
    };
  });
}
