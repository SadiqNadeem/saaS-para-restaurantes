import OpenAI from "openai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RestaurantContext = {
  name: string;
  slug: string;
  productsCount: number;
  hasOrders: boolean;
  isAcceptingOrders: boolean;
};

function buildSystemPrompt(ctx: RestaurantContext): string {
  return `Eres el asistente de soporte de un SaaS de gestión de restaurantes.
Tu trabajo es ayudar a los dueños y managers de restaurantes a usar el software correctamente.

CONTEXTO DEL RESTAURANTE ACTUAL:
- Nombre: ${ctx.name}
- Slug/URL: ${ctx.slug}
- Productos creados: ${ctx.productsCount}
- Tiene pedidos: ${ctx.hasOrders ? "Sí" : "No"}
- Aceptando pedidos: ${ctx.isAcceptingOrders ? "Sí" : "No"}

SOBRE EL SOFTWARE:
Este es un SaaS multi-restaurante con estas secciones:
- Dashboard: resumen del día, KPIs, últimos pedidos
- Pedidos: gestión en tiempo real de todos los pedidos con estados
- Caja (POS/TPV): sistema de punto de venta para venta presencial
- Mesas: gestión de mesas del restaurante con plano visual
- Menú → Categorías: organizar productos en grupos
- Menú → Productos: crear y editar productos con precios, fotos, modificadores
- Menú → Modificadores: extras y opciones para personalizar productos
- Menú → Importar menú: subir productos desde CSV/Excel
- Ventas → Métricas: estadísticas y gráficos de ventas
- Ventas → Logs: historial de cambios de estado de pedidos
- Marketing → Cupones: códigos de descuento para clientes
- Marketing → Fidelización: programa de puntos
- Marketing → Reseñas: gestión de valoraciones
- Marketing → Carritos: carritos abandonados
- Marketing → WhatsApp: notificaciones automáticas por WhatsApp
- Equipo y roles: gestión de usuarios del restaurante
- Ajustes: configuración general, horarios, delivery, pagos, SEO
- Personalizar web: cambiar colores, logo, banner de la carta pública

FLUJOS IMPORTANTES:
- Para recibir pedidos online: activar "Aceptar pedidos" en Ajustes + configurar horarios
- Para delivery: configurar radio y precio en Ajustes → Delivery
- Para mesas con QR: crear mesas en el panel, descargar QR desde cada mesa
- Para modificadores: crear grupo en Modificadores, luego asignarlo al producto
- Para impresión: configurar en Ajustes → Impresión

PROBLEMAS FRECUENTES:
- "No me llegan pedidos": verificar que está activo, horario correcto, URL compartida
- "El QR no funciona": regenerar QR desde Ajustes → Ver QR
- "El cliente no puede pedir": verificar horario, radio de entrega, pedido mínimo
- "No puedo imprimir": revisar configuración de impresión, modo navegador vs app

REGLAS:
- Responde SIEMPRE en español
- Sé conciso y práctico — máximo 3-4 párrafos
- Usa pasos numerados cuando expliques un proceso
- Si no sabes algo específico del restaurante, dilo claramente
- No inventes funciones que no existen
- Si el problema es complejo, sugiere abrir un ticket de soporte
- Termina con una pregunta de seguimiento si aplica
- Usa emojis con moderación para hacer el texto más legible`;
}

export async function askSupportBot(
  messages: ChatMessage[],
  restaurantContext: RestaurantContext
): Promise<string> {
  // NOTE: VITE_OPENAI_API_KEY must be set in .env.local
  // In production, route this through a backend proxy to avoid exposing the key.
  const apiKey = (import.meta.env as Record<string, string | undefined>)["VITE_OPENAI_API_KEY"];

  if (!apiKey) {
    throw new Error("no_api_key");
  }

  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 10_000)
  );

  try {
    const responsePromise = client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1000,
      messages: [
        { role: "system", content: buildSystemPrompt(restaurantContext) },
        ...messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);

    return response.choices[0]?.message?.content ?? "No pude generar una respuesta.";
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "timeout" ||
        error.message === "no_api_key" ||
        error.message === "api_error"
      ) {
        throw error;
      }
    }
    if (error instanceof OpenAI.APIError) {
      throw new Error("api_error");
    }
    throw new Error("network_error");
  }
}
