/**
 * Validación de variables de entorno en tiempo de arranque.
 *
 * Si falta alguna variable crítica, la app lanza un error claro
 * en lugar de un crash críptico en runtime.
 *
 * ⚠️  Todas las variables VITE_* son públicas (se incrustan en el bundle).
 *     Nunca pongas aquí claves secretas del backend.
 */

const REQUIRED_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
] as const;

type RequiredVar = (typeof REQUIRED_VARS)[number];

function validateEnv(): Record<RequiredVar, string> {
  const missing: string[] = [];
  const result = {} as Record<RequiredVar, string>;

  for (const key of REQUIRED_VARS) {
    const value = import.meta.env[key];
    if (!value || typeof value !== "string" || value.trim() === "") {
      missing.push(key);
    } else {
      result[key] = value;
    }
  }

  if (missing.length > 0) {
    const lines = [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "  ERROR: Variables de entorno faltantes",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
      "  Crea un archivo .env.local en la raíz del proyecto",
      "  con las siguientes variables:",
      "",
      ...missing.map((v) => `    ${v}=<tu_valor>`),
      "",
      "  Consulta .env.example para ver todos los valores necesarios.",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ].join("\n");

    // Lanzar en el arranque para que el error sea visible inmediatamente
    throw new Error(lines);
  }

  return result;
}

export const env = validateEnv();
