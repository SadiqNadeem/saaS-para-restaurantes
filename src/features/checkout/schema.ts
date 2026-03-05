import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres"),
  phone: z.string().trim().min(6, "El telefono debe tener al menos 6 caracteres"),
});
