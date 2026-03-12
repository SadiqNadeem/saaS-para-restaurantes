export const SIGNUP_PLANS = ["starter", "pro", "enterprise"] as const;

export type SignupPlan = (typeof SIGNUP_PLANS)[number];

export const DEFAULT_SIGNUP_PLAN: SignupPlan = "starter";

export function normalizeSignupPlan(raw: string | null | undefined): SignupPlan {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "pro" || value === "enterprise" || value === "starter") {
    return value;
  }
  return DEFAULT_SIGNUP_PLAN;
}

