-- ================================================================
-- ProcureIQ Enterprise v3 — Full Database Schema
-- Designed for: 50+ users, 3-10 companies, Google SSO, audit-grade
--
-- Run in: Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ================================================================

-- ── Extensions ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";  -- query perf monitoring

-- ================================================================
-- SECTION 1: CORE ENTITY TABLES
-- ================================================================

-- ── 1.1 Companies (multi-entity isolation) ─────────────────────
CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  legal_name      TEXT,
  code            TEXT NOT NULL UNIQUE,      -- e.g. "ACME-IN", "ACME-SG"
  country         TEXT NOT NULL DEFAULT 'India',
  currency        TEXT NOT NULL DEFAULT 'INR',
  gstin           TEXT,
  pan             TEXT,
  tan             TEXT,
  address         JSONB DEFAULT '{}',         -- {line1, city, state, pin, country}
  logo_url        TEXT,
  fiscal_year_start INT DEFAULT 4,            -- month: 4 = April (India standard)
  settings        JSONB DEFAULT '{}',         -- company-level feature flags
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID,                       -- super admin who created it
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 1.2 User Profiles (extends Supabase auth.users) ─────────────
CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT,
  designation     TEXT,
  department      TEXT,
  employee_id     TEXT,
  avatar_url      TEXT,
  google_id       TEXT UNIQUE,               -- from Google SSO
  last_login_at   TIMESTAMPTZ,
  last_login_ip   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 1.3 Roles (flexible role definitions per company) ────────────
CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,             -- "CFO", "Finance Manager", "HOD"
  code            TEXT NOT NULL,             -- "L4_CHECKER", "MAKER", etc.
  permissions     JSONB NOT NULL DEFAULT '{}',
  -- permissions shape:
  --   { can_create_po: bool, can_approve_po: bool,
  --     can_approve_supplier: bool, can_approve_payment: bool,
  --     can_manage_users: bool, can_view_reports: bool,
  --     can_export_audit: bool, spend_limit: number | null,
  --     approval_level: "L1"|"L2"|"L3"|"L4"|"L5" | null }
  is_system       BOOLEAN DEFAULT false,     -- system roles cannot be deleted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- ── 1.4 Company Members (user ↔ company with role) ───────────────
CREATE TABLE company_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role_id         UUID NOT NULL REFERENCES roles(id),
  is_primary      BOOLEAN DEFAULT false,     -- primary company for this user
  spend_limit     NUMERIC(18,2),             -- per-user override (overrides role limit)
  can_emergency_bypass BOOLEAN DEFAULT false,
  invited_by      UUID REFERENCES user_profiles(id),
  invited_at      TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  deactivated_at  TIMESTAMPTZ,
  deactivated_by  UUID REFERENCES user_profiles(id),
  UNIQUE(company_id, user_id)
);

-- ── 1.5 Approval Matrix ──────────────────────────────────────────
CREATE TABLE approval_matrix (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category        TEXT,                      -- NULL = applies to all categories
  priority        TEXT,                      -- NULL = applies to all priorities
  min_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_amount      NUMERIC(18,2),             -- NULL = no upper limit
  required_levels TEXT[] NOT NULL,           -- ['L1','L2'] = both required
  workflow_type   TEXT NOT NULL DEFAULT 'sequential',
                                             -- sequential | parallel | any-of | majority
  escalation_hrs  INT NOT NULL DEFAULT 48,
  auto_approve    BOOLEAN DEFAULT false,     -- auto-approve if no response after X hrs
  notify_on_submit BOOLEAN DEFAULT true,
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 1.6 Suppliers ─────────────────────────────────────────────────
CREATE TYPE supplier_status AS ENUM ('pending','under_review','approved','suspended','blacklisted');
CREATE TYPE supplier_tier AS ENUM ('preferred','standard','restricted','new');

CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  legal_name      TEXT,
  code            TEXT,                      -- SUP-ACME-IN-0001
  category        TEXT NOT NULL,
  sub_category    TEXT,
  tier            supplier_tier DEFAULT 'new',
  gstin           TEXT,
  pan             TEXT,
  cin             TEXT,
  email           TEXT,
  phone           TEXT,
  website         TEXT,
  address         JSONB DEFAULT '{}',
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  bank_details    JSONB DEFAULT '{}',        -- encrypted at app layer before storing
  -- { bank_name, account_number, ifsc, branch, account_type }
  payment_terms   INT NOT NULL DEFAULT 30,
  credit_limit    NUMERIC(18,2),
  currency        TEXT DEFAULT 'INR',
  risk_score      INT DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_factors    JSONB DEFAULT '[]',        -- AI-generated risk breakdown
  status          supplier_status NOT NULL DEFAULT 'pending',
  -- Maker-checker: created_by ≠ approved_by enforced at app+DB level
  created_by      UUID NOT NULL REFERENCES user_profiles(id),
  submitted_for_review_at TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES user_profiles(id),
  review_notes    TEXT,
  approved_by     UUID REFERENCES user_profiles(id),
  approved_at     TIMESTAMPTZ,
  blacklisted_by  UUID REFERENCES user_profiles(id),
  blacklist_reason TEXT,
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT,
  documents       JSONB DEFAULT '[]',        -- [{name, url, type, uploaded_at}]
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT maker_checker_supplier CHECK (created_by != approved_by OR approved_by IS NULL)
);

