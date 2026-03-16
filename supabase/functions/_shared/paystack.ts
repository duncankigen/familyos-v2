import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGIN = "https://familyos-v2.vercel.app";
const PAYSTACK_API_BASE = "https://api.paystack.co";

export const FAMILY_BILLING_SELECT =
  "id,name,billing_status,billing_plan,billing_provider,billing_currency,billing_country,trial_started_at,trial_ends_at,subscription_started_at,subscription_ends_at,paystack_customer_code,paystack_subscription_code,paystack_subscription_email_token,paystack_plan_code,paystack_last_reference,scholarship_active,scholarship_started_at,scholarship_ends_at,scholarship_note";

type JsonHeaders = Record<string, string>;

type BillingContext = {
  admin: ReturnType<typeof createClient>;
  user: { id: string; email?: string | null };
  profile: {
    id: string;
    family_id: string | null;
    role: string | null;
    is_active?: boolean | null;
  };
  family: Record<string, any>;
  isPlatformAdmin: boolean;
};

function envOrThrow(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

export function json(body: unknown, status = 200, origin = DEFAULT_ALLOWED_ORIGIN, extraHeaders: JsonHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      ...extraHeaders,
    },
  });
}

export function getAllowedOrigin(req: Request) {
  const configured = Deno.env.get("ALLOWED_ORIGIN") || DEFAULT_ALLOWED_ORIGIN;
  const origin = req.headers.get("origin") || configured;
  return { configured, origin };
}

export function normalizePlan(plan: unknown) {
  return String(plan || "").trim().toLowerCase() === "yearly" ? "yearly" : "monthly";
}

export function getPlanCode(plan: string) {
  const normalized = normalizePlan(plan);
  return normalized === "yearly"
    ? envOrThrow("PAYSTACK_YEARLY_PLAN_CODE")
    : envOrThrow("PAYSTACK_MONTHLY_PLAN_CODE");
}

export function inferPlanFromCode(planCode: unknown) {
  const raw = String(planCode || "").trim();
  if (!raw) return "monthly";
  if (raw === Deno.env.get("PAYSTACK_YEARLY_PLAN_CODE")) return "yearly";
  if (raw === Deno.env.get("PAYSTACK_MONTHLY_PLAN_CODE")) return "monthly";
  return "monthly";
}

export function buildSuccessUrl(origin: string) {
  return Deno.env.get("PAYSTACK_SUCCESS_URL")?.trim() || `${origin}/app/?billing=success`;
}

function getAdminClient() {
  return createClient(envOrThrow("SUPABASE_URL"), envOrThrow("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function requireBillingManager(req: Request): Promise<BillingContext> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Missing authorization token.");

  const admin = getAdminClient();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) throw new Error("Authentication failed.");

  const user = authData.user;
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id,family_id,role,is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) throw new Error("User profile is unavailable.");
  if (profile.is_active === false) throw new Error("Your account is inactive.");
  if (!profile.family_id) throw new Error("You must belong to a family workspace before billing can be managed.");

  const { data: family, error: familyError } = await admin
    .from("families")
    .select(FAMILY_BILLING_SELECT)
    .eq("id", profile.family_id)
    .single();

  if (familyError || !family) throw new Error("Family workspace billing record could not be loaded.");

  const { data: platformAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  const isPlatformAdmin = Boolean(platformAdmin?.user_id);
  const role = String(profile.role || "").trim().toLowerCase();
  if (!isPlatformAdmin && role !== "admin") {
    throw new Error("Only a family admin can manage workspace billing.");
  }

  return {
    admin,
    user,
    profile,
    family,
    isPlatformAdmin,
  };
}

