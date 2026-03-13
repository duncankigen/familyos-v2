# FamilyOS — AI Advisor Setup Guide

## Overview

The AI Advisor uses Anthropic's Claude model via a Supabase Edge Function.
This keeps your API key secure on the server side.

---

## Step 1: Get an Anthropic API Key

1. Go to https://console.anthropic.com
2. Create an account or sign in
3. Go to API Keys → Create Key
4. Copy the key (starts with `sk-ant-...`)

---

## Step 2: Add the Secret to Supabase

1. Go to your Supabase project dashboard
2. Click **Settings** → **Edge Functions**
3. Click **Manage Secrets**
4. Add a new secret:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from step 1

You can also keep a local template in `supabase/functions/ai-advisor/.env.example`, but do not place this secret in `js/config.js` because that file is loaded in the browser.

---

## Step 3: Create the Edge Function

1. In Supabase dashboard → **Edge Functions** → **New Function**
2. Name it: `ai-advisor`
3. Paste this code:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { question, familyContext } = await req.json();

    const systemPrompt = `You are an AI advisor for an African family cooperative management system called FamilyOS.
You help families manage their finances, farming, construction projects, school fees, and long-term goals.
Be practical, specific, and culturally relevant to East African family contexts.
Keep responses concise (under 200 words). Format with clear points when listing recommendations.`;

    const userMessage = `Family Context:
- Total Contributions: KES ${familyContext.totalContributions?.toLocaleString() || 0}
- Total Expenses: KES ${familyContext.totalExpenses?.toLocaleString() || 0}  
- Balance: KES ${(familyContext.totalContributions - familyContext.totalExpenses)?.toLocaleString() || 0}
- Pending Tasks: ${familyContext.pendingTasks || 0}
- Overdue Tasks: ${familyContext.overdueTasks || 0}
- Active Goals: ${JSON.stringify(familyContext.goals?.slice(0,3) || [])}

Question: ${question}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await response.json();
    const answer = data.content?.[0]?.text || "Unable to generate response.";

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

4. Click **Deploy**

---

## Step 4: Connect in FamilyOS

1. Open FamilyOS → AI Advisor page
2. In the "AI Setup Instructions" card at the bottom, paste your Edge Function URL:
   - Format: `https://YOUR_PROJECT_ID.supabase.co/functions/v1/ai-advisor`
3. Click **Save URL**
4. Ask a question — the AI now has full context about your family data

If you prefer, you can prefill public values in `js/config.js`:
- `supabase.url`
- `supabase.anonKey`
- `ai.edgeFunctionUrl`

---

## Enhancing the AI Context

To give Claude more context, edit the Edge Function to fetch more data from Supabase:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inside the handler:
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

// Get family_id from JWT
const authHeader = req.headers.get("Authorization");
// Then fetch tasks, goals, projects, etc. for richer context
```

Add `SUPABASE_SERVICE_ROLE_KEY` to your Edge Function secrets (found in Supabase Settings → API).

---

## Storage Buckets Setup

For the Document Vault to work with real file uploads:

1. Go to Supabase → **Storage**
2. Create these buckets:
   - `documents` — Set to: Authenticated users can read/write
   - `receipts` — Set to: Authenticated users can read/write
   - `avatars` — Set to: Public

Then modify the Vault page to upload files directly to Supabase Storage and save the returned URL.

---

## First-Time Family Setup

After running the SQL schema:

1. Sign up at your FamilyOS URL
2. In Supabase → Table Editor → `families` → Insert row:
   - name: "Your Family Name"
3. In `users` table, find your user row → update:
   - `family_id`: the UUID from step 2
   - `role`: `admin`
4. Reload the app — your family workspace is ready

---

## Inviting Family Members

1. Share the FamilyOS URL with each member
2. They sign up with their email
3. In Supabase → `users` table, find their row → update `family_id` to your family's UUID
4. Set their `role` appropriately
5. They can now log in and access the family workspace

---

## Technology Stack

- **Frontend**: Vanilla HTML/CSS/JS (single file, no build required)
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **AI**: Anthropic Claude via Edge Function
- **Hosting**: Any static host — Netlify, Vercel, GitHub Pages, or just open the HTML file

## Hosting on Netlify (Free)

1. Create account at netlify.com
2. Drag and drop your `index.html` file
3. Get a URL like `https://familyos-otieno.netlify.app`
4. Share with all family members
