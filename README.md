# ProcureIQ Enterprise v3

> 50+ users · 3–10 companies · Google Workspace SSO · Audit-grade compliance

---

## What's different from the standard version

| Feature | Standard | Enterprise |
|---|---|---|
| Users | 5–20 | 50+ |
| Auth | Email/password | Google Workspace SSO + Magic Link |
| Roles | 5 fixed roles | Flexible roles with JSONB permission matrix |
| RLS policies | 20 policies | 35+ policies with permission-function helpers |
| Approval matrix | Single rule set | Per-category, per-priority, per-company rules |
| Maker-checker | App-layer only | App-layer + DB constraint + RLS |
| Audit log | Basic | Diff-aware, severity-tagged, self-auditing exports |
| Real-time | None | WebSocket notifications via Supabase Realtime |
| Export | Browser-side | Server-side CSV with auth + audit of the export |
| Escalation | Manual | Automatic via Edge Function cron |
| Security headers | None | Full CSP, HSTS, X-Frame-Options, etc. |
| Budget | Simple | Warn + freeze thresholds, fiscal-year aware |

---

## Architecture

```
Browser (Next.js 14 React)
    │
    ├── /auth/login          Google OAuth → Supabase → /auth/callback
    ├── /dashboard           Server Component (SSR, no stale data)
    ├── /approvals           Maker sees own POs; Checker sees theirs
    ├── /purchase-orders     Full CRUD + real-time status
    ├── /payments            Invoice + payment with checker approval
    ├── /audit               Read-only, exportable, auth-gated
    └── /admin/*             Super admin + company admin only

Server Actions (lib/actions/)
    ├── po.ts                Create, Submit, Approve, Reject, Recall
    ├── supplier.ts          Create, Approve (maker-checker enforced)
    ├── payment.ts           Create, Approve, Mark Paid
    └── shared.ts            writeAudit(), createNotification(), queueEmail()

Supabase
    ├── PostgreSQL           All tables with RLS
    ├── Auth                 Google OAuth + Magic Link
    ├── Realtime             Notifications channel per user
    └── Edge Functions       escalation-cron (runs every hour)

API Routes
    └── /api/export          Authenticated CSV export (self-auditing)
```

---

## Step 1 — Supabase Project Setup (10 minutes)

### 1.1 Create Project

1. https://supabase.com → New Project
2. Name: `procureiq-enterprise`
3. Region: `ap-south-1` (Mumbai) or nearest
4. Save the **database password** — you'll need it

### 1.2 Run Database Migration

1. Supabase Dashboard → **SQL Editor** → **New query**
2. Paste entire contents of `supabase/migrations/001_enterprise_schema.sql`
3. Click **Run** → Should complete in ~5 seconds

### 1.3 Set Up Google OAuth

In Supabase Dashboard → **Authentication** → **Providers** → **Google**:

1. Enable Google provider
2. You need a Google Cloud OAuth Client ID and Secret:
   - Go to https://console.cloud.google.com
   - Create a project (or use existing)
   - APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorized redirect URIs: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
   - Copy **Client ID** and **Client Secret** → paste into Supabase

3. In Supabase → Auth → URL Configuration:
   - Site URL: `http://localhost:3000` (dev) or your production URL
   - Redirect URLs — add both:
     ```
     http://localhost:3000/auth/callback
     https://your-app.render.com/auth/callback
     ```

> **Restrict to your Google Workspace domain:** In `app/auth/login/page.tsx`, find the `hd: ''` line and change it to `hd: 'yourcompany.com'` — this prevents non-company Google accounts from signing in.

### 1.4 Get API Keys

Supabase → Settings → API:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2 — Create Your First Company and Seed Roles

In Supabase SQL Editor, run:

