export type AddButtonVariant = "solid" | "soft" | "outline";

export type WebCustomizationDraft = {
  logoUrl: string;
  bannerUrl: string;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerChip1: string;
  bannerChip2: string;
  bannerChip3: string;
  primaryColor: string;
  secondaryColor: string;
  buttonColor: string;
  headerName: string;
  headerSubtitle: string;
  headerHelper: string;
  addButtonText: string;
  addButtonVariant: AddButtonVariant;
};

export const DEFAULT_WEB_CUSTOMIZATION_DRAFT: WebCustomizationDraft = {
  logoUrl: "https://images.unsplash.com/photo-1617196037301-5b3340a9f82f?auto=format&fit=crop&w=240&q=80",
  bannerUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
  bannerTitle: "Tu kebab favorito, en minutos",
  bannerSubtitle: "Ingredientes frescos, envio rapido y recogida en local.",
  bannerChip1: "20-30 min",
  bannerChip2: "Comida rapida",
  bannerChip3: "Recogida y entrega",
  primaryColor: "#22c55e",
  secondaryColor: "#0f172a",
  buttonColor: "#16a34a",
  headerName: "Kebab Central",
  headerSubtitle: "Doner, durum y platos combinados",
  headerHelper: "Pedido online",
  addButtonText: "Anadir",
  addButtonVariant: "solid",
};
