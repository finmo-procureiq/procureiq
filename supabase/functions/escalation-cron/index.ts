// supabase/functions/escalation-cron/index.ts
// Runs every hour via Supabase Cron (pg_cron).
// Escalates overdue approval steps and queues reminder emails.
// Deploy: supabase functions deploy escalation-cron

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
    const now = new Date().toISOString()

    // ── Find all overdue pending steps ───────────────────────────
    const { data: overdueSteps, error } = await supabase
      .from('approval_steps')
      .select(`
        *,
        po:purchase_orders(id, po_number, company_id, amount, currency, created_by, priority),
        company:companies(id, name, code)
      `)
      .eq('action', 'pending')
      .lt('due_at', now)
      .is('escalated_at', null)

    if (error) throw error
    if (!overdueSteps?.length) {
      return new Response(JSON.stringify({ escalated: 0 }), { status: 200 })
    }

    let escalatedCount = 0

    for (const step of overdueSteps) {
      const po = step.po as any
      const company = step.company as any

      // Mark step as escalated
      await supabase.from('approval_steps').update({
        action: 'escalated',
        escalated_at: now,
      }).eq('id', step.id)

      // Find next level checkers to notify
      const nextLevel = step.level === 'L1' ? 'L2'
                      : step.level === 'L2' ? 'L3'
                      : step.level === 'L3' ? 'L4'
                      : step.level === 'L4' ? 'L5'
                      : step.level // L5 → stays at L5, notify admin

      // Get checkers at the escalation level
      const { data: checkers } = await supabase
        .from('company_members')
        .select('user_id, user:user_profiles(full_name, email)')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .eq('role_id',
          // Get role with this approval level
          supabase.from('roles').select('id')
            .eq('company_id', company.id)
            .eq(`permissions->>'approval_level'`, nextLevel)
            .limit(1)
        )

      // Queue escalation emails
      for (const checker of (checkers || [])) {
        const user = (checker as any).user

        await supabase.from('email_queue').insert({
          company_id: company.id,
          to_email: user.email,
          to_name: user.full_name,
          template: 'escalation_alert',
          subject: `[ESCALATED] ${po.po_number} — Approval overdue by ${company.name}`,
          variables: {
            approver_name: user.full_name,
            po_number: po.po_number,
            amount: `${po.currency} ${po.amount?.toLocaleString()}`,
            original_level: step.level,
            escalated_to: nextLevel,
            company_name: company.name,
            action_url: `${Deno.env.get('APP_URL')}/approvals/${po.id}`,
          }
        })

        // In-app notification
        await supabase.from('notifications').insert({
          company_id: company.id,
          user_id: checker.user_id,
          title: `Escalated: ${po.po_number} overdue`,
          body: `${step.level} approval expired. Escalated to ${nextLevel}.`,
          type: 'warning',
          action_url: `/approvals/${po.id}`,
          action_label: 'Review Now',
          entity_type: 'purchase_order',
          entity_id: po.id,
        })
      }

      // Audit log the escalation
      await supabase.from('audit_log').insert({
        company_id: company.id,
        company_name: company.name,
        user_id: null,
        user_name: 'System (Auto-Escalation)',
        user_email: 'system@procureiq',
        action: 'ESCALATE',
        entity_type: 'approval_step',
        entity_id: step.id,
        entity_ref: po.po_number,
        new_values: {
          from_level: step.level,
          to_level: nextLevel,
          reason: 'Approval deadline exceeded',
          due_at: step.due_at,
        },
        severity: po.priority === 'emergency' ? 'critical' : 'warning',
      })

      escalatedCount++
    }

    // ── Also flag overdue payments ────────────────────────────────
    const { data: overduePayments } = await supabase
      .from('payments')
      .select('id, invoice_number, company_id, net_amount, currency, supplier_id')
      .lt('due_date', new Date().toISOString().split('T')[0])
      .in('status', ['pending', 'pending_approval', 'approved'])

    for (const payment of (overduePayments || [])) {
      await supabase.from('payments').update({ status: 'overdue' }).eq('id', payment.id)

      await supabase.from('audit_log').insert({
        company_id: payment.company_id,
        user_name: 'System (Auto)',
        user_email: 'system@procureiq',
        action: 'AUTO_OVERDUE',
        entity_type: 'payment',
        entity_id: payment.id,
        entity_ref: payment.invoice_number,
        severity: 'warning',
      })
    }

    return new Response(
      JSON.stringify({ escalated: escalatedCount, overdue_payments: overduePayments?.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Escalation cron error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