```sql
-- 1. Companies (run once per entity)
INSERT INTO companies (name, legal_name, code, country, currency, gstin) VALUES
('Acme India Pvt Ltd', 'Acme Technologies India Private Limited', 'ACME-IN', 'India', 'INR', '29AABCA1234A1Z5'),
('Acme Singapore', NULL, 'ACME-SG', 'Singapore', 'SGD', NULL),
('Acme UAE LLC', NULL, 'ACME-AE', 'UAE', 'AED', NULL);

-- 2. Roles for ACME-IN (run for each company)
DO $$
DECLARE v_cid UUID := (SELECT id FROM companies WHERE code = 'ACME-IN');
BEGIN
  INSERT INTO roles (company_id, name, code, is_system, permissions) VALUES
  (v_cid,'Super Admin',      'SUPER_ADMIN',  true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L5"}'),
  (v_cid,'Company Admin',    'ADMIN',        true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L4"}'),
  (v_cid,'Maker',            'MAKER',        true,'{"can_create_po":true,"can_approve_po":false,"can_approve_supplier":false,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false}'),
  (v_cid,'L1 Checker (HOD)','L1_CHECKER',   true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":false,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false,"approval_level":"L1","spend_limit":25000}'),
  (v_cid,'L2 (Finance Mgr)','L2_CHECKER',   true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false,"approval_level":"L2","spend_limit":100000}'),
  (v_cid,'L3 (VP Ops)',     'L3_CHECKER',   true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false,"approval_level":"L3","spend_limit":500000}'),
  (v_cid,'L4 Checker (CFO)','L4_CHECKER',   true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L4","spend_limit":10000000}'),
  (v_cid,'L5 (CEO/Board)',  'L5_CHECKER',   true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L5"}'),
  (v_cid,'Viewer',           'VIEWER',       true,'{"can_create_po":false,"can_approve_po":false,"can_approve_supplier":false,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false}');

  -- Approval matrix
  INSERT INTO approval_matrix (company_id, min_amount, max_amount, required_levels, escalation_hrs) VALUES
  (v_cid, 0,          25000,      ARRAY['L1'],           24),
  (v_cid, 25000,      100000,     ARRAY['L1','L2'],      48),
  (v_cid, 100000,     500000,     ARRAY['L1','L2','L3'], 48),
  (v_cid, 500000,     2500000,    ARRAY['L2','L3','L4'], 72),
  (v_cid, 2500000,    10000000,   ARRAY['L3','L4','L5'], 72),
  (v_cid, 10000000,   NULL,       ARRAY['L4','L5'],      72);

  -- Default budget (FY 2025-26)
  INSERT INTO budgets (company_id, fiscal_year, category, allocated, currency) VALUES
  (v_cid,'2025-26','IT & Software',      15000000,'INR'),
  (v_cid,'2025-26','Raw Materials',      25000000,'INR'),
  (v_cid,'2025-26','Logistics',           8000000,'INR'),
  (v_cid,'2025-26','Office Supplies',     4000000,'INR'),
  (v_cid,'2025-26','Professional Services',7000000,'INR'),
  (v_cid,'2025-26','Manufacturing',      11000000,'INR');
END;
$$;
```

---

## Step 3 — Assign Your First Users

