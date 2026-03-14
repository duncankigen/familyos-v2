/**
 * supabase/functions/ai-advisor/index.ts
 * --------------------------------------------------
 * FamilyOS AI Advisor Edge Function
 *
 * Recommended setup:
 * - Keep "Verify JWT" enabled in Supabase
 * - Set secrets:
 *   ANTHROPIC_API_KEY
 *   ALLOWED_ORIGIN (optional, defaults to FamilyOS Vercel URL)
 *   ANTHROPIC_MODEL (optional)
 *
 * This function also verifies the caller inside the handler
 * so authenticated user context is explicit and debuggable.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGIN = "https://familyos-v2.vercel.app";

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin = DEFAULT_ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

function safeNumber(n: unknown) {
  return typeof n === "number" ? n : Number(n) || 0;
}

function getAllowedOrigin(req: Request) {
  const configured = Deno.env.get("ALLOWED_ORIGIN") || DEFAULT_ALLOWED_ORIGIN;
  const origin = req.headers.get("origin") || configured;
  return { configured, origin };
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
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401, configured);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: "Supabase environment is not configured" }, 500, configured);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: userError?.message || "Unauthorized" }, 401, configured);
    }

    const payload = await req.json().catch(() => ({}));
    const { question, familyContext } = payload;

    if (!question || typeof question !== "string") {
      return json({ error: "Missing question" }, 400, configured);
    }

    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      return json({ error: "ANTHROPIC_API_KEY not configured" }, 500, configured);
    }

    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-haiku-20241022";
    const totalContributions = safeNumber(familyContext?.totalContributions);
    const totalExpenses = safeNumber(familyContext?.totalExpenses);
    const netBalance = totalContributions - totalExpenses;

    const systemPrompt = `You are the AI Advisor for FamilyOS, a family management platform used by African extended families to manage finances, farming, construction, school fees, and family governance.

Family context:
- Total Contributions: KES ${totalContributions.toLocaleString()}
- Total Expenses: KES ${totalExpenses.toLocaleString()}
- Net Balance: KES ${netBalance.toLocaleString()}
- Pending Tasks: ${familyContext?.pendingTasks ?? 0}
- Overdue Tasks: ${familyContext?.overdueTasks ?? 0}
- Active Goals: ${JSON.stringify(familyContext?.goals ?? [])}
- Meetings: ${JSON.stringify(familyContext?.meetings ?? [])}
- Documents: ${JSON.stringify(familyContext?.documents ?? {})}
- Requesting User: ${userData.user.id}

Provide specific, actionable, culturally aware advice relevant to East African families managing shared resources.
Be concise, under 200 words.
Use KES currency.
Focus on practical next steps.`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
    });

    const data = await anthropicRes.json().catch(() => ({}));
    if (!anthropicRes.ok) {
      const detailMessage =
        data?.error?.message ||
        data?.message ||
        data?.error ||
        JSON.stringify(data);
      console.error("Anthropic API error:", detailMessage);
      return json(
        { error: `AI service error: ${detailMessage}`, details: data, model },
        502,
        configured,
      );
    }

    const answer = data?.content?.[0]?.text ?? data?.text ?? "No response from AI.";
    return json({ answer, model }, 200, configured);
  } catch (err) {
    console.error("Edge Function error:", err);
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
      configured,
    );
  }
});
