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
const ALLOWED_INSIGHT_TYPES = new Set([
  "finance_alert",
  "task_warning",
  "farming_advice",
  "planning_tip",
  "goal_update",
  "school_fees",
]);
const ALLOWED_SEVERITY = new Set(["info", "warning", "alert", "success"]);

type InsightDraft = {
  insight_type: string;
  title: string;
  message: string;
  severity: string;
};

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

function extractGeminiText(data: any) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part?.text || "")
    .join("")
    .trim() || data?.text || "";
}

function clip(value: unknown, maxLength: number) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function parseInsightPayload(text: string): InsightDraft[] {
  if (!text) return [];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return [];

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const insights = Array.isArray(parsed?.insights) ? parsed.insights : [];
    return insights
      .map((item) => {
        const insightType = ALLOWED_INSIGHT_TYPES.has(item?.insight_type) ? item.insight_type : "planning_tip";
        const severity = ALLOWED_SEVERITY.has(item?.severity) ? item.severity : "info";
        if (!item?.title || !item?.message) return null;
        return {
          insight_type: insightType,
          title: clip(item.title, 60),
          message: clip(item.message, 260),
          severity,
        };
      })
      .filter(Boolean)
      .slice(0, 4) as InsightDraft[];
  } catch (_error) {
    return [];
  }
}

function buildAnswerPrompt(familyContext: any) {
  const totalContributions = safeNumber(familyContext?.finances?.totalContributions ?? familyContext?.totalContributions);
  const totalExpenses = safeNumber(familyContext?.finances?.totalExpenses ?? familyContext?.totalExpenses);
  const netBalance = safeNumber(familyContext?.finances?.netBalance ?? (totalContributions - totalExpenses));

  return `You are the AI Advisor for FamilyOS, a family management platform used by African extended families to manage finances, farming, construction, school fees, and family governance.

Use the provided family context only. Be practical, specific, and grounded in the numbers you are given. If a relevant area has little or no data, say that clearly instead of inventing detail.

Respond in this exact structure:
Situation
- 2 to 4 concise bullets explaining what the data says now

Recommended Actions
- 4 to 6 practical next steps, ordered by impact

Watch-outs
- 2 to 4 short bullets highlighting risks, pressure points, or missing data

Guidance:
- Reference real figures from the context, especially KES amounts, counts, deadlines, and project/farm signals.
- Connect finances, tasks, goals, vendors, assets, school fees, and farming where relevant.
- Keep the answer detailed enough to feel advisory, but still readable.
- Avoid filler greetings and avoid one-line generic encouragement.

Core financial snapshot:
- Total Contributions: KES ${totalContributions.toLocaleString()}
- Total Expenses: KES ${totalExpenses.toLocaleString()}
- Net Balance: KES ${netBalance.toLocaleString()}

Full family context JSON:
${JSON.stringify(familyContext)}`;
}

function buildInsightPrompt(familyContext: any) {
  return `You are generating a short family operations insight feed for FamilyOS.

Return JSON only with this exact shape:
{"insights":[{"insight_type":"planning_tip","title":"...","message":"...","severity":"info"}]}

Rules:
- Return 2 to 4 insights only.
- Allowed insight_type values: finance_alert, task_warning, farming_advice, planning_tip, goal_update, school_fees
- Allowed severity values: info, warning, alert, success
- Each title must be short and specific.
- Each message must be actionable, practical, and under 220 characters.
- Prefer high-signal items over generic advice.
- Avoid duplicates that say the same thing in different words.
- Use the context numbers directly.

Family context JSON:
${JSON.stringify(familyContext)}`;
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
    const question = String(payload?.question || "").trim();
    const familyContext = payload?.familyContext || {};
    const mode = payload?.mode === "insights" ? "insights" : "answer";

    if (!question && mode === "answer") {
      return json({ error: "Missing question" }, 400, configured);
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return json({ error: "GEMINI_API_KEY not configured" }, 500, configured);
    }

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const systemPrompt = mode === "insights"
      ? buildInsightPrompt(familyContext)
      : buildAnswerPrompt(familyContext);
    const userText = mode === "insights"
      ? "Generate the most useful fresh family insights from this context."
      : question;

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
              parts: [{ text: userText }],
            },
          ],
          generationConfig: {
            temperature: mode === "insights" ? 0.2 : 0.35,
            maxOutputTokens: mode === "insights" ? 700 : 900,
            responseMimeType: mode === "insights" ? "application/json" : "text/plain",
          },
        }),
      },
    );

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

    const text = extractGeminiText(data);
    if (mode === "insights") {
      const insights = parseInsightPayload(text);
      if (!insights.length) {
        return json({ error: "AI service returned no usable insights.", raw: text, model }, 502, configured);
      }
      return json({ insights, model }, 200, configured);
    }

    if (!text) {
      return json({ error: "AI service returned no answer.", model }, 502, configured);
    }

    return json({ answer: text, model }, 200, configured);
  } catch (err) {
    console.error("Edge Function error:", err);
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
      configured,
    );
  }
});
