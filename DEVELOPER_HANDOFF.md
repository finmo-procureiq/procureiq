# ProcureIQ Enterprise — Developer Handoff

**From:** Suriya Raj (Procurement Lead)
**To:** Developer
**Date:** May 2026

---

## What we're building

A hosted procurement management web app for our team (50+ users across 3 companies). We have a working prototype already built — your job is to wire it up to a real database, deploy it, and get the team onboarded.

Everything below is already designed and decided. You don't need to make any product decisions — just follow the steps.

---

## The prototype

Two files are attached to this document:

- `procurement-tool-v2.html` — the working UI prototype (open in any browser to see it)
- `procureiq-enterprise-v3.zip` — the full Next.js codebase, ready to deploy

The codebase includes:
- Complete database schema (PostgreSQL via Supabase)
- All API logic and server actions
- Google SSO authentication
- Maker-checker approval enforcement at database + app level
- Role-based access for all 3 companies
- Audit trail, email notifications, export to CSV
- Auto-escalation cron job for overdue approvals

---

## Tech stack (already chosen)

| Layer | Tool | Why |
|---|---|---|
| Frontend + Backend | Next.js 14 | Fullstack, one codebase |
| Database + Auth | Supabase | Postgres + Google SSO built-in, free tier |
| Hosting | Render.com | Simplest deployment, free to start |
| AI features | Anthropic Claude API | Already integrated |

**All free to start.** Supabase free tier handles 50,000 monthly active users. Render free tier is fine for testing; upgrade to Starter ($7/mo) for production.

---

## Step 1 — Create the Supabase project (~15 min)

Supabase is the database + auth provider.

1. Go to **https://supabase.com** → Sign up (free)
2. Click **New project**
   - Name: `procureiq`
   - Database password: create a strong one and save it
   - Region: `South Asia (Mumbai)` or nearest to your team
   - Click **Create new project** — wait ~2 minutes

3. Once ready, go to **SQL Editor** (left sidebar) → **New query**
4. Open `procureiq-enterprise-v3.zip` → find the file at:
   `supabase/migrations/001_enterprise_schema.sql`
5. Copy the **entire contents** of that file → paste into the SQL editor → click **Run**
   - You should see: "Success. No rows returned"
   - This creates all database tables, security policies, and indexes

### Get your API keys

In Supabase → **Settings** → **API**:
- Copy **Project URL** (looks like `https://abcxyz.supabase.co`)
- Copy **anon public** key (long string starting with `eyJ...`)
- Copy **service_role** key (another long string — keep this secret)

---

## Step 2 — Set up Google SSO (~20 min)

This lets the team sign in with their existing Google/Gmail accounts.

### Create a Google OAuth app

1. Go to **https://console.cloud.google.com**
2. Create a new project (or use an existing one) — name it `ProcureIQ`
3. Left sidebar → **APIs & Services** → **Credentials**
4. Click **+ Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Name: `ProcureIQ`
7. Under **Authorized redirect URIs**, add:
   ```
   https://YOUR_SUPABASE_PROJECT_ID.supabase.co/auth/v1/callback
   ```
   (Replace `YOUR_SUPABASE_PROJECT_ID` with the ID from your Supabase URL)
8. Click **Create** → Copy the **Client ID** and **Client Secret**

### Connect Google to Supabase

1. In Supabase → **Authentication** → **Providers** → find **Google** → toggle on
2. Paste your **Client ID** and **Client Secret**
3. Save

### Set allowed redirect URLs

In Supabase → **Authentication** → **URL Configuration**:
- Site URL: `http://localhost:3000` (change to your Render URL after deployment)
- Redirect URLs — add both:
  ```
  http://localhost:3000/auth/callback
  https://YOUR-APP.onrender.com/auth/callback
  ```

---

## Step 3 — Set up the companies and roles (~10 min)

After the database is created, seed the initial company data.

In Supabase → **SQL Editor** → **New query** → paste and run:

