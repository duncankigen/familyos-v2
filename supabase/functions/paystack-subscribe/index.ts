import {
  buildSuccessUrl,
  corsHeaders,
  getAllowedOrigin,
  getFamilyBillingSnapshot,
  getPlanCode,
  json,
  normalizePlan,
  paystackRequest,
  requireBillingManager,
  updateFamilyBilling,
} from "../_shared/paystack.ts";

function checkoutReference(familyId: string) {
  const compact = familyId.replace(/-/g, "").slice(0, 12);
  return `fos_${compact}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function checkoutAmount(plan: string) {
  return plan === "yearly" ? "100000" : "10000";
}

Deno.serve(async (req) => {
  const { configured, origin } = getAllowedOrigin(req);

  if (req.method === "OPTIONS") {
    if (origin !== configured) {
      return json({ error: "Origin not allowed" }, 403, configured);
    }
    return new Response("ok", { headers: corsHeaders(configured) });
  }

  if (origin !== configured) {
    return json({ error: "Origin not allowed" }, 403, configured);
  }

  try {
    const context = await requireBillingManager(req);
    const payload = await req.json().catch(() => ({}));
    const plan = normalizePlan(payload?.plan);
    const planCode = getPlanCode(plan);
    const email = String(context.user.email || "").trim();

    if (!email) {
      return json({ error: "Your account email is missing, so billing cannot start yet." }, 400, configured);
    }

    const reference = checkoutReference(context.family.id);
    const checkout = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount: checkoutAmount(plan),
        plan: planCode,
        reference,
        callback_url: buildSuccessUrl(configured),
        channels: ["card"],
        metadata: {
          source: "familyos_subscription",
          family_id: context.family.id,
          initiated_by: context.user.id,
          requested_plan: plan,
          requested_plan_code: planCode,
        },
      }),
    });

    await updateFamilyBilling(context.admin, context.family.id, {
      billing_provider: "paystack",
      billing_plan: plan,
      paystack_plan_code: planCode,
      paystack_last_reference: reference,
    });

    const family = await getFamilyBillingSnapshot(context.admin, context.family.id);

    return json({
      authorization_url: checkout?.authorization_url,
      access_code: checkout?.access_code,
      reference,
      plan,
      family,
    }, 200, configured);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, configured);
  }
});