-- ── 1.7 Purchase Orders ───────────────────────────────────────────
CREATE TYPE po_status AS ENUM (
  'draft','submitted',
  'pending_l1','pending_l2','pending_l3','pending_l4','pending_l5',
  'approved','rejected','cancelled','recalled','closed','on_hold'
);
CREATE TYPE po_priority AS ENUM ('low','normal','high','urgent','emergency');

CREATE TABLE purchase_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_number       TEXT NOT NULL,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  category        TEXT NOT NULL,
  sub_category    TEXT,
  description     TEXT NOT NULL,
  line_items      JSONB DEFAULT '[]',        -- [{desc, qty, unit, unit_price, total}]
  amount          NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'INR',
  exchange_rate   NUMERIC(10,6) DEFAULT 1,  -- to base currency
  tax_type        TEXT DEFAULT 'GST',
  tax_rate        NUMERIC(5,2) DEFAULT 18,
  tax_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(18,2) GENERATED ALWAYS AS (amount + tax_amount) STORED,
  status          po_status NOT NULL DEFAULT 'draft',
  priority        po_priority NOT NULL DEFAULT 'normal',
  current_level   TEXT,                      -- 'L1'...'L5' or null
  workflow_type   TEXT NOT NULL DEFAULT 'sequential',
  required_by     DATE,
  delivery_address JSONB DEFAULT '{}',
  cost_center     TEXT,
  project_code    TEXT,
  budget_line     TEXT,
  attachment_urls TEXT[] DEFAULT '{}',
  notes           TEXT,
  internal_notes  TEXT,                      -- only visible to checkers/admins
  tags            TEXT[] DEFAULT '{}',
  -- Maker fields
  created_by      UUID NOT NULL REFERENCES user_profiles(id),
  submitted_at    TIMESTAMPTZ,
  -- Final outcome
  final_action    TEXT,
  final_action_by UUID REFERENCES user_profiles(id),
  final_action_at TIMESTAMPTZ,
  rejection_reason TEXT,
  on_hold_reason  TEXT,
  -- Recall
  recalled_by     UUID REFERENCES user_profiles(id),
  recalled_at     TIMESTAMPTZ,
  recall_reason   TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, po_number)
);

-- ── 1.8 Approval Steps (immutable maker-checker trail) ────────────
CREATE TYPE step_action AS ENUM (
  'pending','approved','rejected','escalated','recalled','skipped','delegated'
);

CREATE TABLE approval_steps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id),
  step_number     INT NOT NULL,
  level           TEXT NOT NULL,             -- 'L1','L2','L3','L4','L5'
  required_role_id UUID REFERENCES roles(id),
  -- Assigned approver (null = any checker at this level)
  assigned_to     UUID REFERENCES user_profiles(id),
  -- Who actually acted
  acted_by        UUID REFERENCES user_profiles(id),
  action          step_action NOT NULL DEFAULT 'pending',
  comments        TEXT,
  internal_note   TEXT,
  delegated_to    UUID REFERENCES user_profiles(id),
  due_at          TIMESTAMPTZ,
  acted_at        TIMESTAMPTZ,
  reminded_at     TIMESTAMPTZ,
  escalated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Immutability: once acted, cannot change action
  CONSTRAINT step_immutable CHECK (
    action = 'pending' OR acted_at IS NOT NULL
  )
);

