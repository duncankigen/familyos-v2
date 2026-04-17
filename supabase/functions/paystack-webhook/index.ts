import {
  buildBillingUpdate,
  extractCustomerCode,
  extractFamilyId,
  extractReference,
  extractSubscriptionCode,
  fetchSubscriptionDetails,
  json,
  updateFamilyBilling,
  verifyPaystackSignature,
  waitForWebhookFamilyMatch,
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
    const data = payload?.data || {};
    const eventName = String(payload?.event || "");
    const admin = getAdminClient();
    console.log("[Paystack webhook] Received", {
      event: eventName,
      familyId: extractFamilyId(data),
      customerCode: extractCustomerCode(data),
      subscriptionCode: extractSubscriptionCode(data),
      reference: extractReference(data),
    });
    const family = await waitForWebhookFamilyMatch(admin, payload);

    if (!family) {
      console.warn("[Paystack webhook] No matching family workspace found", {
        event: eventName,
        familyId: extractFamilyId(data),
        customerCode: extractCustomerCode(data),
        subscriptionCode: extractSubscriptionCode(data),
        reference: extractReference(data),
      });
      return json({ ok: true, ignored: true, reason: "No matching family workspace found." });
    }

    const subscriptionDetails = await fetchSubscriptionDetails(
      extractSubscriptionCode(data) || family.paystack_subscription_code,
    );

    const update = buildBillingUpdate(family, eventName, data, subscriptionDetails);
    console.log("[Paystack webhook] Billing update prepared", {
      familyId: family.id,
      event: eventName,
      existingSubscriptionCode: family.paystack_subscription_code || null,
      updateSubscriptionCode: update.paystack_subscription_code || null,
      updateEndsAt: update.subscription_ends_at || null,
      updateStatus: update.billing_status || null,
      updatePlan: update.billing_plan || null,
    });
    await updateFamilyBilling(admin, family.id, update);
    console.log("[Paystack webhook] Billing update saved", {
      familyId: family.id,
      event: eventName,
    });

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
