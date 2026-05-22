'use server'
// lib/actions/po.ts — Purchase Order server actions
// Every function: authenticate → authorise → act → audit → notify

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { writeAudit, createNotification, queueEmail } from '@/lib/actions/shared'

// ── Validation schemas ─────────────────────────────────────────
const CreatePOSchema = z.object({
  company_id:    z.string().uuid(),
  supplier_id:   z.string().uuid(),
  category:      z.string().min(1),
  description:   z.string().min(10, 'Description must be at least 10 characters'),
  amount:        z.number().positive('Amount must be positive'),
  currency:      z.string().default('INR'),
  tax_rate:      z.number().min(0).max(100).default(18),
  priority:      z.enum(['low','normal','high','urgent','emergency']).default('normal'),
  required_by:   z.string().optional(),
  cost_center:   z.string().optional(),
  project_code:  z.string().optional(),
  notes:         z.string().optional(),
})

// ── Helper: get current user + their permissions in a company ──
async function getAuthedUser(company_id: string) {
  const supabase = createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')

  const { data: member } = await supabase
    .from('company_members')
    .select('*, role:roles(code, permissions), user:user_profiles(*)')
    .eq('company_id', company_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) return { error: 'You are not a member of this company', user: null, member: null }

  const perms = (member.role as any)?.permissions || {}
  return { user, member, perms, supabase }
}

// ── CREATE PO ──────────────────────────────────────────────────
export async function createPurchaseOrder(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  const parsed = CreatePOSchema.safeParse({
    ...raw,
    amount: parseFloat(raw.amount as string),
    tax_rate: parseFloat(raw.tax_rate as string || '18'),
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const data = parsed.data
  const auth = await getAuthedUser(data.company_id)
  if (auth.error || !auth.user) return { error: auth.error || 'Unauthenticated' }

  const { user, member, perms, supabase } = auth as any

  // ── AUTHORISATION: Maker check ─────────────────────────────
  if (!perms.can_create_po) {
    return { error: 'Your role does not permit creating Purchase Orders' }
  }

  // ── BUDGET CHECK ────────────────────────────────────────────
  const currentFY = getCurrentFiscalYear()
  const { data: budgetCheck } = await supabase.rpc('fn_check_budget', {
    p_company_id: data.company_id,
    p_category: data.category,
    p_fiscal_year: currentFY,
    p_amount: data.amount,
  })

  if (budgetCheck?.status === 'freeze') {
    return {
      error: `Budget frozen for ${data.category}: ${budgetCheck.utilization_pct}% utilised. Contact admin.`,
      budget: budgetCheck,
    }
  }

  // ── SUPPLIER VALIDATION: must be approved ──────────────────
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('id, status, name, blacklist_reason')
    .eq('id', data.supplier_id)
    .single()

  if (!supplier) return { error: 'Supplier not found' }
  if (supplier.status === 'blacklisted') {
    return { error: `Supplier "${supplier.name}" is blacklisted: ${supplier.blacklist_reason}` }
  }
  if (supplier.status !== 'approved') {
    return { error: `Supplier "${supplier.name}" must be approved before raising a PO` }
  }

  // ── CREATE ────────────────────────────────────────────────
  const taxAmount = (data.amount * (data.tax_rate / 100))
  const poNumber = await supabase.rpc('fn_generate_po_number', { p_company_id: data.company_id })

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      company_id:   data.company_id,
      po_number:    poNumber.data,
      supplier_id:  data.supplier_id,
      category:     data.category,
      description:  data.description,
      amount:       data.amount,
      currency:     data.currency,
      tax_rate:     data.tax_rate,
      tax_amount:   taxAmount,
      priority:     data.priority,
      required_by:  data.required_by || null,
      cost_center:  data.cost_center,
      project_code: data.project_code,
      notes:        data.notes,
      status:       'draft',
      created_by:   user.id,
    })
    .select()
    .single()

  if (poError) return { error: poError.message }

  // Auto-submit if requested
  if (formData.get('submit_now') === '1') {
    const submitResult = await submitPOForApproval(po.id, data.company_id)
    if (submitResult.error) return { error: submitResult.error, po }
  }

  await writeAudit(supabase, {
    company_id:   data.company_id,
    user:         { id: user.id, name: (member.user as any).full_name, email: user.email, role: (member.role as any).code },
    action:       'CREATE',
    entity_type:  'purchase_order',
    entity_id:    po.id,
    entity_ref:   po.po_number,
    new_values:   { amount: data.amount, supplier: supplier.name, category: data.category, status: 'draft' },
    budget_status: budgetCheck,
  })

  revalidatePath('/purchase-orders')
  return { data: po, budget_warning: budgetCheck?.status === 'warn' ? budgetCheck : null }
}