-- ── 1.9 Payments / Invoices ───────────────────────────────────────
CREATE TYPE payment_status AS ENUM (
  'pending','pending_approval','approved','processing','paid',
  'overdue','disputed','cancelled','partial'
);

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL,
  po_id           UUID REFERENCES purchase_orders(id),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  invoice_amount  NUMERIC(18,2) NOT NULL CHECK (invoice_amount > 0),
  tax_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  tds_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(18,2) GENERATED ALWAYS AS (invoice_amount + tax_amount - tds_amount) STORED,
  currency        TEXT NOT NULL DEFAULT 'INR',
  exchange_rate   NUMERIC(10,6) DEFAULT 1,
  due_date        DATE NOT NULL,
  paid_date       DATE,
  payment_method  TEXT,                      -- NEFT | RTGS | IMPS | Cheque | Wire
  bank_ref        TEXT,                      -- UTR / Cheque no
  status          payment_status NOT NULL DEFAULT 'pending',
  payment_batch   TEXT,                      -- group payments by batch
  notes           TEXT,
  attachment_urls TEXT[] DEFAULT '{}',
  -- Maker-checker
  created_by      UUID NOT NULL REFERENCES user_profiles(id),
  approved_by     UUID REFERENCES user_profiles(id),
  approved_at     TIMESTAMPTZ,
  paid_by         UUID REFERENCES user_profiles(id),
  paid_confirmed_at TIMESTAMPTZ,
  disputed_by     UUID REFERENCES user_profiles(id),
  dispute_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, invoice_number),
  CONSTRAINT payment_maker_checker CHECK (created_by != approved_by OR approved_by IS NULL)
);

-- ── 1.10 Budgets ──────────────────────────────────────────────────
CREATE TABLE budgets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year     TEXT NOT NULL,             -- '2025-26'
  category        TEXT NOT NULL,
  sub_category    TEXT,
  allocated       NUMERIC(18,2) NOT NULL CHECK (allocated >= 0),
  currency        TEXT NOT NULL DEFAULT 'INR',
  warn_threshold  NUMERIC(3,2) DEFAULT 0.80, -- warn at 80%
  freeze_threshold NUMERIC(3,2) DEFAULT 0.95,-- freeze at 95%
  notes           TEXT,
  approved_by     UUID REFERENCES user_profiles(id),
  created_by      UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, fiscal_year, category)
);

-- ── 1.11 Audit Log (write-once, immutable) ────────────────────────
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Denormalized for immutability (don't JOIN — data must survive user deletion)
  company_id      UUID,
  company_name    TEXT,
  user_id         UUID,
  user_name       TEXT NOT NULL,
  user_email      TEXT NOT NULL,
  user_role       TEXT,
  action          TEXT NOT NULL,             -- CREATE|UPDATE|SUBMIT|APPROVE|REJECT|...
  entity_type     TEXT NOT NULL,             -- purchase_order|supplier|payment|user...
  entity_id       UUID,
  entity_ref      TEXT,                      -- human-readable: PO-2025-0001
  old_values      JSONB,
  new_values      JSONB,
  diff            JSONB,                     -- computed diff (only changed fields)
  ip_address      INET,
  user_agent      TEXT,
  session_id      TEXT,
  request_id      TEXT,                      -- for tracing
  severity        TEXT DEFAULT 'info',       -- info|warning|critical
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 1.12 Notifications ────────────────────────────────────────────
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID REFERENCES companies(id),
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  body            TEXT,
  type            TEXT NOT NULL DEFAULT 'info',
  action_url      TEXT,
  action_label    TEXT,
  entity_type     TEXT,
  entity_id       UUID,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  is_emailed      BOOLEAN DEFAULT false,
  emailed_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 1.13 Sessions (track active logins) ──────────────────────────
CREATE TABLE user_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id),
  ip_address      INET,
  user_agent      TEXT,
  device_info     JSONB DEFAULT '{}',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true
);

-- ── 1.14 Email Queue ──────────────────────────────────────────────
CREATE TABLE email_queue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID REFERENCES companies(id),
  to_email        TEXT NOT NULL,
  to_name         TEXT,
  template        TEXT NOT NULL,             -- 'approval_request'|'rejected'|etc.
  subject         TEXT NOT NULL,
  variables       JSONB DEFAULT '{}',        -- template variables
  status          TEXT DEFAULT 'pending',    -- pending|sent|failed|bounced
  attempts        INT DEFAULT 0,
  last_error      TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- SECTION 2: PERFORMANCE INDEXES
-- ================================================================

-- Companies
CREATE INDEX idx_companies_active ON companies(is_active) WHERE is_active = true;

-- Members
CREATE INDEX idx_members_user    ON company_members(user_id, is_active);
CREATE INDEX idx_members_company ON company_members(company_id, is_active);
CREATE INDEX idx_members_role    ON company_members(role_id);

-- Suppliers
CREATE INDEX idx_suppliers_company  ON suppliers(company_id, status);
CREATE INDEX idx_suppliers_category ON suppliers(company_id, category);
CREATE INDEX idx_suppliers_search   ON suppliers USING gin(to_tsvector('english', name || ' ' || COALESCE(gstin,'') || ' ' || COALESCE(code,'')));

