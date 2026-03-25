import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { printTicket } from "./ticketService";
import type { PrintSettings, TicketData, TicketType } from "./ticketService";

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  printMode: "browser",
  printWidth: "80mm",
  rawbtEnabled: false,
  localPrintUrl: "http://127.0.0.1:18181/print",
  kitchenPrinterName: null,
  customerPrinterName: null,
  autoPrintWebOrders: false,
  autoPrintPosOrders: false,
  printOnNewOrder: false,
  printOnAccept: false,
  printKitchenSeparate: false,
};

type UsePrintSettingsReturn = {
  settings: PrintSettings;
  printOrder: (data: TicketData, type: TicketType) => Promise<void>;
};

export function usePrintSettings(restaurantId: string): UsePrintSettingsReturn {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedRef.current === restaurantId) return;
    loadedRef.current = restaurantId;

    void supabase
      .from("restaurant_settings")
      .select(
        "print_mode, print_width, rawbt_enabled, local_print_url, desktop_app_url, kitchen_printer_name, customer_printer_name, auto_print_web_orders, auto_print_pos_orders, print_on_new_order, print_on_accept, auto_print_on_accept, auto_print_pos, print_kitchen_separate"
      )
      .eq("restaurant_id", restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const row = data as Record<string, unknown>;
        // Resolve base URL: prefer desktop_app_url, fall back to stripping /print from local_print_url
        const baseUrl =
          (row.desktop_app_url as string | null) ??
          ((row.local_print_url as string | null)?.replace(/\/print\/?$/, "")) ??
          "http://127.0.0.1:18181";
        setSettings({
          printMode: row.print_mode === "desktop_app" ? "desktop_app" : "browser",
          printWidth: row.print_width === "58mm" ? "58mm" : "80mm",
          rawbtEnabled: row.rawbt_enabled === true,
          localPrintUrl: `${baseUrl}/print`,
          kitchenPrinterName: (row.kitchen_printer_name as string | null) ?? null,
          customerPrinterName: (row.customer_printer_name as string | null) ?? null,
          autoPrintWebOrders:
            row.print_on_new_order === true || row.auto_print_web_orders === true,
          autoPrintPosOrders:
            row.auto_print_pos === true || row.auto_print_pos_orders === true,
          printOnNewOrder:
            row.print_on_new_order === true || row.auto_print_web_orders === true,
          printOnAccept:
            row.auto_print_on_accept === true || row.print_on_accept === true,
          printKitchenSeparate: row.print_kitchen_separate === true,
        });
      });
  }, [restaurantId]);

  const print = async (data: TicketData, type: TicketType): Promise<void> => {
    await printTicket(data, type, settings);
  };

  return { settings, printOrder: print };
}
