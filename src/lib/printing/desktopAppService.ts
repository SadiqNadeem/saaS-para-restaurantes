/**
 * Desktop App Service
 * Communicates with the local print bridge app running on Windows.
 * The app listens at http://127.0.0.1:18181 by default.
 *
 * Endpoints:
 * GET {url}/status → { version: string, printers: string[] }
 * GET {url}/printers → { printers: string[] }
 * POST {url}/print → { html: string, printer?: string }
 */

export interface DesktopAppStatus {
  connected: boolean;
  version?: string;
  printers?: string[];
  error?: string;
}

export interface PrintResult {
  success: boolean;
  error?: string;
}

export async function checkDesktopAppConnection(url: string): Promise<DesktopAppStatus> {
  try {
    const response = await fetch(`${url}/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { connected: false, error: `HTTP ${response.status}` };
    const data = await response.json() as { version?: string; printers?: string[] };
    return {
      connected: true,
      version: data.version,
      printers: Array.isArray(data.printers) ? data.printers : [],
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "App no detectada",
    };
  }
}

export async function getPrinterList(url: string): Promise<string[]> {
  try {
    const response = await fetch(`${url}/printers`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { printers?: string[] };
    return Array.isArray(data.printers) ? data.printers : [];
  } catch {
    return [];
  }
}

export async function printViaDesktopApp(
  url: string,
  html: string,
  printerName?: string
): Promise<PrintResult> {
  try {
    const response = await fetch(`${url}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, printer: printerName ?? "" }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "App no conectada",
    };
  }
}
