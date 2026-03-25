import { supabase } from "../lib/supabase";
import { DEFAULT_SIGNUP_PLAN, normalizeSignupPlan, type SignupPlan } from "./signupPlan";

const PENDING_SIGNUP_KEY = "pending_signup_v1";

type PendingSignup = {
  email: string;
  restaurantName: string;
  plan: SignupPlan;
};

type PendingSignupResult =
  | { status: "none" }
  | { status: "already_exists" }
  | { status: "created"; slug: string; restaurantName: string }
  | { status: "error"; message: string };

export function savePendingSignup(input: PendingSignup) {
  if (typeof window === "undefined") return;
  const payload: PendingSignup = {
    email: input.email.trim().toLowerCase(),
    restaurantName: input.restaurantName.trim(),
    plan: normalizeSignupPlan(input.plan),
  };
  window.localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(payload));
}

function clearPendingSignup() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PENDING_SIGNUP_KEY);
}

function readPendingSignup(): PendingSignup | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PENDING_SIGNUP_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingSignup>;
    const email = String(parsed.email ?? "").trim().toLowerCase();
    const restaurantName = String(parsed.restaurantName ?? "").trim();
    const plan = normalizeSignupPlan(parsed.plan);
    if (!email || !restaurantName) return null;
    return { email, restaurantName, plan };
  } catch {
    return null;
  }
}

export async function maybeCreateRestaurantFromPendingSignup(
  signedInEmail?: string | null
): Promise<PendingSignupResult> {
  const pending = readPendingSignup();
  if (!pending) return { status: "none" };

  const normalizedEmail = String(signedInEmail ?? "").trim().toLowerCase();
  if (normalizedEmail && normalizedEmail !== pending.email) {
    return { status: "none" };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { status: "error", message: userError?.message ?? "No se pudo obtener el usuario." };
  }

  const userId = userData.user.id;
  const { data: memberRow, error: memberError } = await supabase
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<{ restaurant_id: string }>();

  if (memberError) {
    return { status: "error", message: memberError.message };
  }

  if (memberRow?.restaurant_id) {
    clearPendingSignup();
    return { status: "already_exists" };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("create_restaurant_and_owner", {
    p_name: pending.restaurantName,
  });

  if (rpcError) {
    return { status: "error", message: rpcError.message };
  }

  const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  let restaurantSlug = "";
  let restaurantId = "";

  if (typeof rpcRow === "string") {
    restaurantId = rpcRow;
  } else if (rpcRow && typeof rpcRow === "object") {
    const row = rpcRow as { slug?: string; restaurant_slug?: string; restaurant_id?: string; id?: string };
    restaurantSlug = String(row.slug ?? row.restaurant_slug ?? "").trim();
    restaurantId = String(row.restaurant_id ?? row.id ?? "").trim();
  }

  if (!restaurantSlug && restaurantId) {
    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("slug")
      .eq("id", restaurantId)
      .maybeSingle<{ slug: string }>();

    if (restaurantError) {
      return { status: "error", message: restaurantError.message };
    }
    restaurantSlug = String(restaurant?.slug ?? "").trim();
  }

  if (!restaurantSlug) {
    return { status: "error", message: "No se pudo resolver el slug del restaurante." };
  }

  if (restaurantId) {
    const { error: planUpdateError } = await supabase
      .from("restaurants")
      .update({ subscription_plan_id: pending.plan ?? DEFAULT_SIGNUP_PLAN })
      .eq("id", restaurantId);

    if (planUpdateError) {
      return { status: "error", message: planUpdateError.message };
    }
  }

  clearPendingSignup();
  return { status: "created", slug: restaurantSlug, restaurantName: pending.restaurantName };
}