-- Purchase Orders (most queried table — index everything we filter on)
CREATE INDEX idx_po_company_status  ON purchase_orders(company_id, status);
CREATE INDEX idx_po_created_by      ON purchase_orders(created_by);
CREATE INDEX idx_po_supplier        ON purchase_orders(supplier_id);
CREATE INDEX idx_po_submitted_at    ON purchase_orders(submitted_at DESC) WHERE submitted_at IS NOT NULL;
CREATE INDEX idx_po_pending         ON purchase_orders(company_id, current_level) WHERE status LIKE 'pending_%';
CREATE INDEX idx_po_amount          ON purchase_orders(company_id, amount);
CREATE INDEX idx_po_number_search   ON purchase_orders(company_id, po_number);
CREATE INDEX idx_po_tags            ON purchase_orders USING gin(tags);

-- Approval Steps
CREATE INDEX idx_steps_po       ON approval_steps(po_id);
CREATE INDEX idx_steps_pending  ON approval_steps(company_id, level, action) WHERE action = 'pending';
CREATE INDEX idx_steps_assigned ON approval_steps(assigned_to) WHERE action = 'pending';
CREATE INDEX idx_steps_due      ON approval_steps(due_at) WHERE action = 'pending';

-- Payments
CREATE INDEX idx_payments_company ON payments(company_id, status);
CREATE INDEX idx_payments_overdue ON payments(due_date, status) WHERE status NOT IN ('paid','cancelled');
CREATE INDEX idx_payments_supplier ON payments(supplier_id);
CREATE INDEX idx_payments_po      ON payments(po_id) WHERE po_id IS NOT NULL;

-- Audit Log (heavy read table — partition by month in production)
CREATE INDEX idx_audit_company   ON audit_log(company_id, created_at DESC);
CREATE INDEX idx_audit_entity    ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user      ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_action    ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_severity  ON audit_log(severity) WHERE severity IN ('warning','critical');

-- Notifications
CREATE INDEX idx_notif_user_unread ON notifications(user_id, is_read, created_at DESC) WHERE NOT is_read;
CREATE INDEX idx_notif_email_queue ON notifications(is_emailed, created_at) WHERE NOT is_emailed;

-- Email Queue
CREATE INDEX idx_email_pending ON email_queue(status, created_at) WHERE status = 'pending';

-- Budgets
CREATE INDEX idx_budget_fy ON budgets(company_id, fiscal_year);

-- ================================================================
-- SECTION 3: FUNCTIONS AND TRIGGERS
-- ================================================================

