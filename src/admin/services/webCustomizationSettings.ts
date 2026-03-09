import { supabase } from "../../lib/supabase";
import type { WebCustomizationDraft } from "../components/webCustomization/types";

type RestaurantWebSettingsRow = {
  restaurant_id: string;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  button_color: string | null;
  header_title: string | null;
  header_subtitle: string | null;
  helper_text: string | null;
  banner_title: string | null;
  banner_subtitle: string | null;
  chip_1: string | null;
  chip_2: string | null;
  chip_3: string | null;
  add_button_text: string | null;
  add_button_variant: string | null;
};

export type RestaurantWebSettingsPayload = Omit<RestaurantWebSettingsRow, "restaurant_id">;

const SETTINGS_SELECT = [
  "restaurant_id",
  "logo_url",
  "banner_url",
  "primary_color",
  "secondary_color",
  "button_color",
  "header_title",
  "header_subtitle",
  "helper_text",
  "banner_title",
  "banner_subtitle",
  "chip_1",
  "chip_2",
  "chip_3",
  "add_button_text",
  "add_button_variant",
].join(",");

export async function loadRestaurantWebSettings(restaurantId: string): Promise<RestaurantWebSettingsRow | null> {
  const { data, error } = await supabase
    .from("restaurant_web_settings")
    .select(SETTINGS_SELECT)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo cargar la configuracion web.");
  }

  return (data as RestaurantWebSettingsRow | null) ?? null;
}

export async function saveRestaurantWebSettings(restaurantId: string, draft: WebCustomizationDraft): Promise<void> {
  const values = toSettingsPayload(draft);
  const payload: RestaurantWebSettingsRow = {
    restaurant_id: restaurantId,
    ...values,
  };

  const { error } = await supabase
    .from("restaurant_web_settings")
    .upsert(payload, { onConflict: "restaurant_id" });

  if (error) {
    throw new Error(error.message || "No se pudieron guardar los cambios.");
  }
}

export function mapDbRowToDraft(base: WebCustomizationDraft, row: RestaurantWebSettingsRow | null): WebCustomizationDraft {
  if (!row) return base;

  return {
    ...base,
    logoUrl: row.logo_url ?? base.logoUrl,
    bannerUrl: row.banner_url ?? base.bannerUrl,
    primaryColor: row.primary_color ?? base.primaryColor,
    secondaryColor: row.secondary_color ?? base.secondaryColor,
    buttonColor: row.button_color ?? base.buttonColor,
    headerName: row.header_title ?? base.headerName,
    headerSubtitle: row.header_subtitle ?? base.headerSubtitle,
    headerHelper: row.helper_text ?? base.headerHelper,
    bannerTitle: row.banner_title ?? base.bannerTitle,
    bannerSubtitle: row.banner_subtitle ?? base.bannerSubtitle,
    bannerChip1: row.chip_1 ?? base.bannerChip1,
    bannerChip2: row.chip_2 ?? base.bannerChip2,
    bannerChip3: row.chip_3 ?? base.bannerChip3,
    addButtonText: row.add_button_text ?? base.addButtonText,
    addButtonVariant: (row.add_button_variant as WebCustomizationDraft["addButtonVariant"]) ?? base.addButtonVariant,
  };
}

export function toSettingsPayload(draft: WebCustomizationDraft): RestaurantWebSettingsPayload {
  return {
    logo_url: nullable(draft.logoUrl),
    banner_url: nullable(draft.bannerUrl),
    primary_color: nullable(draft.primaryColor),
    secondary_color: nullable(draft.secondaryColor),
    button_color: nullable(draft.buttonColor),
    header_title: nullable(draft.headerName),
    header_subtitle: nullable(draft.headerSubtitle),
    helper_text: nullable(draft.headerHelper),
    banner_title: nullable(draft.bannerTitle),
    banner_subtitle: nullable(draft.bannerSubtitle),
    chip_1: nullable(draft.bannerChip1),
    chip_2: nullable(draft.bannerChip2),
    chip_3: nullable(draft.bannerChip3),
    add_button_text: nullable(draft.addButtonText),
    add_button_variant: nullable(draft.addButtonVariant),
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
