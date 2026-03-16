import {
  buildBillingUpdate,
  extractSubscriptionCode,
  fetchSubscriptionDetails,
  findFamilyForWebhook,
  getFamilyBillingSnapshot,
  json,
  updateFamilyBilling,
  verifyPaystackSignature,
} from "../_shared/paystack.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const valid = await verifyPaystackSignature(rawBody, req.headers.get("x-paystack-signature"));
    if (!valid) {
      return json({ error: "Invalid Paystack signature" }, 401);
    }

    const payload = JSON.parse(rawBody || "{}");
    const admin = getAdminClient();
    const family = await findFamilyForWebhook(admin, payload);

    if (!family) {
      return json({ ok: true, ignored: true, reason: "No matching family workspace found." });
    }

    const subscriptionDetails = await fetchSubscriptionDetails(
      extractSubscriptionCode(payload?.data) || family.paystack_subscription_code,
    );

    const update = buildBillingUpdate(family, String(payload?.event || ""), payload?.data || {}, subscriptionDetails);
    await updateFamilyBilling(admin, family.id, update);
    await getFamilyBillingSnapshot(admin, family.id);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
