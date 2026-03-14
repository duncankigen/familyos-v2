/**
 * supabase/functions/ai-advisor/index.ts
 * ─────────────────────────────────────────────────────
 * Supabase Edge Function: receives a question + family
 * context from the FamilyOS app and calls Claude to
 * generate an intelligent, data-aware answer.
 *
 * DEPLOY:
 *   supabase functions deploy ai-advisor
 *
 * SECRETS (Supabase → Settings → Edge Function Secrets):
 *   ANTHROPIC_API_KEY = sk-ant-...
 *   ANTHROPIC_MODEL   = optional override
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const { question, familyContext } = await req.json();

    if (!question) {
      return new Response(
        JSON.stringify({ error: "Missing question" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Build a context-rich system prompt
    const systemPrompt = `You are the AI Advisor for FamilyOS, a family management platform used by African extended families to manage finances, farming, construction, school fees, and family governance.

Family context:
- Total Contributions: KES ${familyContext?.totalContributions?.toLocaleString() ?? 0}
- Total Expenses:      KES ${familyContext?.totalExpenses?.toLocaleString()      ?? 0}
- Net Balance:         KES ${((familyContext?.totalContributions ?? 0) - (familyContext?.totalExpenses ?? 0)).toLocaleString()}
- Pending Tasks: ${familyContext?.pendingTasks ?? 0}
- Overdue Tasks: ${familyContext?.overdueTasks ?? 0}
- Active Goals: ${JSON.stringify(familyContext?.goals ?? [])}

Provide specific, actionable, and culturally aware advice relevant to East African families managing shared resources. Be concise (under 200 words). Use KES currency. Focus on practical next steps.`;

    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-haiku-20241022";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system:     systemPrompt,
        messages:   [{ role: "user", content: question }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const detailMessage =
        data?.error?.message ||
        data?.message ||
        data?.error ||
        JSON.stringify(data);
      console.error("Anthropic API error:", detailMessage);
      return new Response(
        JSON.stringify({ error: `AI service error: ${detailMessage}`, details: data, model }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const answer = data.content?.[0]?.text ?? "No response from AI.";

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Edge Function error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