export async function paystackRequest(path: string, init: RequestInit = {}) {
  const secretKey = envOrThrow("PAYSTACK_SECRET_KEY");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${secretKey}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${PAYSTACK_API_BASE}${path}`, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status === false) {
    throw new Error(payload?.message || `Paystack request failed (${response.status}).`);
  }

  return payload?.data ?? payload;
}

export async function updateFamilyBilling(admin: ReturnType<typeof createClient>, familyId: string, payload: Record<string, unknown>) {
  const { error } = await admin.from("families").update(payload).eq("id", familyId);
  if (error) throw new Error(error.message || "Unable to update workspace billing.");
}

export async function getFamilyBillingSnapshot(admin: ReturnType<typeof createClient>, familyId: string) {
  const { data, error } = await admin
    .from("families")
    .select(FAMILY_BILLING_SELECT)
    .eq("id", familyId)
    .single();

  if (error || !data) throw new Error(error?.message || "Workspace billing snapshot could not be loaded.");
  return data;
}

export function extractCustomerCode(data: any) {
  return data?.customer?.customer_code || data?.customer_code || data?.customer?.code || null;
}

export function extractSubscriptionCode(data: any) {
  return data?.subscription?.subscription_code || data?.subscription_code || data?.subscription?.code || null;
}

export function extractFamilyId(data: any) {
  return data?.metadata?.family_id
    || data?.customer?.metadata?.family_id
    || data?.subscription?.metadata?.family_id
    || null;
}

export async function findFamilyForWebhook(admin: ReturnType<typeof createClient>, payload: any) {
  const familyId = extractFamilyId(payload?.data);
  if (familyId) {
    const { data } = await admin.from("families").select(FAMILY_BILLING_SELECT).eq("id", familyId).maybeSingle();
    if (data) return data;
  }

  const subscriptionCode = extractSubscriptionCode(payload?.data);
  if (subscriptionCode) {
    const { data } = await admin
      .from("families")
      .select(FAMILY_BILLING_SELECT)
      .eq("paystack_subscription_code", subscriptionCode)
      .maybeSingle();
    if (data) return data;
  }

  const customerCode = extractCustomerCode(payload?.data);
  if (customerCode) {
    const { data } = await admin
      .from("families")
      .select(FAMILY_BILLING_SELECT)
      .eq("paystack_customer_code", customerCode)
      .maybeSingle();
    if (data) return data;
  }

  const reference = String(payload?.data?.reference || "").trim();
  if (reference) {
    const { data } = await admin
      .from("families")
      .select(FAMILY_BILLING_SELECT)
      .eq("paystack_last_reference", reference)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

export async function fetchSubscriptionDetails(subscriptionCode: string | null | undefined) {
  const code = String(subscriptionCode || "").trim();
  if (!code) return null;
  try {
    return await paystackRequest(`/subscription/${encodeURIComponent(code)}`, { method: "GET" });
  } catch {
    return null;
  }
}

function nextPaymentDateFrom(data: any, subscriptionDetails: any) {
  return subscriptionDetails?.next_payment_date
    || data?.next_payment_date
    || data?.subscription?.next_payment_date
    || null;
}

function startedAtFrom(data: any, subscriptionDetails: any, currentValue: unknown) {
  return currentValue
    || data?.paid_at
    || data?.paidAt
    || data?.created_at
    || data?.createdAt
    || subscriptionDetails?.createdAt
    || new Date().toISOString();
}

export function buildBillingUpdate(family: Record<string, any>, eventName: string, data: any, subscriptionDetails: any) {
  const subscriptionCode = extractSubscriptionCode(data) || family.paystack_subscription_code || subscriptionDetails?.subscription_code || null;
  const customerCode = extractCustomerCode(data) || family.paystack_customer_code || subscriptionDetails?.customer?.customer_code || null;
  const planCode = data?.plan?.plan_code || subscriptionDetails?.plan?.plan_code || family.paystack_plan_code || null;
  const nextPaymentDate = nextPaymentDateFrom(data, subscriptionDetails);

  let billingStatus = family.billing_status || "active";
  if (eventName === "invoice.payment_failed") {
    billingStatus = "past_due";
  } else if (eventName === "subscription.disable" || eventName === "subscription.not_renew") {
    billingStatus = "cancelled";
  } else if (["subscription.create", "charge.success", "invoice.update"].includes(eventName)) {
    billingStatus = "active";
  }

  const payload: Record<string, unknown> = {
    billing_provider: "paystack",
    billing_status: billingStatus,
    billing_plan: inferPlanFromCode(planCode || family.billing_plan),
    paystack_customer_code: customerCode,
    paystack_subscription_code: subscriptionCode,
    paystack_subscription_email_token: subscriptionDetails?.email_token || data?.email_token || family.paystack_subscription_email_token || null,
    paystack_plan_code: planCode,
    paystack_last_reference: data?.reference || family.paystack_last_reference || null,
  };

  if (billingStatus === "active") {
    payload.subscription_started_at = startedAtFrom(data, subscriptionDetails, family.subscription_started_at);
  }

  if (nextPaymentDate) {
    payload.subscription_ends_at = nextPaymentDate;
  }

  return payload;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPaystackSignature(rawBody: string, signature: string | null) {
  const provided = String(signature || "").trim().toLowerCase();
  if (!provided) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(envOrThrow("PAYSTACK_SECRET_KEY")),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return toHex(digest) === provided;
}
