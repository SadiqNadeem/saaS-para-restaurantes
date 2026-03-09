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
  { id: "menu", label: "Menu", icon: "M", defaultOpen: true, requiredRole: "admin" },
  { id: "ventas", label: "Ventas", icon: "V", defaultOpen: true, requiredRole: "admin" },
  { id: "marketing", label: "Marketing", icon: "K", defaultOpen: false, requiredRole: "admin" },
];

export const SIDEBAR_ITEMS: SidebarItemConfig[] = [
  { label: "Dashboard", path: "", icon: "D", end: true },
  { label: "Pedidos", path: "orders", icon: "O", requiredFeature: "online_ordering" },
  { label: "Caja", path: "pos", icon: "P", requiredFeature: "pos" },
  { label: "Mesas", path: "tables", icon: "T", requiredFeature: "tables" },

  { label: "Categorias", path: "categories", icon: "C", group: "menu", requiredRole: "admin" },
  { label: "Productos", path: "products", icon: "R", group: "menu", requiredRole: "admin" },
  { label: "Modificadores", path: "modifiers", icon: "M", group: "menu", requiredRole: "admin" },
  { label: "Importar menu", path: "import", icon: "I", group: "menu", requiredRole: "admin" },
  { label: "Ver QR", path: "settings#qr-section", icon: "Q", group: "menu", requiredRole: "admin", requiredFeature: "table_qr" },

  { label: "Metricas", path: "metrics", icon: "E", group: "ventas", requiredRole: "admin", requiredFeature: "metrics" },
  { label: "Logs", path: "logs", icon: "L", group: "ventas", requiredRole: "admin", requiredFeature: "logs" },

  { label: "Cupones", path: "coupons", icon: "%", group: "marketing", requiredRole: "admin", requiredFeature: "coupons" },
  { label: "Fidelizacion", path: "loyalty", icon: "F", group: "marketing", requiredRole: "admin", requiredFeature: "loyalty" },
  { label: "Resenas", path: "reviews", icon: "W", group: "marketing", requiredRole: "admin" },
  { label: "Carritos", path: "abandoned-carts", icon: "A", group: "marketing", requiredRole: "admin" },
  { label: "WhatsApp", path: "whatsapp", icon: "H", group: "marketing", requiredRole: "admin", requiredFeature: "whatsapp_chatbot" },

  { label: "Equipo y roles", path: "team", icon: "U", bottom: true, requiredRole: "owner", requiredFeature: "staff_roles" },
  { label: "Ajustes", path: "settings", icon: "S", bottom: true, requiredRole: "admin" },
  { label: "Personalizar web", path: "web-customization", icon: "B", bottom: true, requiredRole: "admin", requiredFeature: "website_customization" },
];
