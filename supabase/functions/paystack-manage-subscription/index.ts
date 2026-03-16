import {
  corsHeaders,
  getAllowedOrigin,
  json,
  paystackRequest,
  requireBillingManager,
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
    const subscriptionCode = String(context.family.paystack_subscription_code || "").trim();

    if (!subscriptionCode) {
      return json({ error: "This workspace does not have an active Paystack subscription yet." }, 400, configured);
    }

    const result = await paystackRequest(`/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`, {
      method: "GET",
    });

    const manageUrl = result?.link || result?.url || null;
    if (!manageUrl) {
      return json({ error: "Paystack did not return a subscription management link." }, 502, configured);
    }

    return json({ manage_url: manageUrl }, 200, configured);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, configured);
  }
});
