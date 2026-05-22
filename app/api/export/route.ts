// app/api/export/route.ts
// Secure export endpoint — auth-gated, permission-checked, self-audited
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/actions/shared'
import {
  auditLogToCSV, poListToCSV,
  paymentListToCSV, budgetToCSV
} from '@/lib/utils/export'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entity     = searchParams.get('entity')      // audit|po|payments|budget
  const company_id = searchParams.get('company_id')
  const format     = searchParams.get('format') || 'csv'
  const date_from  = searchParams.get('date_from')
  const date_to    = searchParams.get('date_to')
  const status     = searchParams.get('status')

  if (!entity || !company_id) {
    return NextResponse.json({ error: 'entity and company_id are required' }, { status: 400 })
  }

  // Permission check
  const { data: permsData } = await supabase.rpc('fn_my_permissions', { p_company_id: company_id })
  const perms = permsData || {}

  if (entity === 'audit' && !perms.can_export_audit) {
    return NextResponse.json({ error: 'Insufficient permissions to export audit log' }, { status: 403 })
  }
  if (!perms.can_view_reports) {
    return NextResponse.json({ error: 'Insufficient permissions to export reports' }, { status: 403 })
  }

  // Get user profile for audit logging
  const { data: profile } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).single()

  let csvData = ''
  let filename = ''

  if (entity === 'audit') {
    let query = supabase.from('audit_log').select('*').eq('company_id', company_id).order('created_at', { ascending: false })
    if (date_from) query = query.gte('created_at', date_from)
    if (date_to)   query = query.lte('created_at', date_to + 'T23:59:59Z')
    const { data: rows } = await query.limit(10000)
    csvData  = auditLogToCSV(rows || [])
    filename = `ProcureIQ_AuditLog_${company_id.slice(0,8)}_${new Date().toISOString().slice(0,10)}.csv`
  }
  else if (entity === 'po') {
    let query = supabase.from('v_po_summary').select('*').eq('company_id', company_id).order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    if (date_from) query = query.gte('created_at', date_from)
    if (date_to)   query = query.lte('created_at', date_to + 'T23:59:59Z')
    const { data: rows } = await query.limit(10000)
    csvData  = poListToCSV(rows || [])
    filename = `ProcureIQ_PurchaseOrders_${new Date().toISOString().slice(0,10)}.csv`
  }
  else if (entity === 'payments') {
    let query = supabase.from('v_payment_summary').select('*').eq('company_id', company_id).order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    if (date_from) query = query.gte('created_at', date_from)
    const { data: rows } = await query.limit(10000)
    csvData  = paymentListToCSV(rows || [])
    filename = `ProcureIQ_Payments_${new Date().toISOString().slice(0,10)}.csv`
  }
  else if (entity === 'budget') {
    const { data: rows } = await supabase.from('v_budget_utilization').select('*').eq('company_id', company_id)
    csvData  = budgetToCSV(rows || [])
    filename = `ProcureIQ_Budget_${new Date().toISOString().slice(0,10)}.csv`
  }
  else {
    return NextResponse.json({ error: 'Unknown entity' }, { status: 400 })
  }

  // Audit the export itself (compliance requirement)
  await writeAudit(supabase, {
    company_id,
    user: { id: user.id, name: profile?.full_name || user.email!, email: user.email! },
    action: 'EXPORT',
    entity_type: entity,
    entity_ref: `${entity.toUpperCase()}_EXPORT`,
    new_values: {
      format, rows_exported: csvData.split('\n').length - 1,
      date_from, date_to, status,
      ip: req.headers.get('x-forwarded-for') || 'unknown',
    },
    severity: 'warning', // exports are always flagged
  })

  return new NextResponse(csvData, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  })
}