```sql
-- Create the 3 companies
INSERT INTO companies (name, legal_name, code, country, currency, gstin) VALUES
  ('Acme India Pvt Ltd', 'Acme Technologies India Private Limited', 'ACME-IN', 'India', 'INR', '29AABCA1234A1Z5'),
  ('Acme Singapore Pte Ltd', NULL, 'ACME-SG', 'Singapore', 'SGD', NULL),
  ('Acme UAE LLC', NULL, 'ACME-AE', 'UAE', 'AED', NULL);

-- Create roles + approval matrix for India entity
-- (repeat this block for ACME-SG and ACME-AE, changing the code)
DO $$
DECLARE v_cid UUID := (SELECT id FROM companies WHERE code = 'ACME-IN');
BEGIN
  INSERT INTO roles (company_id, name, code, is_system, permissions) VALUES
  (v_cid,'Super Admin',     'SUPER_ADMIN', true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L5"}'),
  (v_cid,'Company Admin',   'ADMIN',       true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L4"}'),
  (v_cid,'Maker',           'MAKER',       true,'{"can_create_po":true,"can_approve_po":false,"can_approve_supplier":false,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false}'),
  (v_cid,'L1 Checker (HOD)','L1_CHECKER',  true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":false,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false,"approval_level":"L1","spend_limit":25000}'),
  (v_cid,'L2 Finance Mgr', 'L2_CHECKER',  true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false,"approval_level":"L2","spend_limit":100000}'),
  (v_cid,'L3 VP Ops',      'L3_CHECKER',  true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false,"approval_level":"L3","spend_limit":500000}'),
  (v_cid,'L4 CFO',         'L4_CHECKER',  true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L4","spend_limit":10000000}'),
  (v_cid,'L5 CEO/Board',   'L5_CHECKER',  true,'{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L5"}'),
  (v_cid,'Viewer',          'VIEWER',      true,'{"can_create_po":false,"can_approve_po":false,"can_approve_supplier":false,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false}');

  -- Approval matrix (spend thresholds → required approval levels)
  INSERT INTO approval_matrix (company_id, min_amount, max_amount, required_levels, escalation_hrs) VALUES
  (v_cid,        0,   25000, ARRAY['L1'],           24),
  (v_cid,    25000,  100000, ARRAY['L1','L2'],      48),
  (v_cid,   100000,  500000, ARRAY['L1','L2','L3'], 48),
  (v_cid,   500000, 2500000, ARRAY['L2','L3','L4'], 72),
  (v_cid,  2500000,10000000, ARRAY['L3','L4','L5'], 72),
  (v_cid, 10000000,    NULL, ARRAY['L4','L5'],      72);

  -- FY 2025-26 budget allocations
  INSERT INTO budgets (company_id, fiscal_year, category, allocated, currency) VALUES
  (v_cid,'2025-26','IT & Software',       15000000,'INR'),
  (v_cid,'2025-26','Raw Materials',       25000000,'INR'),
  (v_cid,'2025-26','Logistics',            8000000,'INR'),
  (v_cid,'2025-26','Office Supplies',      4000000,'INR'),
  (v_cid,'2025-26','Professional Services',7000000,'INR'),
  (v_cid,'2025-26','Manufacturing',       11000000,'INR');
END;
$$;
```

---

## Step 4 — Run the app locally to test (~10 min)

Before deploying, verify everything works locally.

```bash
# Unzip the codebase
unzip procureiq-enterprise-v3.zip
cd procureiq-enterprise

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

Open `.env.local` in any text editor and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your anon key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...your service role key...
ANTHROPIC_API_KEY=sk-ant-...your key from console.anthropic.com...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Then run:
```bash
npm run dev
```

Open **http://localhost:3000** — you should see the login page. Click "Continue with Google" and sign in.

---

## Step 5 — Deploy to Render.com (~15 min)

### Push the code to GitHub first

```bash
cd procureiq-enterprise
git init
git add .
git commit -m "Initial ProcureIQ enterprise setup"
```

Create a new repo at **https://github.com/new** (private), then:
```bash
git remote add origin https://github.com/YOUR_USERNAME/procureiq.git
git push -u origin main
```

### Deploy on Render

1. Go to **https://render.com** → Sign up → **New** → **Web Service**
2. Connect your GitHub account → select the `procureiq` repo
3. Settings:
   - **Name:** `procureiq`
   - **Environment:** `Node`
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
   - **Node version:** `20`
4. Click **Add Environment Variable** — add each of these:
   - `NEXT_PUBLIC_SUPABASE_URL` → your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → your anon key
   - `SUPABASE_SERVICE_ROLE_KEY` → your service role key
   - `ANTHROPIC_API_KEY` → your Anthropic key
   - `NEXT_PUBLIC_APP_URL` → `https://procureiq.onrender.com` (your Render URL)
