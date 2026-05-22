'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { getActiveCompanyId } from '@/lib/company'

export default function ReportsPage() {
  const [companyId, setCompanyId] = useState('')
  const [companyCode, setCompanyCode] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const cid = await getActiveCompanyId()
    setCompanyId(cid)
    const { data } = await supabase.from('companies').select('code').eq('id', cid).single()
    if (data) setCompanyCode(data.code)
  }

  function toCSV(headers: string[], rows: any[][]): string {
    const escape = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return /[,"\n]/.test(s) ? `"${s}"` : s
    }
    return [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
  }

  function downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function downloadExcel(headers: string[], rows: any[][], filename: string) {
    const table = `<table><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</table>`
    const blob = new Blob([`<html><body>${table}</body></html>`], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function downloadPDF(title: string, headers: string[], rows: any[][]) {
    const w = window.open('', '_blank')
    if (!w) return
    const tableRows = rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body{font-family:sans-serif;padding:32px;font-size:13px;color:#1c1917}
      h1{font-size:20px;margin-bottom:4px}
      .sub{color:#6b7280;font-size:12px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse}
      th{background:#f9fafb;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #e5e7eb;color:#6b7280}
      td{padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px}
      tr:nth-child(even) td{background:#f9fafb}
      .footer{margin-top:24px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px}
    </style></head><body>
    <h1>ProcureIQ — ${title}</h1>
    <div class="sub">Generated: ${new Date().toLocaleString()} · Entity: ${companyCode}</div>
    <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody></table>
    <div class="footer">ProcureIQ Enterprise · Confidential · ${companyCode}</div>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`)
    w.document.close()
  }

  async function exportPurchaseOrders(format: string) {
    setLoading('po-' + format)
    let query = supabase.from('purchase_orders')
      .select('*, supplier:suppliers(name), maker:user_profiles!created_by(full_name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z')
    const { data } = await query
    const headers = ['PO Number','Supplier','Category','Amount','Currency','GST Rate','Tax','Total','Status','Priority','Maker','Submitted','Final Action','Date']
    const rows = (data || []).map(p => [
      p.po_number, (p.supplier as any)?.name, p.category,
      p.amount, p.currency, `${p.tax_rate}%`, p.tax_amount, p.total_amount,
      p.status, p.priority, (p.maker as any)?.full_name,
      p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '',
      p.final_action || '', new Date(p.created_at).toLocaleDateString()
    ])
    const filename = `ProcureIQ_PO_${companyCode}_${new Date().toISOString().slice(0,10)}`
    if (format === 'csv') downloadCSV(toCSV(headers, rows), filename + '.csv')
    else if (format === 'excel') downloadExcel(headers, rows, filename + '.xls')
    else downloadPDF('Purchase Orders', headers, rows)
    setLoading(null)
  }

  async function exportPayments(format: string) {
    setLoading('pay-' + format)
    let query = supabase.from('payments')
      .select('*, supplier:suppliers(name), po:purchase_orders(po_number)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z')
    const { data } = await query
    const headers = ['Invoice #','Supplier','PO Ref','Invoice Amount','Tax','TDS','Net Amount','Currency','Due Date','Paid Date','Method','Bank Ref','Status']
    const rows = (data || []).map(p => [
      p.invoice_number, (p.supplier as any)?.name, (p.po as any)?.po_number || '',
      p.invoice_amount, p.tax_amount, p.tds_amount, p.net_amount,
      p.currency, p.due_date, p.paid_date || '', p.payment_method || '',
      p.bank_ref || '', p.status
    ])
    const filename = `ProcureIQ_Payments_${companyCode}_${new Date().toISOString().slice(0,10)}`
    if (format === 'csv') downloadCSV(toCSV(headers, rows), filename + '.csv')
    else if (format === 'excel') downloadExcel(headers, rows, filename + '.xls')
    else downloadPDF('Payments', headers, rows)
    setLoading(null)
  }

  async function exportSuppliers(format: string) {
    setLoading('sup-' + format)
    const { data } = await supabase.from('suppliers')
      .select('*').eq('company_id', companyId)
      .order('created_at', { ascending: false })
    const headers = ['Name','Category','Status','GSTIN','Contact','Email','Phone','Payment Terms','Credit Limit','Risk Score','Created']
    const rows = (data || []).map(s => [
      s.name, s.category, s.status, s.gstin || '',
      s.contact_name || '', s.email || '', s.phone || '',
      `Net ${s.payment_terms}`, s.credit_limit || '', s.risk_score,
      new Date(s.created_at).toLocaleDateString()
    ])
    const filename = `ProcureIQ_Suppliers_${companyCode}_${new Date().toISOString().slice(0,10)}`
    if (format === 'csv') downloadCSV(toCSV(headers, rows), filename + '.csv')
    else if (format === 'excel') downloadExcel(headers, rows, filename + '.xls')
    else downloadPDF('Suppliers', headers, rows)
    setLoading(null)
  }

  async function exportAudit(format: string) {
    setLoading('audit-' + format)
    let query = supabase.from('audit_log')
      .select('*').eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z')
    const { data } = await query
    const headers = ['Timestamp','User','Email','Action','Entity Type','Entity Ref','Details','Severity']
    const rows = (data || []).map(r => [
      new Date(r.created_at).toLocaleString(),
      r.user_name, r.user_email, r.action,
      r.entity_type, r.entity_ref || '',
      r.new_values ? JSON.stringify(r.new_values) : '',
      r.severity
    ])
    const filename = `ProcureIQ_Audit_${companyCode}_${new Date().toISOString().slice(0,10)}`
    if (format === 'csv') downloadCSV(toCSV(headers, rows), filename + '.csv')
    else if (format === 'excel') downloadExcel(headers, rows, filename + '.xls')
    else downloadPDF('Audit Trail', headers, rows)
    setLoading(null)
  }

  async function exportBudget(format: string) {
    setLoading('budget-' + format)
    const { data: budgets } = await supabase.from('budgets')
      .select('*').eq('company_id', companyId)
    const { data: pos } = await supabase.from('purchase_orders')
      .select('category, total_amount, status')
      .eq('company_id', companyId)
      .not('status', 'in', '(rejected,cancelled,recalled)')
    const rows = (budgets || []).map(b => {
      const spent = (pos || [])
        .filter(p => p.category === b.category)
        .reduce((sum, p) => sum + Number(p.total_amount), 0)
      const pct = b.allocated > 0 ? Math.round(spent / b.allocated * 100) : 0
      return [
        b.fiscal_year, b.category,
        b.allocated, spent,
        b.allocated - spent,
        pct + '%',
        pct >= 95 ? 'FREEZE' : pct >= 80 ? 'WARNING' : 'OK',
        b.currency
      ]
    })
    const headers = ['Fiscal Year','Category','Allocated','Spent','Remaining','Utilization %','Status','Currency']
    const filename = `ProcureIQ_Budget_${companyCode}_${new Date().toISOString().slice(0,10)}`
    if (format === 'csv') downloadCSV(toCSV(headers, rows), filename + '.csv')
    else if (format === 'excel') downloadExcel(headers, rows, filename + '.xls')
    else downloadPDF('Budget Utilisation', headers, rows)
    setLoading(null)
  }

  const reports = [
    { id:'po', title:'Purchase Orders', icon:'📋', desc:'All POs with status, amounts, suppliers and approvers', fn:exportPurchaseOrders },
    { id:'pay', title:'Payments', icon:'💳', desc:'Invoice and payment records with UTR references', fn:exportPayments },
    { id:'sup', title:'Suppliers', icon:'🏢', desc:'Full vendor list with risk scores and bank details', fn:exportSuppliers },
    { id:'audit', title:'Audit Trail', icon:'🔒', desc:'Complete tamper-proof compliance log of all actions', fn:exportAudit },
    { id:'budget', title:'Budget Utilisation', icon:'📊', desc:'Spend vs allocated by category with status', fn:exportBudget },
  ]

  const btnStyle = (id: string, fmt: string): React.CSSProperties => ({
    flex:1, padding:'8px 4px', border:'1px solid #e5e7eb',
    borderRadius:'8px', background:loading===`${id}-${fmt}`?'#f3f4f6':'#f9fafb',
    fontSize:'12px', fontWeight:'500', cursor:'pointer', color:'#374151',
    display:'flex', alignItems:'center', justifyContent:'center', gap:'4px'
  })

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1200px', margin:'0 auto' }}>
      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Reports</h1>
        <p style={{ color:'#666', fontSize:'14px' }}>Download procurement data in Excel, CSV or PDF format</p>
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'20px', marginBottom:'24px' }}>
        <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'12px' }}>Date Range Filter (optional)</div>
        <div style={{ display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <label style={{ fontSize:'13px', color:'#6b7280' }}>From:</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none' }}/>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <label style={{ fontSize:'13px', color:'#6b7280' }}>To:</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none' }}/>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ padding:'6px 12px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'13px', cursor:'pointer', color:'#6b7280' }}>
              Clear
            </button>
          )}
          <span style={{ fontSize:'12px', color:'#9ca3af' }}>Leave blank to export all data</span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
        {reports.map(r => (
          <div key={r.id} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'20px' }}>
            <div style={{ fontSize:'28px', marginBottom:'10px' }}>{r.icon}</div>
            <div style={{ fontSize:'15px', fontWeight:'600', marginBottom:'4px' }}>{r.title}</div>
            <div style={{ fontSize:'13px', color:'#6b7280', marginBottom:'16px', lineHeight:'1.5' }}>{r.desc}</div>
            <div style={{ display:'flex', gap:'6px' }}>
              <button onClick={() => r.fn('excel')} disabled={!!loading} style={btnStyle(r.id,'excel')}>
                {loading===`${r.id}-excel` ? '...' : '⬇ Excel'}
              </button>
              <button onClick={() => r.fn('csv')} disabled={!!loading} style={btnStyle(r.id,'csv')}>
                {loading===`${r.id}-csv` ? '...' : '⬇ CSV'}
              </button>
              <button onClick={() => r.fn('pdf')} disabled={!!loading} style={btnStyle(r.id,'pdf')}>
                {loading===`${r.id}-pdf` ? '...' : '⬇ PDF'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}