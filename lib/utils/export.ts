// lib/utils/export.ts
// Compliance-grade export utilities
// Exports include: who exported, when, from which IP — itself audit-logged

import { format } from 'date-fns'

type ExportFormat = 'csv' | 'xlsx' | 'pdf'

export function auditLogToCSV(rows: any[]): string {
  const headers = [
    'Timestamp','Company','User Name','User Email','User Role',
    'Action','Entity Type','Entity Ref','Details','IP Address','Severity'
  ]
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      csvCell(r.created_at ? format(new Date(r.created_at), 'yyyy-MM-dd HH:mm:ss') : ''),
      csvCell(r.company_name || ''),
      csvCell(r.user_name || ''),
      csvCell(r.user_email || ''),
      csvCell(r.user_role || ''),
      csvCell(r.action || ''),
      csvCell(r.entity_type || ''),
      csvCell(r.entity_ref || ''),
      csvCell(r.new_values ? JSON.stringify(r.new_values) : ''),
      csvCell(r.ip_address || ''),
      csvCell(r.severity || 'info'),
    ].join(','))
  ]
  return lines.join('\n')
}

export function poListToCSV(rows: any[]): string {
  const headers = [
    'PO Number','Company','Supplier','Category','Amount','Currency',
    'Tax Amount','Total Amount','Status','Priority','Current Level',
    'Maker','Submitted At','Final Action','Final Action By','Final Action At',
    'Rejection Reason','Required By','Created At'
  ]
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      csvCell(r.po_number),
      csvCell(r.company_name),
      csvCell(r.supplier_name),
      csvCell(r.category),
      r.amount,
      csvCell(r.currency),
      r.tax_amount,
      r.total_amount,
      csvCell(r.status),
      csvCell(r.priority),
      csvCell(r.current_level || ''),
      csvCell(r.maker_name),
      csvCell(r.submitted_at ? format(new Date(r.submitted_at), 'yyyy-MM-dd') : ''),
      csvCell(r.final_action || ''),
      csvCell(r.final_approver_name || ''),
      csvCell(r.final_action_at ? format(new Date(r.final_action_at), 'yyyy-MM-dd') : ''),
      csvCell(r.rejection_reason || ''),
      csvCell(r.required_by || ''),
      csvCell(r.created_at ? format(new Date(r.created_at), 'yyyy-MM-dd') : ''),
    ].join(','))
  ]
  return lines.join('\n')
}

export function paymentListToCSV(rows: any[]): string {
  const headers = [
    'Invoice Number','Supplier','PO Number','Invoice Amount','Tax','TDS',
    'Net Amount','Currency','Due Date','Paid Date','Payment Method',
    'Bank Reference','Status','Days Overdue','Created By','Approved By'
  ]
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      csvCell(r.invoice_number),
      csvCell(r.supplier_name),
      csvCell(r.po_number || ''),
      r.invoice_amount, r.tax_amount, r.tds_amount, r.net_amount,
      csvCell(r.currency),
      csvCell(r.due_date),
      csvCell(r.paid_date || ''),
      csvCell(r.payment_method || ''),
      csvCell(r.bank_ref || ''),
      csvCell(r.status),
      r.days_overdue || 0,
      csvCell(r.created_by_name || ''),
      csvCell(r.approved_by_name || ''),
    ].join(','))
  ]
  return lines.join('\n')
}

export function budgetToCSV(rows: any[]): string {
  const headers = [
    'Fiscal Year','Category','Allocated','Committed','Paid',
    'Remaining','Utilization %','Status','Currency'
  ]
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      csvCell(r.fiscal_year),
      csvCell(r.category),
      r.allocated, r.committed, r.paid, r.remaining,
      r.utilization_pct + '%',
      csvCell(r.budget_status),
      csvCell(r.currency),
    ].join(','))
  ]
  return lines.join('\n')
}

function csvCell(val: string): string {
  if (!val) return ''
  // Escape double quotes, wrap in quotes if contains comma/newline
  const escaped = String(val).replace(/"/g, '""')
  return /[,"\n]/.test(escaped) ? `"${escaped}"` : escaped
}

export function generateExportFilename(entity: string, format: string, companyCode?: string): string {
  const ts = format === 'csv'
    ? new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    : format
  return `ProcureIQ_${companyCode ? companyCode + '_' : ''}${entity}_${new Date().toISOString().slice(0,10)}.${format}`
}