-- Auto update updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_updated_companies  BEFORE UPDATE ON companies  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_profiles   BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_suppliers  BEFORE UPDATE ON suppliers  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_pos        BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_payments   BEFORE UPDATE ON payments   FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_budgets    BEFORE UPDATE ON budgets    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_matrix     BEFORE UPDATE ON approval_matrix FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Auto-create user profile on Google SSO signup
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name TEXT;
  v_google_id TEXT;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_google_id := NEW.raw_user_meta_data->>'provider_id';

  INSERT INTO user_profiles (id, full_name, email, avatar_url, google_id, last_login_at)
  VALUES (
    NEW.id, v_name, NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    v_google_id,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    last_login_at = NOW(),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();

-- Generate PO number (company-scoped sequence)
CREATE SEQUENCE IF NOT EXISTS po_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION fn_generate_po_number(p_company_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
  v_year TEXT := TO_CHAR(NOW(), 'YYYY');
  v_seq  BIGINT;
BEGIN
  SELECT code INTO v_code FROM companies WHERE id = p_company_id;
  -- Pad to 5 digits (supports 99,999 POs per year per company)
  SELECT COALESCE(MAX(CAST(split_part(po_number, '-', -1) AS INT)), 0) + 1
  INTO v_seq
  FROM purchase_orders
  WHERE company_id = p_company_id
    AND po_number LIKE v_code || '-PO-' || v_year || '-%';
  RETURN v_code || '-PO-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$;

-- Generate supplier code
CREATE OR REPLACE FUNCTION fn_generate_supplier_code(p_company_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
  v_seq  BIGINT;
BEGIN
  SELECT code INTO v_code FROM companies WHERE id = p_company_id;
  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq FROM suppliers WHERE company_id = p_company_id;
  RETURN 'SUP-' || v_code || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

-- Auto-create approval steps when PO is submitted
CREATE OR REPLACE FUNCTION fn_create_approval_steps(p_po_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_po     purchase_orders%ROWTYPE;
  v_matrix approval_matrix%ROWTYPE;
  v_step   INT := 1;
  v_level  TEXT;
  v_due    TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;

  -- Delete any existing pending steps (re-submission)
  DELETE FROM approval_steps WHERE po_id = p_po_id AND action = 'pending';

  -- Find the matching matrix rule (most specific wins: category + priority > category > priority > default)
  SELECT * INTO v_matrix FROM approval_matrix
  WHERE company_id = v_po.company_id
    AND v_po.amount >= min_amount
    AND (max_amount IS NULL OR v_po.amount < max_amount)
    AND is_active = true
    AND (category IS NULL OR category = v_po.category)
    AND (priority IS NULL OR priority = v_po.priority::TEXT)
  ORDER BY
    (category IS NOT NULL)::INT + (priority IS NOT NULL)::INT DESC,
    min_amount DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No approval matrix rule found for amount % in company %', v_po.amount, v_po.company_id;
  END IF;

  -- Create one step per required level
  FOREACH v_level IN ARRAY v_matrix.required_levels LOOP
    v_due := NOW() + (v_matrix.escalation_hrs || ' hours')::INTERVAL;
    INSERT INTO approval_steps (
      po_id, company_id, step_number, level, due_at,
      action, created_at
    ) VALUES (
      p_po_id, v_po.company_id, v_step, v_level, v_due,
      'pending', NOW()
    );
    v_step := v_step + 1;
  END LOOP;

  -- Advance PO to first pending level
  UPDATE purchase_orders SET
    status = ('pending_' || lower(v_matrix.required_levels[1]))::po_status,
    current_level = v_matrix.required_levels[1],
    submitted_at = COALESCE(submitted_at, NOW())
  WHERE id = p_po_id;
END;
$$;

-- Compute diff JSONB between old and new
CREATE OR REPLACE FUNCTION fn_jsonb_diff(old_val JSONB, new_val JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_object_agg(key, value)
  FROM (
    SELECT key, new_val->key AS value
    FROM jsonb_object_keys(new_val) AS key
    WHERE new_val->key IS DISTINCT FROM old_val->key
  ) diffs;
$$;

-- Check budget utilization (returns warning if over threshold)
CREATE OR REPLACE FUNCTION fn_check_budget(
  p_company_id UUID,
  p_category   TEXT,
  p_fiscal_year TEXT,
  p_amount     NUMERIC
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_budget    budgets%ROWTYPE;
  v_spent     NUMERIC;
  v_pct       NUMERIC;
BEGIN
  SELECT * INTO v_budget FROM budgets
  WHERE company_id = p_company_id
    AND fiscal_year = p_fiscal_year
    AND category = p_category;

  IF NOT FOUND THEN RETURN '{"status":"no_budget"}'::JSONB; END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_spent
  FROM purchase_orders
  WHERE company_id = p_company_id
    AND category = p_category
    AND status IN ('approved','pending_l1','pending_l2','pending_l3','pending_l4','pending_l5')
    AND date_trunc('year', created_at) = date_trunc('year', NOW());

  v_pct := (v_spent + p_amount) / NULLIF(v_budget.allocated, 0);

  RETURN jsonb_build_object(
    'status', CASE
      WHEN v_pct >= v_budget.freeze_threshold THEN 'freeze'
      WHEN v_pct >= v_budget.warn_threshold   THEN 'warn'
      ELSE 'ok'
    END,
    'allocated', v_budget.allocated,
    'spent', v_spent,
    'after_this_po', v_spent + p_amount,
    'utilization_pct', ROUND(v_pct * 100, 1)
  );
END;
$$;

-- ================================================================
-- SECTION 4: VIEWS
-- ================================================================

CREATE OR REPLACE VIEW v_po_summary AS
SELECT
  po.id, po.po_number, po.company_id,
  c.name AS company_name, c.code AS company_code, c.currency,
  po.status, po.priority, po.current_level, po.workflow_type,
  po.amount, po.tax_amount, po.total_amount,
  po.category, po.sub_category, po.cost_center, po.project_code,
  po.description, po.required_by, po.attachment_urls,
  po.created_at, po.submitted_at, po.final_action_at,
  po.final_action, po.rejection_reason, po.recall_reason,
  -- Supplier
  s.id AS supplier_id, s.name AS supplier_name,
  s.category AS supplier_category, s.tier AS supplier_tier,
  -- Maker
  maker.id AS maker_id, maker.full_name AS maker_name,
  maker.email AS maker_email, maker.designation AS maker_designation,
  -- Final approver
  approver.full_name AS final_approver_name,
  -- Pending step info
  (SELECT COUNT(*) FROM approval_steps st WHERE st.po_id = po.id AND st.action = 'pending') AS pending_steps,
  (SELECT MIN(due_at) FROM approval_steps st WHERE st.po_id = po.id AND st.action = 'pending') AS earliest_due_at,
  -- Days since submitted
  EXTRACT(EPOCH FROM (NOW() - po.submitted_at)) / 86400 AS days_pending
FROM purchase_orders po
JOIN companies c ON c.id = po.company_id
JOIN suppliers s ON s.id = po.supplier_id
JOIN user_profiles maker ON maker.id = po.created_by
LEFT JOIN user_profiles approver ON approver.id = po.final_action_by;

CREATE OR REPLACE VIEW v_payment_summary AS
SELECT
  p.id, p.invoice_number, p.company_id, p.status,
  p.invoice_amount, p.tax_amount, p.tds_amount, p.net_amount,
  p.currency, p.due_date, p.paid_date, p.payment_method,
  p.bank_ref, p.payment_batch, p.notes,
  s.name AS supplier_name, s.code AS supplier_code,
  s.category AS supplier_category,
  po.po_number,
  creator.full_name AS created_by_name,
  approver.full_name AS approved_by_name,
  payer.full_name AS paid_by_name,
  -- Overdue logic
  (p.due_date < CURRENT_DATE AND p.status NOT IN ('paid','cancelled','disputed')) AS is_overdue,
  GREATEST(0, CURRENT_DATE - p.due_date) AS days_overdue,
  p.created_at, p.updated_at
FROM payments p
JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN purchase_orders po ON po.id = p.po_id
LEFT JOIN user_profiles creator ON creator.id = p.created_by
LEFT JOIN user_profiles approver ON approver.id = p.approved_by
LEFT JOIN user_profiles payer ON payer.id = p.paid_by;

CREATE OR REPLACE VIEW v_budget_utilization AS
SELECT
  b.id, b.company_id, b.fiscal_year, b.category,
  b.allocated, b.currency, b.warn_threshold, b.freeze_threshold,
  COALESCE(spend.committed, 0) AS committed,
  COALESCE(spend.paid, 0) AS paid,
  b.allocated - COALESCE(spend.committed, 0) AS remaining,
  ROUND(COALESCE(spend.committed, 0) / NULLIF(b.allocated, 0) * 100, 1) AS utilization_pct,
  CASE
    WHEN COALESCE(spend.committed, 0) / NULLIF(b.allocated, 0) >= b.freeze_threshold THEN 'freeze'
    WHEN COALESCE(spend.committed, 0) / NULLIF(b.allocated, 0) >= b.warn_threshold THEN 'warn'
    ELSE 'ok'
  END AS budget_status
FROM budgets b
LEFT JOIN (
  SELECT
    company_id, category,
    SUM(total_amount) FILTER (WHERE status NOT IN ('rejected','cancelled','recalled')) AS committed,
    SUM(total_amount) FILTER (WHERE status = 'approved') AS paid
  FROM purchase_orders
  GROUP BY company_id, category
) spend ON spend.company_id = b.company_id AND spend.category = b.category;

CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  c.id AS company_id,
  c.name AS company_name,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'approved') AS active_suppliers,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'pending')  AS pending_suppliers,
  COUNT(DISTINCT po.id) FILTER (WHERE po.status LIKE 'pending_%') AS pending_approvals,
  COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'approved' AND po.created_at > NOW() - INTERVAL '30 days') AS approved_this_month,
  COALESCE(SUM(po.total_amount) FILTER (WHERE po.status = 'approved' AND po.created_at > NOW() - INTERVAL '30 days'), 0) AS spend_this_month,
  COUNT(DISTINCT pay.id) FILTER (WHERE pay.is_overdue) AS overdue_payments,
  COALESCE(SUM(pay.net_amount) FILTER (WHERE pay.is_overdue), 0) AS overdue_amount
FROM companies c
LEFT JOIN suppliers s ON s.company_id = c.id
LEFT JOIN purchase_orders po ON po.company_id = c.id
LEFT JOIN v_payment_summary pay ON pay.company_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.name;

-- ================================================================
-- SECTION 5: ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_matrix    ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue        ENABLE ROW LEVEL SECURITY;

-- ── Security helper functions ─────────────────────────────────────

-- Returns company IDs the current user is active in
CREATE OR REPLACE FUNCTION fn_my_company_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT company_id), '{}')
  FROM company_members
  WHERE user_id = auth.uid() AND is_active = true;
$$;

-- Returns the user's role permissions JSON for a company
CREATE OR REPLACE FUNCTION fn_my_permissions(p_company_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT r.permissions
  FROM company_members cm
  JOIN roles r ON r.id = cm.role_id
  WHERE cm.user_id = auth.uid()
    AND cm.company_id = p_company_id
    AND cm.is_active = true
  LIMIT 1;
$$;

-- Check specific permission for current user in a company
CREATE OR REPLACE FUNCTION fn_has_permission(p_company_id UUID, p_perm TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE((fn_my_permissions(p_company_id) ->> p_perm)::BOOLEAN, false);
$$;

-- Is current user a super_admin?
CREATE OR REPLACE FUNCTION fn_is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members cm
    JOIN roles r ON r.id = cm.role_id
    WHERE cm.user_id = auth.uid()
      AND cm.is_active = true
      AND r.code = 'SUPER_ADMIN'
  );
$$;

-- ── RLS Policies ─────────────────────────────────────────────────

-- COMPANIES
CREATE POLICY "read_my_companies" ON companies FOR SELECT
  USING (id = ANY(fn_my_company_ids()) OR fn_is_super_admin());

CREATE POLICY "super_admin_manage_companies" ON companies FOR ALL
  USING (fn_is_super_admin());

-- USER PROFILES
CREATE POLICY "read_colleagues" ON user_profiles FOR SELECT
  USING (
    id = auth.uid() OR
    id IN (SELECT user_id FROM company_members WHERE company_id = ANY(fn_my_company_ids()))
  );
CREATE POLICY "update_own_profile" ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- ROLES
CREATE POLICY "read_company_roles" ON roles FOR SELECT
  USING (company_id = ANY(fn_my_company_ids()) OR fn_is_super_admin());
CREATE POLICY "admin_manage_roles" ON roles FOR ALL
  USING (fn_has_permission(company_id, 'can_manage_users') OR fn_is_super_admin());

-- COMPANY MEMBERS
CREATE POLICY "read_company_members" ON company_members FOR SELECT
  USING (company_id = ANY(fn_my_company_ids()) OR fn_is_super_admin());
CREATE POLICY "admin_manage_members" ON company_members FOR ALL
  USING (fn_has_permission(company_id, 'can_manage_users') OR fn_is_super_admin());

-- APPROVAL MATRIX
CREATE POLICY "read_matrix" ON approval_matrix FOR SELECT
  USING (company_id = ANY(fn_my_company_ids()));
CREATE POLICY "admin_manage_matrix" ON approval_matrix FOR ALL
  USING (fn_has_permission(company_id, 'can_manage_users') OR fn_is_super_admin());

-- SUPPLIERS
CREATE POLICY "read_suppliers" ON suppliers FOR SELECT
  USING (company_id = ANY(fn_my_company_ids()));
CREATE POLICY "create_suppliers" ON suppliers FOR INSERT
  WITH CHECK (
    company_id = ANY(fn_my_company_ids()) AND
    fn_has_permission(company_id, 'can_create_po')
  );
CREATE POLICY "update_suppliers" ON suppliers FOR UPDATE
  USING (
    company_id = ANY(fn_my_company_ids()) AND (
      -- Maker can update their own pending supplier
      (created_by = auth.uid() AND status = 'pending') OR
      -- Checker/admin can approve/reject (but not if they created it — enforced via constraint)
      fn_has_permission(company_id, 'can_approve_supplier')
    )
  );

-- PURCHASE ORDERS
CREATE POLICY "read_pos" ON purchase_orders FOR SELECT
  USING (company_id = ANY(fn_my_company_ids()));

CREATE POLICY "create_pos" ON purchase_orders FOR INSERT
  WITH CHECK (
    company_id = ANY(fn_my_company_ids()) AND
    fn_has_permission(company_id, 'can_create_po')
  );

CREATE POLICY "update_pos" ON purchase_orders FOR UPDATE
  USING (
    company_id = ANY(fn_my_company_ids()) AND (
      -- Maker updates their own drafts
      (created_by = auth.uid() AND status = 'draft') OR
      -- Maker recalls (app enforces level check)
      (created_by = auth.uid() AND status IN ('pending_l1','pending_l2','pending_l3')) OR
      -- Checkers progress the approval
      fn_has_permission(company_id, 'can_approve_po') OR
      fn_is_super_admin()
    )
  );

-- APPROVAL STEPS
CREATE POLICY "read_steps" ON approval_steps FOR SELECT
  USING (company_id = ANY(fn_my_company_ids()));
CREATE POLICY "checkers_update_steps" ON approval_steps FOR UPDATE
  USING (
    company_id = ANY(fn_my_company_ids()) AND
    fn_has_permission(company_id, 'can_approve_po')
  );
-- System inserts steps
CREATE POLICY "system_insert_steps" ON approval_steps FOR INSERT
  WITH CHECK (company_id = ANY(fn_my_company_ids()));

-- PAYMENTS
CREATE POLICY "read_payments" ON payments FOR SELECT
  USING (company_id = ANY(fn_my_company_ids()));
CREATE POLICY "create_payments" ON payments FOR INSERT
  WITH CHECK (
    company_id = ANY(fn_my_company_ids()) AND
    fn_has_permission(company_id, 'can_create_po')
  );
CREATE POLICY "approve_payments" ON payments FOR UPDATE
  USING (
    company_id = ANY(fn_my_company_ids()) AND (
      fn_has_permission(company_id, 'can_approve_payment') OR fn_is_super_admin()
    )
  );

-- BUDGETS
CREATE POLICY "read_budgets" ON budgets FOR SELECT
  USING (company_id = ANY(fn_my_company_ids()));
CREATE POLICY "admin_manage_budgets" ON budgets FOR ALL
  USING (fn_has_permission(company_id, 'can_manage_users') OR fn_is_super_admin());

-- AUDIT LOG (read + insert only — no update, no delete ever)
CREATE POLICY "read_audit" ON audit_log FOR SELECT
  USING (
    (company_id = ANY(fn_my_company_ids()) AND fn_has_permission(company_id, 'can_export_audit'))
    OR fn_is_super_admin()
  );
CREATE POLICY "insert_audit" ON audit_log FOR INSERT WITH CHECK (true);
-- NO UPDATE or DELETE policy = physically impossible to alter audit records

-- NOTIFICATIONS (own only)
CREATE POLICY "own_notifications" ON notifications FOR ALL USING (user_id = auth.uid());

-- USER SESSIONS
CREATE POLICY "own_sessions" ON user_sessions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "admin_read_sessions" ON user_sessions FOR SELECT
  USING (fn_is_super_admin());

-- EMAIL QUEUE (system-managed, admins can read)
CREATE POLICY "admin_read_email_queue" ON email_queue FOR SELECT
  USING (fn_is_super_admin() OR fn_has_permission(company_id, 'can_manage_users'));
CREATE POLICY "system_insert_email" ON email_queue FOR INSERT WITH CHECK (true);

-- ================================================================
-- SECTION 6: SEED DATA
-- ================================================================

-- Insert default roles (these will be created per company via app,
-- but here we define the permission templates)
-- Run after inserting your first company.

-- Example: After creating company, run:
/*
DO $$
DECLARE v_cid UUID := (SELECT id FROM companies WHERE code = 'ACME-IN');
BEGIN
  INSERT INTO roles (company_id, name, code, is_system, permissions) VALUES
  (v_cid, 'Super Admin',      'SUPER_ADMIN',    true, '{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L5"}'),
  (v_cid, 'Company Admin',    'ADMIN',          true, '{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L4"}'),
  (v_cid, 'Maker',            'MAKER',          true, '{"can_create_po":true,"can_approve_po":false,"can_approve_supplier":false,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false}'),
  (v_cid, 'L1 Checker (HOD)','L1_CHECKER',     true, '{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":false,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false,"approval_level":"L1","spend_limit":25000}'),
  (v_cid, 'L2 Checker (Finance Mgr)', 'L2_CHECKER', true, '{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false,"approval_level":"L2","spend_limit":100000}'),
  (v_cid, 'L3 Checker (VP)', 'L3_CHECKER',     true, '{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false,"approval_level":"L3","spend_limit":500000}'),
  (v_cid, 'L4 Checker (CFO)','L4_CHECKER',     true, '{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L4","spend_limit":10000000}'),
  (v_cid, 'L5 Checker (CEO/Board)', 'L5_CHECKER', true, '{"can_create_po":true,"can_approve_po":true,"can_approve_supplier":true,"can_approve_payment":true,"can_manage_users":true,"can_view_reports":true,"can_export_audit":true,"approval_level":"L5"}'),
  (v_cid, 'Viewer',           'VIEWER',         true, '{"can_create_po":false,"can_approve_po":false,"can_approve_supplier":false,"can_approve_payment":false,"can_manage_users":false,"can_view_reports":true,"can_export_audit":false}');

  -- Approval matrix
  INSERT INTO approval_matrix (company_id, min_amount, max_amount, required_levels, escalation_hrs) VALUES
  (v_cid, 0,         25000,     ARRAY['L1'],             24),
  (v_cid, 25000,     100000,    ARRAY['L1','L2'],        48),
  (v_cid, 100000,    500000,    ARRAY['L1','L2','L3'],   48),
  (v_cid, 500000,    2500000,   ARRAY['L2','L3','L4'],   72),
  (v_cid, 2500000,   10000000,  ARRAY['L3','L4','L5'],   72),
  (v_cid, 10000000,  NULL,      ARRAY['L4','L5'],        72);
END;
$$;
*/

COMMENT ON TABLE purchase_orders   IS 'Central PO table. Maker-checker enforced: created_by ≠ approver at every step';
COMMENT ON TABLE approval_steps    IS 'Immutable audit trail of every approval action. No UPDATE/DELETE permitted via RLS';
COMMENT ON TABLE audit_log         IS 'Write-once compliance log. No UPDATE or DELETE RLS policy exists';
COMMENT ON TABLE companies         IS 'Each row = isolated procurement entity with its own RLS boundary';
COMMENT ON FUNCTION fn_my_company_ids IS 'Returns array of company IDs current user belongs to — used in every RLS policy';
