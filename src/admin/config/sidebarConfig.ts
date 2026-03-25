import type { FeatureKey } from "../features/restaurantFeatures";

export type SidebarItemConfig = {
  label: string;
  path: string;
  icon: string;
  end?: boolean;
  group?: string;
  bottom?: boolean;
  requiredRole?: "owner" | "admin" | null;
  requiredFeature?: FeatureKey;
};

export type SidebarGroupConfig = {
  id: string;
  label: string;
  icon: string;
  defaultOpen: boolean;
  requiredRole?: "owner" | "admin" | null;
};

export const SIDEBAR_GROUPS: SidebarGroupConfig[] = [
  { id: "menu", label: "Menu", icon: "MN", defaultOpen: true, requiredRole: "admin" },
  { id: "marketing", label: "Marketing", icon: "MK", defaultOpen: false, requiredRole: "admin" },
  { id: "equipo", label: "Equipo", icon: "EQ", defaultOpen: false, requiredRole: "owner" },
  { id: "ajustes", label: "Ajustes", icon: "AJ", defaultOpen: false, requiredRole: "admin" },
  { id: "soporte", label: "Soporte", icon: "SP", defaultOpen: false },
];

export const SIDEBAR_ITEMS: SidebarItemConfig[] = [
  { label: "Dashboard", path: "", icon: "DB", end: true },
  { label: "TPV", path: "tpv", icon: "TP", requiredFeature: "pos" },
  { label: "Pedidos", path: "orders", icon: "PD", requiredFeature: "online_ordering" },
  { label: "Mesas", path: "tables", icon: "MS", requiredFeature: "tables" },
  { label: "Caja", path: "caja", icon: "CJ", requiredFeature: "pos" },

  { label: "Categorias", path: "categories", icon: "CT", group: "menu", requiredRole: "admin" },
  { label: "Productos", path: "products", icon: "PR", group: "menu", requiredRole: "admin" },
  { label: "Modificadores", path: "modifiers", icon: "MD", group: "menu", requiredRole: "admin" },
  { label: "Importar menu", path: "import", icon: "IM", group: "menu", requiredRole: "admin" },

  { label: "Cupones", path: "coupons", icon: "CP", group: "marketing", requiredRole: "admin", requiredFeature: "coupons" },
  { label: "Fidelizacion", path: "loyalty", icon: "FD", group: "marketing", requiredRole: "admin", requiredFeature: "loyalty" },
  { label: "Reseñas", path: "reviews", icon: "RS", group: "marketing", requiredRole: "admin" },
  { label: "Carritos", path: "abandoned-carts", icon: "CR", group: "marketing", requiredRole: "admin" },
  { label: "WhatsApp", path: "whatsapp", icon: "WA", group: "marketing", requiredRole: "admin", requiredFeature: "whatsapp_chatbot" },
  { label: "Personalizar web", path: "web-customization", icon: "WB", group: "marketing", requiredRole: "admin", requiredFeature: "website_customization" },

  { label: "Usuarios y roles", path: "team", icon: "UR", group: "equipo", requiredRole: "owner", requiredFeature: "staff_roles" },

  { label: "Configuracion", path: "settings", icon: "CF", group: "ajustes", requiredRole: "admin" },
  { label: "Metricas", path: "metrics", icon: "MT", group: "ajustes", requiredRole: "admin", requiredFeature: "metrics" },
  { label: "Logs", path: "logs", icon: "LG", group: "ajustes", requiredRole: "admin", requiredFeature: "logs" },
  { label: "Diagnostico", path: "diagnostics", icon: "DG", group: "ajustes", requiredRole: "admin" },
  { label: "Suscripcion", path: "billing", icon: "SC", group: "ajustes", requiredRole: "owner" },

  { label: "Tickets", path: "support", icon: "SP", group: "soporte" },
  { label: "Centro de ayuda", path: "help", icon: "AY", group: "soporte" },
];
