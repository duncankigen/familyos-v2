# FamilyOS — Project Structure

Digital Operating System for African Families.

---

## Folder Structure

```
familyos/
├── index.html                  ← App shell — loads all CSS + JS in order
│
├── css/
│   ├── variables.css           ← Design tokens (colours, radii, shadows)
│   ├── layout.css              ← App shell, sidebar, topbar, grids, responsive
│   └── components.css          ← Buttons, cards, forms, tables, modal, badges
│
├── js/
│   ├── core/                   ← Shared infrastructure (load first)
│   │   ├── state.js            ← Single source of truth for app state
│   │   ├── helpers.js          ← Pure utilities: fmt(), fmtDate(), ago(), badges
│   │   ├── supabase.js         ← DB client initialisation
│   │   ├── router.js           ← nav(), renderPage(), Router.register/go
│   │   └── app.js              ← Bootstrap: theme, auth check, family setup
│   │
│   ├── components/             ← Shared UI components
│   │   ├── Modal.js            ← Global reusable modal dialog
│   │   ├── Sidebar.js          ← Nav items, render, open/close
│   │   ├── Auth.js             ← Sign in, sign up, sign out
│   │   └── Config.js           ← Supabase credentials setup screen
│   │
│   └── pages/                  ← One file per feature page
│       ├── dashboard.js
│       ├── members.js
│       ├── announcements.js
│       ├── finance.js
│       ├── contributions.js
│       ├── expenses.js
│       ├── schoolfees.js
│       ├── emergency.js
│       ├── projects.js
│       ├── farming.js
│       ├── tasks.js
│       ├── assets.js
│       ├── directory.js
│       ├── meetings.js
│       ├── goals.js
│       ├── vault.js
│       ├── reports.js
│       └── ai.js
│
├── supabase/
│   ├── schema.sql              ← Full database schema with RLS policies
│   └── functions/
│       └── ai-advisor/
│           └── index.ts        ← Edge Function: Claude AI integration
│
└── docs/
    ├── README.md               ← This file
    └── AI_SETUP.md             ← Step-by-step AI Advisor setup guide
```

---

## How to Add a New Feature Page

1. Create `js/pages/yourpage.js` with a `renderYourPage()` function
2. At the bottom of the file call: `Router.register('yourpage', renderYourPage);`
3. Add a `<script src="js/pages/yourpage.js"></script>` tag in `index.html`
4. Add a nav item in `js/components/Sidebar.js` → `NAV_ITEMS`

That's it — no build step required.

---

## How to Edit Styles

| Goal | File to edit |
|------|-------------|
| Change brand colour | `css/variables.css` → `--accent` |
| Change dark-mode palette | `css/variables.css` → `[data-theme="dark"]` |
| Change sidebar width | `css/layout.css` → `.sidebar { width: ... }` |
| Add a new button variant | `css/components.css` → `.btn-*` |

---

## Quick Start

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → paste `supabase/schema.sql` → Run
3. Open `js/config.js` and add your Supabase Project URL + anon key, or paste them into the FamilyOS setup screen
4. Sign up → in Supabase Table Editor, set your `family_id` and `role = 'admin'`
5. Reload the app — your workspace is live

**Hosting:** Drag-and-drop the entire folder to [Netlify](https://netlify.com), or serve with any static file host.

---

## AI Advisor (optional)

See `docs/AI_SETUP.md` for full instructions to deploy the Edge Function.

The Edge Function code is in `supabase/functions/ai-advisor/index.ts`.  
It requires an `ANTHROPIC_API_KEY` secret in Supabase → Settings → Edge Function Secrets.
After deployment, paste the function URL into FamilyOS → `AI Advisor` → `Edge Function URL (optional)`.
Public app config lives in `js/config.js`. Server-only secrets belong in `supabase/functions/ai-advisor/.env.example` or Supabase secrets.