5. Click **Create Web Service** — deployment takes ~3 minutes

6. Once deployed, **update Supabase redirect URLs** (Authentication → URL Configuration) to add your Render URL.

---

## Step 6 — Invite the team (~ongoing)

When a team member visits the app and signs in with Google for the first time, they land on a "pending access" page. You then assign them a role via SQL:

```sql
-- Find the user who just signed up
SELECT id, full_name, email FROM user_profiles ORDER BY created_at DESC LIMIT 10;

-- Assign them a role in a company
-- Change the email, company code, and role code as needed
INSERT INTO company_members (company_id, user_id, role_id)
SELECT c.id, up.id, r.id
FROM companies c
JOIN user_profiles up ON up.email = 'suriya@acmecorp.com'
JOIN roles r ON r.company_id = c.id AND r.code = 'MAKER'
WHERE c.code = 'ACME-IN';

-- To give same person a different role in another company:
INSERT INTO company_members (company_id, user_id, role_id)
SELECT c.id, up.id, r.id
FROM companies c
JOIN user_profiles up ON up.email = 'suriya@acmecorp.com'
JOIN roles r ON r.company_id = c.id AND r.code = 'L2_CHECKER'
WHERE c.code = 'ACME-SG';
```

**Role codes to use:**

| Code | Who gets it |
|---|---|
| `SUPER_ADMIN` | IT admin / system owner |
| `ADMIN` | Company admin |
| `MAKER` | Procurement team who create POs |
| `L1_CHECKER` | Dept Head / HOD |
| `L2_CHECKER` | Finance Manager |
| `L3_CHECKER` | VP Operations |
| `L4_CHECKER` | CFO |
| `L5_CHECKER` | CEO / Board |
| `VIEWER` | Auditors / read-only access |

---

## Step 7 — Set up the escalation cron (optional but recommended)

This automatically flags overdue approvals every hour. Without it, overdue approvals still show in the UI — but checkers don't get auto-reminded.

```bash
# Install Supabase CLI
npm install -g supabase

# Login and link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF
# (Project ref is the ID in your Supabase URL, e.g. abcxyz123)

# Deploy the function
supabase functions deploy escalation-cron

# Schedule it to run every hour
# Run this in Supabase SQL Editor:
SELECT cron.schedule(
  'escalation-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/escalation-cron',
    headers := json_build_object('Authorization', 'Bearer YOUR_ANON_KEY')::jsonb
  );
  $$
);
```

---

## Decisions already made — no changes needed

These product decisions were made by the business owner. Please implement as-is:

- **Google SSO** is the primary login method. Password login is a fallback.
- **Maker-checker is absolute** — no user can approve their own PO or supplier. This is enforced at the database constraint level, not just the UI.
- **Approval levels L1–L5** map to HOD → Finance Mgr → VP → CFO → CEO. Spend thresholds are already seeded in the database.
- **Three companies** (India, Singapore, UAE) are fully isolated — users only see data from companies they're assigned to.
- **Audit log is write-only** — no record can be edited or deleted, by anyone.
- The **HTML prototype** (`procurement-tool-v2.html`) is the UI reference. The codebase implements all the same screens.

---

## If you get stuck

The full README is inside the ZIP at `README.md` — it has troubleshooting tips and useful SQL queries for monitoring.

For Supabase questions: **https://supabase.com/docs**
For Next.js questions: **https://nextjs.org/docs**
For Render questions: **https://render.com/docs**

The business owner can also share this conversation with Claude (claude.ai) to ask follow-up technical questions — all the context is already there.

---

## Estimated time

| Task | Time |
|---|---|
| Supabase setup + migration | 15 min |
| Google OAuth setup | 20 min |
| Seed companies + roles | 10 min |
| Local test | 10 min |
| Deploy to Render | 15 min |
| Onboard first 5 users | 15 min |
| **Total** | **~90 minutes** |

---

*Document generated by ProcureIQ setup assistant.*