// ── SUBMIT FOR APPROVAL ────────────────────────────────────────
export async function submitPOForApproval(po_id: string, company_id: string) {
  const auth = await getAuthedUser(company_id)
  if (auth.error || !auth.user) return { error: auth.error || 'Unauthenticated' }
  const { user, member, supabase } = auth as any

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('*, supplier:suppliers(name), company:companies(name, code)')
    .eq('id', po_id).single()

  if (!po) return { error: 'PO not found' }

  // ── MAKER-CHECKER: only the maker can submit ───────────────
  if (po.created_by !== user.id) {
    return { error: 'Only the PO creator (maker) can submit for approval' }
  }
  if (po.status !== 'draft') {
    return { error: `Cannot submit PO in status: ${po.status}` }
  }

  // Create steps (triggers built-in matrix lookup + step creation)
  const { error: stepError } = await supabase.rpc('fn_create_approval_steps', { p_po_id: po_id })
  if (stepError) return { error: `Approval setup failed: ${stepError.message}` }

  // Reload PO to get new status
  const { data: updatedPO } = await supabase
    .from('purchase_orders').select('current_level').eq('id', po_id).single()

  const currentLevel = updatedPO?.current_level || 'L1'

  // Find checkers at the first level and notify them
  const { data: levelCheckers } = await supabase
    .from('company_members')
    .select('user_id, spend_limit, user:user_profiles(full_name, email), role:roles(permissions)')
    .eq('company_id', company_id)
    .eq('is_active', true)

  const eligibleCheckers = (levelCheckers || []).filter((cm: any) => {
    const perms = cm.role?.permissions || {}
    return perms.can_approve_po && perms.approval_level === currentLevel
  })

  for (const checker of eligibleCheckers) {
    const checkerUser = (checker as any).user

    await createNotification(supabase, {
      company_id,
      user_id: checker.user_id,
      title: `New PO Awaiting Your Approval (${currentLevel})`,
      body: `${po.po_number} · ${(po.supplier as any)?.name} · ${po.currency} ${Number(po.amount).toLocaleString()}`,
      type: 'warning',
      action_url: `/approvals/${po_id}`,
      action_label: 'Review & Approve',
      entity_type: 'purchase_order',
      entity_id: po_id,
    })

    await queueEmail(supabase, {
      company_id,
      to_email: checkerUser.email,
      to_name: checkerUser.full_name,
      template: 'approval_request',
      subject: `[Action Required] ${po.po_number} — ${po.currency} ${Number(po.amount).toLocaleString()} awaiting your approval`,
      variables: {
        approver_name: checkerUser.full_name,
        maker_name: (member.user as any).full_name,
        po_number: po.po_number,
        supplier_name: (po.supplier as any)?.name,
        amount: `${po.currency} ${Number(po.amount).toLocaleString()}`,
        category: po.category,
        description: po.description,
        priority: po.priority,
        required_by: po.required_by || 'Not specified',
        level: currentLevel,
        company_name: (po.company as any)?.name,
        action_url: `${process.env.NEXT_PUBLIC_APP_URL}/approvals/${po_id}`,
      }
    })
  }

  await writeAudit(supabase, {
    company_id,
    user: { id: user.id, name: (member.user as any).full_name, email: user.email, role: (member.role as any).code },
    action: 'SUBMIT',
    entity_type: 'purchase_order',
    entity_id: po_id,
    entity_ref: po.po_number,
    old_values: { status: 'draft' },
    new_values: { status: `pending_${currentLevel.toLowerCase()}`, current_level: currentLevel },
  })

  revalidatePath('/purchase-orders')
  revalidatePath('/approvals')
  return { success: true }
}

