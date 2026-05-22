'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { getActiveCompanyId } from '@/lib/company'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    activeSuppliers: 0, pendingApprovals: 0,
    monthlySpend: 0, overduePayments: 0, currency: 'INR'
  })
  const [recentPOs, setRecentPOs] = useState<any[]>([])
  const [pendingPOs, setPendingPOs] = useState<any[]>([])
  const [companyName, setCompanyName] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null|'suppliers'|'approvals'|'spend'|'overdue'>(null)
  const [modalData, setModalData] = useState<any[]>([])

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const cid = await getActiveCompanyId()
    setCompanyId(cid)
    const { data: co } = await supabase.from('companies')
      .select('name, currency').eq('id', cid).single()
    if (co) setCompanyName(co.name)
    await loadData(cid, '', '')
  }

  async function loadData(cid: string, from: string, to: string) {
    setLoading(true)
    const id = cid || companyId

    const { count: supplierCount } = await supabase.from('suppliers')
      .select('*', { count:'exact', head:true })
      .eq('company_id', id).eq('status', 'approved')

    const { count: pendingCount } = await supabase.from('purchase_orders')
      .select('*', { count:'exact', head:true })
      .eq('company_id', id)
      .in('status', ['pending_l1','pending_l2','pending_l3'])

    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0)
    const { data: spendData } = await supabase.from('purchase_orders')
      .select('total_amount')
      .eq('company_id', id).eq('status', 'approved')
      .gte('final_action_at', from || startOfMonth.toISOString())
    const totalSpend = (spendData || []).reduce((sum, p) => sum + Number(p.total_amount), 0)

    const { count: overdueCount } = await supabase.from('payments')
      .select('*', { count:'exact', head:true })
      .eq('company_id', id)
      .not('status', 'in', '(paid,cancelled)')
      .lt('due_date', new Date().toISOString().split('T')[0])

    let poQuery = supabase.from('purchase_orders')
      .select('*, supplier:suppliers(name)')
      .eq('company_id', id)
      .order('created_at', { ascending: false }).limit(5)
    if (from) poQuery = poQuery.gte('created_at', from)
    if (to) poQuery = poQuery.lte('created_at', to + 'T23:59:59Z')
    const { data: pos } = await poQuery

    const { data: pending } = await supabase.from('purchase_orders')
      .select('*, supplier:suppliers(name), maker:user_profiles!created_by(full_name)')
      .eq('company_id', id)
      .in('status', ['pending_l1','pending_l2','pending_l3'])
      .order('submitted_at', { ascending: true }).limit(5)

    const { data: co } = await supabase.from('companies')
      .select('currency').eq('id', id).single()

    setStats({
      activeSuppliers: supplierCount || 0,
      pendingApprovals: pendingCount || 0,
      monthlySpend: totalSpend,
      overduePayments: overdueCount || 0,
      currency: co?.currency || 'INR'
    })
    setRecentPOs(pos || [])
    setPendingPOs(pending || [])
    setLoading(false)
  }

  async function openModal(type: 'suppliers'|'approvals'|'spend'|'overdue') {
    setModal(type)
    const id = companyId
    if (type === 'suppliers') {
      const { data } = await supabase.from('suppliers')
        .select('*').eq('company_id', id).eq('status', 'approved')
        .order('created_at', { ascending: false })
      setModalData(data || [])
    }
    if (type === 'approvals') {
      const { data } = await supabase.from('purchase_orders')
        .select('*, supplier:suppliers(name), maker:user_profiles!created_by(full_name)')
        .eq('company_id', id)
        .in('status', ['pending_l1','pending_l2','pending_l3'])
        .order('submitted_at', { ascending: true })
      setModalData(data || [])
    }
    if (type === 'spend') {
      const startOfMonth = new Date()
      startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0)
      const { data } = await supabase.from('purchase_orders')
        .select('*, supplier:suppliers(name)')
        .eq('company_id', id).eq('status', 'approved')
        .gte('final_action_at', dateFrom || startOfMonth.toISOString())
        .order('final_action_at', { ascending: false })
      setModalData(data || [])
    }
    if (type === 'overdue') {
      const { data } = await supabase.from('payments')
        .select('*, supplier:suppliers(name)')
        .eq('company_id', id)
        .not('status', 'in', '(paid,cancelled)')
        .lt('due_date', new Date().toISOString().split('T')[0])
        .order('due_date', { ascending: true })
      setModalData(data || [])
    }
  }

  function downloadModalCSV() {
    let headers: string[] = []
    let rows: any[][] = []
    if (modal === 'suppliers') {
      headers = ['Name','Category','Contact','Email','GSTIN','Payment Terms']
      rows = modalData.map(s => [s.name, s.category, s.contact_name||'—', s.email||'—', s.gstin||'—', `Net ${s.payment_terms}`])
    }
    if (modal === 'approvals') {
      headers = ['PO Number','Supplier','Amount','Status','Requested By','Submitted']
      rows = modalData.map(p => [p.po_number, (p.supplier as any)?.name, `${p.currency} ${Number(p.total_amount).toLocaleString()}`, p.status, (p.maker as any)?.full_name||'—', p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '—'])
    }
    if (modal === 'spend') {
      headers = ['PO Number','Supplier','Amount','Category','Approved Date']
      rows = modalData.map(p => [p.po_number, (p.supplier as any)?.name, `${p.currency} ${Number(p.total_amount).toLocaleString()}`, p.category, p.final_action_at ? new Date(p.final_action_at).toLocaleDateString() : '—'])
    }
    if (modal === 'overdue') {
      headers = ['Invoice','Supplier','Amount','Due Date','Days Overdue']
      rows = modalData.map(p => {
        const days = Math.floor((new Date().getTime() - new Date(p.due_date).getTime()) / (1000*60*60*24))
        return [p.invoice_number, (p.supplier as any)?.name, `${p.currency} ${Number(p.invoice_amount).toLocaleString()}`, p.due_date, `${days} days`]
      })
    }
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ProcureIQ_${modal}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadModalPDF() {
    const w = window.open('', '_blank')
    if (!w) return
    const titles: Record<string,string> = {
      suppliers:'Active Suppliers', approvals:'Pending Approvals',
      spend:'Monthly Spend', overdue:'Overdue Payments'
    }
    let headers: string[] = []
    let rows: string[][] = []
    if (modal === 'suppliers') {
      headers = ['Name','Category','Contact','Email','GSTIN','Payment Terms']
      rows = modalData.map(s => [s.name, s.category, s.contact_name||'—', s.email||'—', s.gstin||'—', `Net ${s.payment_terms}`])
    }
    if (modal === 'approvals') {
      headers = ['PO Number','Supplier','Amount','Status','Requested By']
      rows = modalData.map(p => [p.po_number, (p.supplier as any)?.name, `${p.currency} ${Number(p.total_amount).toLocaleString()}`, p.status, (p.maker as any)?.full_name||'—'])
    }
    if (modal === 'spend') {
      headers = ['PO Number','Supplier','Amount','Category','Date']
      rows = modalData.map(p => [p.po_number, (p.supplier as any)?.name, `${p.currency} ${Number(p.total_amount).toLocaleString()}`, p.category, p.final_action_at ? new Date(p.final_action_at).toLocaleDateString() : '—'])
    }
    if (modal === 'overdue') {
      headers = ['Invoice','Supplier','Amount','Due Date','Days Overdue']
      rows = modalData.map(p => {
        const days = Math.floor((new Date().getTime() - new Date(p.due_date).getTime()) / (1000*60*60*24))
        return [p.invoice_number, (p.supplier as any)?.name, `${p.currency} ${Number(p.invoice_amount).toLocaleString()}`, p.due_date, `${days} days`]
      })
    }
    const tableRows = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>${titles[modal!]}</title>
    <style>
      body{font-family:sans-serif;padding:32px;color:#1c1917}
      h1{font-size:20px;margin-bottom:4px}
      .sub{color:#6b7280;font-size:12px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#f9fafb;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb}
      td{padding:8px 12px;border-bottom:1px solid #f3f4f6}
      .footer{margin-top:24px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px}
    </style></head><body>
    <h1>ProcureIQ — ${titles[modal!]}</h1>
    <div class="sub">${companyName} · Generated ${new Date().toLocaleString()}</div>
    <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody></table>
    <div class="footer">ProcureIQ Enterprise · Confidential</div>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`)
    w.document.close()
  }

  const statusColor: Record<string,string> = {
    draft:'#6b7280', pending_l1:'#f59e0b', pending_l2:'#f59e0b',
    pending_l3:'#f59e0b', approved:'#16a34a', rejected:'#dc2626'
  }

  const statCards = [
    { key:'suppliers' as const, label:'Active Suppliers', value: stats.activeSuppliers, color:'#2563eb', sub:'approved vendors', bg:'#eff6ff', border:'#bfdbfe' },
    { key:'approvals' as const, label:'Pending Approvals', value: stats.pendingApprovals, color:'#f59e0b', sub:'awaiting action', bg:'#fffbeb', border:'#fde68a' },
    { key:'spend' as const, label:'Monthly Spend', value: `${stats.currency} ${stats.monthlySpend.toLocaleString()}`, color:'#374151', sub:'approved POs', bg:'#f9fafb', border:'#e5e7eb' },
    { key:'overdue' as const, label:'Overdue Payments', value: stats.overduePayments, color:'#dc2626', sub:'need attention', bg:'#fef2f2', border:'#fecaca' },
  ]

  const inp: React.CSSProperties = { padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none', fontFamily:'sans-serif' }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1200px', margin:'0 auto' }}>

      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Dashboard</h1>
        <p style={{ color:'#666', fontSize:'14px', margin:0 }}>
          {companyName ? `Overview for ${companyName}` : 'Welcome to ProcureIQ Enterprise'}
        </p>
      </div>

      {/* Date Filter */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'16px', marginBottom:'24px', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
        <span style={{ fontSize:'13px', fontWeight:'500', color:'#374151' }}>Filter by date:</span>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <label style={{ fontSize:'12px', color:'#6b7280' }}>From</label>
          <input type="date" style={inp} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <label style={{ fontSize:'12px', color:'#6b7280' }}>To</label>
          <input type="date" style={inp} value={dateTo} onChange={e => setDateTo(e.target.value)}/>
        </div>
        <button onClick={() => loadData(companyId, dateFrom, dateTo)}
          style={{ padding:'7px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', cursor:'pointer', fontWeight:'500' }}>
          Apply
        </button>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); loadData(companyId, '', '') }}
            style={{ padding:'7px 12px', background:'#fff', color:'#6b7280', border:'1px solid #e5e7eb', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {/* Clickable Stat Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'24px' }}>
        {statCards.map(s => (
          <div key={s.key} onClick={() => openModal(s.key)}
            style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:'12px', padding:'20px', cursor:'pointer', transition:'transform 0.1s', position:'relative' }}
            onMouseEnter={e => (e.currentTarget.style.transform='translateY(-2px)')}
            onMouseLeave={e => (e.currentTarget.style.transform='translateY(0)')}>
            <div style={{ fontSize:'12px', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'8px' }}>{s.label}</div>
            <div style={{ fontSize:'26px', fontWeight:'700', color:s.color, marginBottom:'4px' }}>{loading ? '—' : s.value}</div>
            <div style={{ fontSize:'12px', color:'#9ca3af' }}>{s.sub}</div>
            <div style={{ position:'absolute', top:'12px', right:'12px', fontSize:'16px', color:s.color, opacity:0.5 }}>›</div>
          </div>
        ))}
      </div>

      {/* Recent POs and Pending */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h2 style={{ fontSize:'15px', fontWeight:'600', margin:0 }}>Recent Purchase Orders</h2>
            <a href="/requests" style={{ fontSize:'12px', color:'#2563eb', textDecoration:'none' }}>View all</a>
          </div>
          {recentPOs.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>{loading ? 'Loading...' : 'No purchase orders yet.'}</div>
          ) : recentPOs.map(po => (
            <div key={po.id} style={{ padding:'12px 20px', borderBottom:'1px solid #f9fafb', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'13px', fontWeight:'500', fontFamily:'monospace' }}>{po.po_number}</div>
                <div style={{ fontSize:'12px', color:'#6b7280', marginTop:'2px' }}>{(po.supplier as any)?.name} · {po.category}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'13px', fontWeight:'600' }}>{po.currency} {Number(po.total_amount).toLocaleString()}</div>
                <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'10px', fontWeight:'500', background:(statusColor[po.status]||'#6b7280')+'20', color:statusColor[po.status]||'#6b7280' }}>
                  {po.status.replace(/_/g,' ')}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h2 style={{ fontSize:'15px', fontWeight:'600', margin:0 }}>Pending Approvals</h2>
            <a href="/approvals" style={{ fontSize:'12px', color:'#2563eb', textDecoration:'none' }}>View all</a>
          </div>
          {pendingPOs.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>{loading ? 'Loading...' : 'No pending approvals.'}</div>
          ) : pendingPOs.map(po => (
            <div key={po.id} style={{ padding:'12px 20px', borderBottom:'1px solid #f9fafb', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'13px', fontWeight:'500', fontFamily:'monospace' }}>{po.po_number}</div>
                <div style={{ fontSize:'12px', color:'#6b7280', marginTop:'2px' }}>{(po.supplier as any)?.name} · by {(po.maker as any)?.full_name||'—'}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'13px', fontWeight:'600' }}>{po.currency} {Number(po.total_amount).toLocaleString()}</div>
                <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'10px', fontWeight:'500', background:'#fef3c720', color:'#b45309' }}>
                  {po.status.replace('pending_','Level ').toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'700px', maxWidth:'94vw', maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>
                {modal === 'suppliers' && 'Active Suppliers'}
                {modal === 'approvals' && 'Pending Approvals'}
                {modal === 'spend' && 'Monthly Spend — Approved POs'}
                {modal === 'overdue' && 'Overdue Payments'}
              </h2>
              <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                <button onClick={downloadModalCSV}
                  style={{ padding:'6px 12px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'#fff', fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>
                  ⬇ CSV
                </button>
                <button onClick={downloadModalPDF}
                  style={{ padding:'6px 12px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'#fff', fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>
                  ⬇ PDF
                </button>
                <button onClick={() => { setModal(null); setModalData([]) }}
                  style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280', marginLeft:'4px' }}>X</button>
              </div>
            </div>

            <div style={{ overflowY:'auto', flex:1 }}>
              {modalData.length === 0 ? (
                <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>No data found.</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                  <thead style={{ background:'#f9fafb', position:'sticky', top:0 }}>
                    <tr>
                      {modal === 'suppliers' && ['Name','Category','Contact','Email','GSTIN','Net Terms'].map(h => (
                        <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                      ))}
                      {modal === 'approvals' && ['PO Number','Supplier','Amount','Level','Requested By','Submitted'].map(h => (
                        <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                      ))}
                      {modal === 'spend' && ['PO Number','Supplier','Amount','Category','Approved Date'].map(h => (
                        <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                      ))}
                      {modal === 'overdue' && ['Invoice','Supplier','Amount','Due Date','Days Overdue'].map(h => (
                        <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modal === 'suppliers' && modalData.map(s => (
                      <tr key={s.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                        <td style={{ padding:'10px 16px', fontWeight:'500' }}>{s.name}</td>
                        <td style={{ padding:'10px 16px', color:'#6b7280' }}>{s.category}</td>
                        <td style={{ padding:'10px 16px', color:'#6b7280' }}>{s.contact_name||'—'}</td>
                        <td style={{ padding:'10px 16px', color:'#6b7280' }}>{s.email||'—'}</td>
                        <td style={{ padding:'10px 16px', color:'#6b7280', fontFamily:'monospace', fontSize:'12px' }}>{s.gstin||'—'}</td>
                        <td style={{ padding:'10px 16px', color:'#6b7280' }}>Net {s.payment_terms}</td>
                      </tr>
                    ))}
                    {modal === 'approvals' && modalData.map(p => (
                      <tr key={p.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                        <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:'12px' }}>{p.po_number}</td>
                        <td style={{ padding:'10px 16px', fontWeight:'500' }}>{(p.supplier as any)?.name}</td>
                        <td style={{ padding:'10px 16px', fontWeight:'600' }}>{p.currency} {Number(p.total_amount).toLocaleString()}</td>
                        <td style={{ padding:'10px 16px' }}>
                          <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', background:'#fef3c7', color:'#b45309' }}>
                            {p.status.replace('pending_','L').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding:'10px 16px', color:'#6b7280' }}>{(p.maker as any)?.full_name||'—'}</td>
                        <td style={{ padding:'10px 16px', color:'#6b7280', fontSize:'12px' }}>{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                    {modal === 'spend' && modalData.map(p => (
                      <tr key={p.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                        <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:'12px' }}>{p.po_number}</td>
                        <td style={{ padding:'10px 16px', fontWeight:'500' }}>{(p.supplier as any)?.name}</td>
                        <td style={{ padding:'10px 16px', fontWeight:'600' }}>{p.currency} {Number(p.total_amount).toLocaleString()}</td>
                        <td style={{ padding:'10px 16px', color:'#6b7280' }}>{p.category}</td>
                        <td style={{ padding:'10px 16px', color:'#6b7280', fontSize:'12px' }}>{p.final_action_at ? new Date(p.final_action_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                    {modal === 'overdue' && modalData.map(p => {
                      const days = Math.floor((new Date().getTime() - new Date(p.due_date).getTime()) / (1000*60*60*24))
                      return (
                        <tr key={p.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                          <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:'12px' }}>{p.invoice_number}</td>
                          <td style={{ padding:'10px 16px', fontWeight:'500' }}>{(p.supplier as any)?.name}</td>
                          <td style={{ padding:'10px 16px', fontWeight:'600' }}>{p.currency} {Number(p.invoice_amount).toLocaleString()}</td>
                          <td style={{ padding:'10px 16px', color:'#dc2626', fontWeight:'500' }}>{p.due_date}</td>
                          <td style={{ padding:'10px 16px' }}>
                            <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', background:'#fef2f2', color:'#dc2626', fontWeight:'500' }}>
                              {days} days overdue
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}