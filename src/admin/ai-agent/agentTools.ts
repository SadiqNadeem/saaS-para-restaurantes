// AI Agent tool definitions in OpenAI function-calling format.
//
// SECURITY: The AI decides WHICH tool to call and with WHAT parameters.
// restaurant_id is ALWAYS injected from the authenticated session in toolExecutor.ts
// and is NEVER passed by or derived from the AI response.

export type AgentToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
};

export const AGENT_TOOLS: AgentToolDefinition[] = [

  // ═══ READ-ONLY TOOLS ═══════════════════════════════════════════════════════

  {
    type: "function",
    function: {
      name: "get_orders_today",
      description: "Obtiene el resumen de pedidos del día actual del restaurante",
      parameters: {
        type: "object",
        properties: {
          group_by: {
            type: "string",
            enum: ["status", "hour", "type"],
            description: "Cómo agrupar los resultados"
          }
        },
        required: []
      }
    }
  },

  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "Obtiene resumen de ventas e ingresos del restaurante",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "week", "month"],
            description: "Período de tiempo"
          }
        },
        required: ["period"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "get_top_products",
      description: "Obtiene los productos más vendidos del restaurante",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Número de productos (máx 10)" },
          period: { type: "string", enum: ["today", "week", "month"] }
        },
        required: ["period"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "get_menu_status",
      description: "Obtiene estado del menú: categorías, productos activos/inactivos, precios",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },

  // ═══ SAFE ACTION TOOLS (no confirmation needed) ════════════════════════════

  {
    type: "function",
    function: {
      name: "create_tables",
      description: "Crea una o varias mesas en el restaurante",
      parameters: {
        type: "object",
        properties: {
          count: { type: "number", description: "Número de mesas a crear (máx 20)" },
          zone: { type: "string", description: "Zona: Sala, Terraza, Barra" },
          prefix: { type: "string", description: "Prefijo del nombre: 'Mesa', 'Terraza'" }
        },
        required: ["count"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "create_category",
      description: "Crea una nueva categoría en el menú",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre de la categoría" }
        },
        required: ["name"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "update_delivery_settings",
      description: "Actualiza configuración de delivery: radio, precio envío, pedido mínimo",
      parameters: {
        type: "object",
        properties: {
          delivery_radius_km: { type: "number" },
          delivery_fee: { type: "number" },
          minimum_order: { type: "number" },
          delivery_enabled: { type: "boolean" }
        },
        required: []
      }
    }
  },

  {
    type: "function",
    function: {
      name: "toggle_accepting_orders",
      description: "Activa o desactiva la aceptación de pedidos online",
      parameters: {
        type: "object",
        properties: {
          accepting: { type: "boolean", description: "true=abierto, false=cerrado" }
        },
        required: ["accepting"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "hide_product",
      description: "Oculta (desactiva) un producto del menú público",
      parameters: {
        type: "object",
        properties: {
          product_name: { type: "string", description: "Nombre del producto a ocultar" }
        },
        required: ["product_name"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "create_coupon",
      description: "Crea un cupón de descuento",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string" },
          discount_type: { type: "string", enum: ["percent", "fixed"] },
          discount_value: { type: "number" },
          min_order_amount: { type: "number" }
        },
        required: ["code", "discount_type", "discount_value"]
      }
    }
  },

  // ═══ CONFIRMATION REQUIRED TOOLS ══════════════════════════════════════════

  {
    type: "function",
    function: {
      name: "delete_product",
      description: "REQUIERE CONFIRMACIÓN: Elimina un producto del menú",
      parameters: {
        type: "object",
        properties: {
          product_name: { type: "string" }
        },
        required: ["product_name"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "delete_category",
      description: "REQUIERE CONFIRMACIÓN: Elimina una categoría y todos sus productos",
      parameters: {
        type: "object",
        properties: {
          category_name: { type: "string" }
        },
        required: ["category_name"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "update_product_prices",
      description: "REQUIERE CONFIRMACIÓN: Actualiza precios de productos",
      parameters: {
        type: "object",
        properties: {
          change_type: {
            type: "string",
            enum: ["percent_increase", "percent_decrease", "set_price"],
            description: "Tipo de cambio de precio"
          },
          value: { type: "number" },
          product_name: {
            type: "string",
            description: "Nombre del producto específico, o 'all' para todos"
          }
        },
        required: ["change_type", "value", "product_name"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "delete_tables",
      description: "REQUIERE CONFIRMACIÓN: Elimina mesas del restaurante",
      parameters: {
        type: "object",
        properties: {
          table_names: {
            type: "array",
            items: { type: "string" },
            description: "Lista de nombres de mesas a eliminar"
          }
        },
        required: ["table_names"]
      }
    }
  }
];

// Tools that require explicit user confirmation before executing
export const TOOLS_REQUIRING_CONFIRMATION = new Set([
  "delete_product",
  "delete_category",
  "delete_tables",
  "update_product_prices"
]);

export type ToolName =
  | "get_orders_today"
  | "get_sales_summary"
  | "get_top_products"
  | "get_menu_status"
  | "create_tables"
  | "create_category"
  | "update_delivery_settings"
  | "toggle_accepting_orders"
  | "hide_product"
  | "create_coupon"
  | "delete_product"
  | "delete_category"
  | "update_product_prices"
  | "delete_tables";