// ── APPROVE PO (Checker action) ────────────────────────────────
export async function approvePOStep(params: {
  po_id: string
  step_id: string
  company_id: string
  comments?: string
}) {
  const auth = await getAuthedUser(params.company_id)
  if (auth.error || !auth.user) return { error: auth.error || 'Unauthenticated' }
  const { user, member, perms, supabase } = auth as any

  // ── AUTHORISATION ──────────────────────────────────────────
  if (!perms.can_approve_po) {
    return { error: 'Your role does not have approval authority' }
  }

  const [{ data: po }, { data: step }] = await Promise.all([
    supabase.from('purchase_orders').select('*, supplier:suppliers(name), company:companies(name)').eq('id', params.po_id).single(),
    supabase.from('approval_steps').select('*').eq('id', params.step_id).single(),
  ])

  if (!po || !step) return { error: 'Record not found' }

  // ── MAKER-CHECKER RULE — enforced here (+ DB constraint) ───
  if (po.created_by === user.id) {
    await writeAudit(supabase, {
      company_id: params.company_id,
      user: { id: user.id, name: (member.user as any).full_name, email: user.email, role: (member.role as any).code },
      action: 'BLOCKED_SELF_APPROVAL',
      entity_type: 'purchase_order',
      entity_id: params.po_id,
      entity_ref: po.po_number,
      severity: 'critical',
      new_values: { attempted_by: user.id, rule: 'MAKER_CHECKER_VIOLATION' },
    })
    return { error: 'MAKER-CHECKER VIOLATION: You cannot approve a PO you created' }
  }

  // ── LEVEL CHECK ────────────────────────────────────────────
  if (perms.approval_level && perms.approval_level !== step.level) {
    if (!['admin','super_admin'].some((r: string) => (member.role as any).code.includes(r.toUpperCase()))) {
      return { error: `You are a ${perms.approval_level} approver. This step requires ${step.level}` }
    }
  }

  // ── SPEND LIMIT CHECK ──────────────────────────────────────
  const effectiveLimit = member.spend_limit ?? perms.spend_limit
  if (effectiveLimit && po.amount > effectiveLimit) {
    return { error: `Amount ${po.currency} ${po.amount.toLocaleString()} exceeds your approval limit of ${po.currency} ${effectiveLimit.toLocaleString()}` }
  }

  // ── ACT ────────────────────────────────────────────────────
  await supabase.from('approval_steps').update({
    action: 'approved',
    acted_by: user.id,
    comments: params.comments,
    acted_at: new Date().toISOString(),
  }).eq('id', params.step_id)

  // Find next pending step
  const { data: nextStep } = await supabase
    .from('approval_steps')
    .select('*')
    .eq('po_id', params.po_id)
    .eq('action', 'pending')
    .order('step_number')
    .limit(1)
    .maybeSingle()

  let newStatus: string
  let isFinal = false

  if (nextStep) {
    // Advance to next level
    newStatus = `pending_${nextStep.level.toLowerCase()}`
    await supabase.from('purchase_orders').update({
      status: newStatus as any,
      current_level: nextStep.level,
    }).eq('id', params.po_id)

    // Notify next level checkers
    const { data: nextCheckers } = await supabase
      .from('company_members')
      .select('user_id, user:user_profiles(full_name, email), role:roles(permissions)')
      .eq('company_id', params.company_id).eq('is_active', true)

    for (const checker of (nextCheckers || []).filter((cm: any) =>
      cm.role?.permissions?.can_approve_po && cm.role?.permissions?.approval_level === nextStep.level
    )) {
      const cu = (checker as any).user
      await createNotification(supabase, {
        company_id: params.company_id,
        user_id: checker.user_id,
        title: `PO Advanced to ${nextStep.level} — Your Approval Needed`,
        body: `${po.po_number} · ${(po.supplier as any)?.name} · ${po.currency} ${Number(po.amount).toLocaleString()}`,
        type: 'warning',
        action_url: `/approvals/${params.po_id}`,
        action_label: 'Approve Now',
        entity_type: 'purchase_order',
        entity_id: params.po_id,
      })
      await queueEmail(supabase, {
        company_id: params.company_id,
        to_email: cu.email, to_name: cu.full_name,
        template: 'approval_request',
        subject: `[${nextStep.level} Approval] ${po.po_number} awaiting you`,
        variables: { approver_name: cu.full_name, po_number: po.po_number, amount: `${po.currency} ${Number(po.amount).toLocaleString()}`, level: nextStep.level, action_url: `${process.env.NEXT_PUBLIC_APP_URL}/approvals/${params.po_id}` },
      })
    }
  } else {
    // ── FULLY APPROVED ────────────────────────────────────────
    isFinal = true
    newStatus = 'approved'
    await supabase.from('purchase_orders').update({
      status: 'approved',
      final_action: 'approved',
      final_action_by: user.id,
      final_action_at: new Date().toISOString(),
      current_level: null,
    }).eq('id', params.po_id)

    // Notify maker
    const { data: makerProfile } = await supabase
      .from('user_profiles').select('full_name, email').eq('id', po.created_by).single()

    if (makerProfile) {
      await createNotification(supabase, {
        company_id: params.company_id,
        user_id: po.created_by,
        title: `✅ PO Fully Approved`,
        body: `${po.po_number} has been approved at all levels. You may proceed with the purchase.`,
        type: 'success',
        action_url: `/purchase-orders/${params.po_id}`,
        entity_type: 'purchase_order',
        entity_id: params.po_id,
      })
      await queueEmail(supabase, {
        company_id: params.company_id,
        to_email: makerProfile.email, to_name: makerProfile.full_name,
        template: 'po_approved',
        subject: `✅ ${po.po_number} Approved — ${po.currency} ${Number(po.amount).toLocaleString()}`,
        variables: {
          maker_name: makerProfile.full_name,
          po_number: po.po_number,
          supplier_name: (po.supplier as any)?.name,
          amount: `${po.currency} ${Number(po.amount).toLocaleString()}`,
          approver_name: (member.user as any).full_name,
          company_name: (po.company as any)?.name,
          action_url: `${process.env.NEXT_PUBLIC_APP_URL}/purchase-orders/${params.po_id}`,
        }
      })
    }
  }

  await writeAudit(supabase, {
    company_id: params.company_id,
    user: { id: user.id, name: (member.user as any).full_name, email: user.email, role: (member.role as any).code },
    action: 'APPROVE',
    entity_type: 'purchase_order',
    entity_id: params.po_id,
    entity_ref: po.po_number,
    old_values: { status: po.status, level: step.level },
    new_values: { status: newStatus, final: isFinal, comments: params.comments },
    severity: 'info',
  })

  revalidatePath('/purchase-orders')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  return { success: true, finalApproval: isFinal }
}

