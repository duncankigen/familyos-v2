import {
  buildBillingUpdate,
  corsHeaders,
  extractFamilyId,
  extractSubscriptionCode,
  fetchSubscriptionDetails,
  getAllowedOrigin,
  getFamilyBillingSnapshot,
  json,
  paystackRequest,
  requireBillingManager,
  updateFamilyBilling,
} from "../_shared/paystack.ts";

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
    const reference = String(payload?.reference || "").trim();

    if (!reference) {
      return json({ error: "Payment reference is required." }, 400, configured);
    }

    const transaction = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
    });

    if (String(transaction?.status || "").toLowerCase() !== "success") {
      return json({ error: "Paystack has not confirmed this payment as successful yet." }, 409, configured);
    }

    const familyIdFromMetadata = extractFamilyId({ data: transaction });
    if (familyIdFromMetadata && familyIdFromMetadata !== context.family.id) {
      return json({ error: "This payment reference belongs to a different workspace." }, 403, configured);
    }

    const subscriptionDetails = await fetchSubscriptionDetails(extractSubscriptionCode(transaction));
    const update = buildBillingUpdate(context.family, "charge.success", transaction, subscriptionDetails);

    await updateFamilyBilling(context.admin, context.family.id, update);
    const family = await getFamilyBillingSnapshot(context.admin, context.family.id);

    return json({
      message: "Workspace subscription payment confirmed.",
      family,
    }, 200, configured);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, configured);
  }
});
