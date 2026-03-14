/**
 * supabase/functions/ai-advisor/index.ts
 * --------------------------------------------------
 * FamilyOS AI Advisor Edge Function
 *
 * Recommended setup:
 * - Disable "Verify JWT" for this function in Supabase
 * - Set secrets:
 *   GEMINI_API_KEY
 *   EXPECTED_ANON_KEY
 *   ALLOWED_ORIGIN (optional, defaults to FamilyOS Vercel URL)
 *   GEMINI_MODEL (optional)
 *
 * This function does not rely on Supabase JWT auth.
 * It protects itself with origin + anon-key checks.
 */

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
    const expectedAnonKey = Deno.env.get("EXPECTED_ANON_KEY");
    if (!expectedAnonKey) {
      return json({ error: "EXPECTED_ANON_KEY not configured" }, 500, configured);
    }

    const apiKeyHeader = req.headers.get("apikey") || "";
    if (!apiKeyHeader || apiKeyHeader !== expectedAnonKey) {
      return json({ error: "Invalid apikey" }, 401, configured);
    }

    const payload = await req.json().catch(() => ({}));
    const { question, familyContext } = payload;

    if (!question || typeof question !== "string") {
      return json({ error: "Missing question" }, 400, configured);
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return json({ error: "GEMINI_API_KEY not configured" }, 500, configured);
    }

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
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

Provide specific, actionable, culturally aware advice relevant to East African families managing shared resources.
Be concise, under 200 words.
Use KES currency.
Focus on practical next steps.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: question }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 400,
        },
      }),
    });

    const data = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok) {
      const detailMessage =
        data?.error?.message ||
        data?.message ||
        data?.error ||
        JSON.stringify(data);
      console.error("Gemini API error:", detailMessage);
      return json(
        { error: `AI service error: ${detailMessage}`, details: data, model },
        502,
        configured,
      );
    }

    const answer =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part?.text || "")
        .join("")
        .trim() ||
      data?.text ||
      "No response from AI.";

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