// ── REJECT PO ──────────────────────────────────────────────────
export async function rejectPOStep(params: {
  po_id: string
  step_id: string
  company_id: string
  reason: string
}) {
  if (!params.reason?.trim()) return { error: 'Rejection reason is required' }

  const auth = await getAuthedUser(params.company_id)
  if (auth.error || !auth.user) return { error: auth.error || 'Unauthenticated' }
  const { user, member, perms, supabase } = auth as any

  if (!perms.can_approve_po) return { error: 'No approval authority' }

  const { data: po } = await supabase
    .from('purchase_orders').select('*, supplier:suppliers(name)').eq('id', params.po_id).single()
  if (!po) return { error: 'PO not found' }

  // ── MAKER-CHECKER ──────────────────────────────────────────
  if (po.created_by === user.id) return { error: 'You cannot reject your own PO' }

  const now = new Date().toISOString()

  // Mark this and all subsequent steps as rejected
  await supabase.from('approval_steps').update({
    action: 'rejected', acted_by: user.id,
    comments: params.reason, acted_at: now,
  }).eq('id', params.step_id)

  await supabase.from('approval_steps').update({ action: 'rejected', acted_at: now })
    .eq('po_id', params.po_id).eq('action', 'pending')

  await supabase.from('purchase_orders').update({
    status: 'rejected',
    final_action: 'rejected',
    final_action_by: user.id,
    final_action_at: now,
    rejection_reason: params.reason,
    current_level: null,
  }).eq('id', params.po_id)

  // Notify maker
  const { data: makerProfile } = await supabase
    .from('user_profiles').select('full_name, email').eq('id', po.created_by).single()

  if (makerProfile) {
    await createNotification(supabase, {
      company_id: params.company_id,
      user_id: po.created_by,
      title: `❌ PO Rejected`,
      body: `${po.po_number} was rejected. Reason: ${params.reason}`,
      type: 'error',
      action_url: `/purchase-orders/${params.po_id}`,
      entity_type: 'purchase_order',
      entity_id: params.po_id,
    })
    await queueEmail(supabase, {
      company_id: params.company_id,
      to_email: makerProfile.email, to_name: makerProfile.full_name,
      template: 'po_rejected',
      subject: `❌ ${po.po_number} Rejected`,
      variables: {
        maker_name: makerProfile.full_name,
        po_number: po.po_number,
        reason: params.reason,
        reviewer_name: (member.user as any).full_name,
        action_url: `${process.env.NEXT_PUBLIC_APP_URL}/purchase-orders/${params.po_id}`,
      }
    })
  }

  await writeAudit(supabase, {
    company_id: params.company_id,
    user: { id: user.id, name: (member.user as any).full_name, email: user.email, role: (member.role as any).code },
    action: 'REJECT', entity_type: 'purchase_order',
    entity_id: params.po_id, entity_ref: po.po_number,
    new_values: { reason: params.reason, status: 'rejected' },
    severity: 'warning',
  })

  revalidatePath('/purchase-orders')
  revalidatePath('/approvals')
  return { success: true }
}