After team members sign in via Google SSO (they'll land on `/auth/pending`):

```sql
-- See all registered users
SELECT up.id, up.full_name, up.email, up.last_login_at
FROM user_profiles up ORDER BY up.created_at DESC;

-- See available roles
SELECT id, name, code FROM roles WHERE company_id = (SELECT id FROM companies WHERE code = 'ACME-IN');

-- Assign a user as L2 Checker (Finance Manager)
INSERT INTO company_members (company_id, user_id, role_id, spend_limit)
SELECT
  c.id,
  up.id,
  r.id,
  500000  -- override spend limit if needed
FROM companies c, user_profiles up, roles r
WHERE c.code = 'ACME-IN'
  AND up.email = 'finance.manager@acmecorp.com'
  AND r.code = 'L2_CHECKER' AND r.company_id = c.id;

-- Assign a Maker
INSERT INTO company_members (company_id, user_id, role_id)
SELECT c.id, up.id, r.id
FROM companies c, user_profiles up, roles r
WHERE c.code = 'ACME-IN'
  AND up.email = 'procurement@acmecorp.com'
  AND r.code = 'MAKER' AND r.company_id = c.id;

-- Assign same user to a different company with different role
INSERT INTO company_members (company_id, user_id, role_id)
SELECT c.id, up.id, r.id
FROM companies c, user_profiles up, roles r
WHERE c.code = 'ACME-SG'
  AND up.email = 'finance.manager@acmecorp.com'
  AND r.code = 'ADMIN' AND r.company_id = c.id;
```

---

## Step 4 — Local Development

```bash
cd procureiq-enterprise

# Install dependencies
npm install

# Environment
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

# Run
npm run dev
# → http://localhost:3000

# Check types
npm run type-check
```

---

## Step 5 — Deploy to Render

### Option A: Render.com (Free → $7/mo Starter)

1. Push to GitHub
2. Render Dashboard → New → Web Service
3. Connect repo
4. Settings:
   - Build: `npm ci && npm run build`
   - Start: `npm start`
   - Node version: `20`
5. Environment variables — add all from `.env.example`
6. After deploy, update Supabase Auth URL Configuration with your Render URL

### Option B: Railway

```bash
# Install Railway CLI
npm i -g @railway/cli
railway login
railway new
railway add --database  # not needed, using Supabase
railway deploy
railway variables set NEXT_PUBLIC_SUPABASE_URL=...
```

### Option C: Vercel (fastest, best Next.js support)

```bash
npx vercel
# Follow prompts, set env vars when asked
```

---

## Step 6 — Deploy the Escalation Cron (Supabase Edge Functions)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the escalation function
supabase functions deploy escalation-cron \
  --env-file .env.local

# Create cron schedule in Supabase SQL Editor:
SELECT cron.schedule(
  'escalation-check',
  '0 * * * *',  -- every hour
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/escalation-cron',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  );
  $$
);
```

---

## Key Security Decisions

### Why the maker-checker rule is in 3 places

1. **Application layer** (`lib/actions/po.ts`) — First check, returns user-friendly error
2. **Database constraint** (`CONSTRAINT maker_checker_supplier CHECK (created_by != approved_by)`) — Cannot be bypassed even with direct SQL
3. **Audit log** — Any bypass attempt is logged with `BLOCKED_SELF_APPROVAL` action + `critical` severity

### Why audit log has no UPDATE/DELETE RLS

Supabase RLS works by adding WHERE clauses to queries. If there is no UPDATE policy, the engine blocks all UPDATE statements from any role including the authenticated user. The service role (used by Edge Functions) bypasses RLS — so escalation can insert but never modify past entries.

### Google Workspace domain restriction

In `app/auth/login/page.tsx`:
```typescript
queryParams: {
  hd: 'yourcompany.com',  // only allows your domain
}
```

This is enforced by Google itself — users from other domains cannot complete the OAuth flow.

---

## Useful Monitoring Queries

```sql
-- Users with most pending approvals
SELECT user_name, user_email, COUNT(*) as blocked_count
FROM audit_log
WHERE action = 'BLOCKED_SELF_APPROVAL'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY user_name, user_email ORDER BY blocked_count DESC;

-- Average approval time by level
SELECT level,
  ROUND(AVG(EXTRACT(EPOCH FROM (acted_at - created_at))/3600), 1) AS avg_hours
FROM approval_steps
WHERE action = 'approved' AND acted_at IS NOT NULL
GROUP BY level ORDER BY level;

-- Monthly spend by company
SELECT company_name, currency,
  SUM(total_amount) FILTER (WHERE final_action = 'approved') AS approved_spend,
  COUNT(*) FILTER (WHERE status LIKE 'pending_%') AS pending_count
FROM v_po_summary
WHERE created_at > date_trunc('month', NOW())
GROUP BY company_name, currency;

-- Overdue approvals right now
SELECT po_number, level, due_at, company_name,
  ROUND(EXTRACT(EPOCH FROM (NOW() - due_at))/3600, 1) AS hours_overdue
FROM approval_steps s
JOIN v_po_summary po ON po.id = s.po_id
WHERE s.action = 'pending' AND s.due_at < NOW()
ORDER BY due_at;

-- Audit exports in last 30 days (who exported what)
SELECT user_name, user_email, entity_type,
  new_values->>'rows_exported' AS rows,
  new_values->>'ip' AS from_ip,
  created_at
FROM audit_log
WHERE action = 'EXPORT'
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```
