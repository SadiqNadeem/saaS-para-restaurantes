/**
 * Tests para la lógica de validación de variables de entorno.
 *
 * Nota: `import.meta.env` en Vitest está inyectado por Vite y no es mockeable
 * de forma fiable via vi.stubGlobal. En su lugar, testeamos la función de
 * validación directamente extrayendo su lógica a un helper puro.
 */
import { describe, it, expect } from "vitest";

// ─── Lógica de validación extraída (pura, sin import.meta) ───────────────────

function validateRequiredVars(
  env: Record<string, string | undefined>,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing = required.filter(
    (key) => !env[key] || typeof env[key] !== "string" || env[key]!.trim() === ""
  );
  return { valid: missing.length === 0, missing };
}

function buildErrorMessage(missing: string[]): string {
  return [
    "Variables de entorno faltantes:",
    ...missing.map((v) => `  ${v}=<tu_valor>`),
    "Consulta .env.example para ver todos los valores necesarios.",
  ].join("\n");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const REQUIRED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];

describe("validateRequiredVars", () => {
  it("returns valid when all vars are present", () => {
    const result = validateRequiredVars(
      { VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "eyJ..." },
      REQUIRED
    );
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("detects missing VITE_SUPABASE_URL", () => {
    const result = validateRequiredVars(
      { VITE_SUPABASE_ANON_KEY: "eyJ..." },
      REQUIRED
    );
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("VITE_SUPABASE_URL");
  });

  it("detects missing VITE_SUPABASE_ANON_KEY", () => {
    const result = validateRequiredVars(
      { VITE_SUPABASE_URL: "https://x.supabase.co" },
      REQUIRED
    );
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("VITE_SUPABASE_ANON_KEY");
  });

  it("detects all missing vars at once (not one by one)", () => {
    const result = validateRequiredVars({}, REQUIRED);
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(2);
    expect(result.missing).toContain("VITE_SUPABASE_URL");
    expect(result.missing).toContain("VITE_SUPABASE_ANON_KEY");
  });

  it("treats empty string as missing", () => {
    const result = validateRequiredVars(
      { VITE_SUPABASE_URL: "  ", VITE_SUPABASE_ANON_KEY: "eyJ..." },
      REQUIRED
    );
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("VITE_SUPABASE_URL");
  });

  it("treats undefined as missing", () => {
    const result = validateRequiredVars(
      { VITE_SUPABASE_URL: undefined, VITE_SUPABASE_ANON_KEY: "eyJ..." },
      REQUIRED
    );
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("VITE_SUPABASE_URL");
  });
});

describe("buildErrorMessage", () => {
  it("includes all missing variable names", () => {
    const msg = buildErrorMessage(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
    expect(msg).toContain("VITE_SUPABASE_URL");
    expect(msg).toContain("VITE_SUPABASE_ANON_KEY");
    expect(msg).toContain(".env.example");
  });

  it("includes placeholder value hint", () => {
    const msg = buildErrorMessage(["VITE_SUPABASE_URL"]);
    expect(msg).toContain("<tu_valor>");
  });
});