// ── RECALL PO (Maker withdraws before final approval) ─────────
export async function recallPO(po_id: string, reason: string, company_id: string) {
  const auth = await getAuthedUser(company_id)
  if (auth.error || !auth.user) return { error: auth.error || 'Unauthenticated' }
  const { user, member, supabase } = auth as any

  const { data: po } = await supabase
    .from('purchase_orders').select('*').eq('id', po_id).single()
  if (!po) return { error: 'Not found' }

  if (po.created_by !== user.id) return { error: 'Only the maker can recall this PO' }

  const recallableStatuses = ['submitted','pending_l1','pending_l2','pending_l3']
  if (!recallableStatuses.includes(po.status)) {
    return { error: `Cannot recall a PO in ${po.status} status` }
  }

  await supabase.from('approval_steps').update({
    action: 'recalled', acted_at: new Date().toISOString(),
  }).eq('po_id', po_id).eq('action', 'pending')

  await supabase.from('purchase_orders').update({
    status: 'recalled',
    current_level: null,
    recalled_by: user.id,
    recalled_at: new Date().toISOString(),
    recall_reason: reason,
  }).eq('id', po_id)

  await writeAudit(supabase, {
    company_id,
    user: { id: user.id, name: (member.user as any).full_name, email: user.email, role: (member.role as any).code },
    action: 'RECALL', entity_type: 'purchase_order',
    entity_id: po_id, entity_ref: po.po_number,
    new_values: { reason, status: 'recalled' },
  })

  revalidatePath('/purchase-orders')
  return { success: true }
}

// ── HELPERS ────────────────────────────────────────────────────
function getCurrentFiscalYear(): string {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  const year = now.getFullYear()
  // India: April start
  return month >= 4 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`
}
