# Print App Specification — Local Desktop Bridge

## Overview

The local print app is a lightweight Windows tray application that acts as an HTTP bridge
between the Kebab SaaS browser UI and locally-installed thermal printers (USB or network).

Browsers cannot access printers directly. This app listens on localhost and receives print
jobs from the browser via fetch() calls, then sends them to the OS print spooler.

---

## Requirements

- Runs as a Windows tray application (Electron, Go + Wails, or Node.js + pkg)
- Listens on `http://127.0.0.1:18181` (configurable)
- CORS: allows `localhost` origins and the SaaS domain
- Converts HTML to ESC/POS or uses Chromium headless to render and print
- No UI beyond the tray icon — fully automatic

---

## Endpoints

### `GET /status`

Returns app health. Used by the "Probar conexión" button in Settings.

**Response 200:**
```json
{ "version": "1.0.0", "connected": true }
```

---

### `POST /print`

Receives a print job and sends it to the specified printer.

**Request body:**
```json
{
  "html": "<full HTML document string>",
  "printer": "Epson TM-T88V"
}
```

- `html`: Complete HTML document (includes `<style>` with `@page` size)
- `printer`: Exact Windows printer name. Empty string = default printer.

**Response 200:**
```json
{ "ok": true }
```

**Response 4xx/5xx (error):**
```json
{ "ok": false, "error": "Printer not found" }
```

---

### `GET /printers`

Returns list of installed printers for configuration UI.

**Response 200:**
```json
{
  "printers": ["Epson TM-T88V", "Star TSP100", "Microsoft Print to PDF"]
}
```

---

## Implementation Notes

### HTML-to-print rendering

Recommended approach: embed a headless Chromium (via Puppeteer or Playwright) to render
the HTML and print it to the target printer via the OS print API.

Alternative: parse the HTML and convert to ESC/POS commands using a library like
`node-escpos` or `escpos-buffer`.

### Page size

The `@page` CSS in the received HTML already specifies the correct ticket width
(`58mm` or `80mm`). The app must pass this through to the OS print dialog.

### CORS headers

All responses must include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Handle `OPTIONS` preflight requests with status 204.

---

## Setup flow (user-facing)

1. User downloads the app installer from the admin panel (Settings > Impresión)
2. Runs the installer — the app starts automatically and adds a tray icon
3. In Settings > Impresión, user enters the printer names and clicks "Probar conexión"
4. The browser calls `GET /status` — if 200, shows "Conectado"

---

## Security notes

- The app only listens on 127.0.0.1 (loopback), not on the network
- No authentication required since it's localhost-only
- The app should NOT expose the `/print` endpoint on any external interface
