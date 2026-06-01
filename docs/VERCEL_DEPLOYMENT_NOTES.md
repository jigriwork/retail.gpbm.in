# GPBM Retail — Vercel Deployment Notes

## GitHub Repository

```
https://github.com/jigriwork/retail.gpbm.in
```

Branch: `master`

---

## Vercel Project Setup

### Step 1: Import Project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select `jigriwork/retail.gpbm.in`
4. Framework preset: **Next.js** (auto-detected)

### Step 2: Configure Build

| Setting | Value |
|---|---|
| Framework | Next.js |
| Build command | `next build` (default) |
| Install command | `npm install` (default) |
| Output directory | `.next` (default) |
| Node.js version | 20.x or 22.x |

No overrides needed — Vercel auto-detects Next.js 16.

### Step 3: Environment Variables

Add these in **Vercel → Project → Settings → Environment Variables**.

> [!CAUTION]
> Never commit actual values. Only variable names are listed here.

| Variable | Required | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | All (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | All (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server only |
| `GEMINI_API_KEY` | ✅ | Server only |
| `GEMINI_MODEL` | Optional | Server only |

- `NEXT_PUBLIC_*` variables are embedded in the client bundle — safe for anon key, not for secrets.
- `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are **server-only** — never exposed to the browser.
- `GEMINI_MODEL` defaults to `gemini-2.5-flash` if not set.

### Step 4: Deploy

1. Click **Deploy**
2. Vercel runs `npm install` → `next build`
3. First deploy takes ~60 seconds
4. App is live at the assigned `.vercel.app` domain

### Step 5: Custom Domain (optional)

1. Go to **Project → Settings → Domains**
2. Add `retail.gpbm.in`
3. Point DNS CNAME to `cname.vercel-dns.com`
4. Vercel auto-provisions SSL

---

## Post-Deployment Testing Checklist

### Owner Login Test

- [ ] Open the deployed URL
- [ ] Verify redirect to `/login` (no public access)
- [ ] Login with the owner email/password
- [ ] Verify redirect to `/app/today`
- [ ] Confirm header shows "Owner" role badge
- [ ] Confirm both stores (Go Planet, Brand Mark) are visible
- [ ] Confirm MITTY is NOT visible anywhere
- [ ] Confirm bottom nav shows 5 items: Today, Stores, Reports, Tasks, Secretary

### Manager Login Test

- [ ] Open the deployed URL in an incognito window
- [ ] Login with a manager email/password
- [ ] Verify redirect to `/app/today`
- [ ] Confirm header shows "Manager" role badge
- [ ] Confirm only the assigned store is visible
- [ ] Confirm bottom nav shows 4 items (no Secretary)
- [ ] Confirm no access to `/app/secretary`, `/app/life`, `/app/users`

### AI Secretary Test

- [ ] Login as owner
- [ ] Navigate to `/app/secretary`
- [ ] Type a question: "What needs my attention today?"
- [ ] Verify AI responds (no 404 error)
- [ ] Verify response includes real business context (stores, sales status, etc.)
- [ ] Check that model used is logged (inspect chat metadata if needed)

### Sales Report Upload Test

- [ ] Navigate to `/app/reports/sales`
- [ ] Select a store and date
- [ ] Upload a valid `.xlsx` sales file
- [ ] Verify upload succeeds with row count and summary
- [ ] Verify Today page updates to show "Uploaded" status
- [ ] Verify checklist reflects the upload

### Stock Report Upload Test

- [ ] Navigate to `/app/reports/stock`
- [ ] Select a store and month
- [ ] Upload a valid `.xlsx` stock file
- [ ] Verify upload succeeds

### Review Test

- [ ] Navigate to `/app/reviews/rack`
- [ ] Submit a rack review for a store
- [ ] Navigate to `/app/reviews/cleaning`
- [ ] Submit a cleaning review

### Update/Issue Test

- [ ] Navigate to `/app/updates/new`
- [ ] Create an update with category "Customer issue"
- [ ] Verify it appears in `/app/updates`
- [ ] Verify it shows on the Today page

### Task Test

- [ ] Navigate to `/app/tasks/new`
- [ ] Create a task with a due date
- [ ] Verify it appears in `/app/tasks`
- [ ] Mark it as done from the task detail page

### Target Setting Test

- [ ] Login as owner
- [ ] Navigate to `/app/settings`
- [ ] Enable monthly target for a store
- [ ] Enter target amount (e.g., 500000)
- [ ] Save and verify it appears in store detail
- [ ] Check sales analytics shows target progress

### Checklist Test

- [ ] Navigate to `/app/checklist`
- [ ] Verify store checklists load with correct items
- [ ] Verify quick action links work (Add task, Add store issue, No issues today)

### PWA Test

- [ ] Open on a mobile device (or Chrome DevTools mobile emulation)
- [ ] Verify the GPBM icon appears in the browser tab
- [ ] Add to home screen
- [ ] Verify standalone mode with correct splash and icon

---

## Troubleshooting

### Build fails on Vercel

1. Check that all 5 env variables are set in Vercel dashboard
2. Check Vercel build logs for the specific error
3. Run `npm run build` locally to reproduce

### AI Secretary returns error

1. Verify `GEMINI_API_KEY` is set in Vercel env vars
2. Verify `GEMINI_MODEL` is set to `gemini-2.5-flash` or left empty (defaults correctly)
3. Run `npm run check:gemini` locally to test the key
4. The app has automatic fallback: `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-flash-latest` → `gemini-2.0-flash`

### Auth not working

1. Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
2. Verify the Supabase project's **Site URL** in Auth settings matches the Vercel deployment URL
3. Add the Vercel URL to Supabase **Auth → URL Configuration → Redirect URLs**

### RLS / data access errors

1. Verify `SUPABASE_SERVICE_ROLE_KEY` is set (used for admin operations like user management)
2. Test with a real manager account to confirm RLS allows only assigned store data

---

## Architecture Reference

```
Next.js 16.2.6 (Turbopack) → Vercel Edge
Supabase (Auth + Postgres + Storage) → Hosted
Gemini 2.5 Flash → Google AI API
```

27 routes total (2 static, 25 dynamic server-rendered).
