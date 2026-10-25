'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    activeSuppliers: 0, pendingApprovals: 0,
    monthlySpend: 0, overduePayments: 0, currency: 'SGD'
  })
  const [recentPOs, setRecentPOs] = useState<any[]>([])
  const [pendingPOs, setPendingPOs] = useState<any[]>([])
  const [userName, setUserName] = useState('')
  const [companies, setCompanies] = useState<any[]>([])
  const [companiesMap, setCompaniesMap] = useState<Record<string, any>>({})
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null|'suppliers'|'approvals'|'spend'|'overdue'>(null)
  const [modalData, setModalData] = useState<any[]>([])
  const [userEntityIds, setUserEntityIds] = useState<string[]>([])

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    // Load all companies from API (bypasses RLS)
    const cosRes = await fetch('/api/companies')
    const cosData = await cosRes.json()
    const cosMap: Record<string, any> = {}
    if (Array.isArray(cosData)) {
      cosData.forEach((c: any) => { cosMap[c.id] = c })
      setCompanies(cosData)
      setCompaniesMap(cosMap)
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get user profile name
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    setUserName(profile?.full_name || '')

    // Get all entity memberships for this user
    const { data: members } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const entityIds = (members || []).map((m: any) => m.company_id).filter(Boolean)
    setUserEntityIds(entityIds)

    // Default: show all entities if admin, or first entity
    const firstId = entityIds[0] || (Array.isArray(cosData) && cosData[0]?.id) || ''
    setSelectedCompanyId('all')
    await loadData('all', '', '', entityIds, cosMap)
  }

  async function loadData(cid: string, from: string, to: string, entityIds?: string[], cosMap?: Record<string,any>) {
    setLoading(true)
    const ids = entityIds || userEntityIds
    const useAll = cid === 'all'
    const targetIds = useAll ? ids : [cid]

    if (targetIds.length === 0) { setLoading(false); return }

    // Active suppliers across selected entities
    const suppQ = supabase.from('suppliers')
      .select('*', { count: 'exact', head: true })
      .in('company_id', targetIds)
      .eq('status', 'approved')
    const { count: supplierCount } = await suppQ

    // Pending approvals (all pending statuses) across selected entities
    const { count: pendingCount } = await supabase.from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .in('company_id', targetIds)
      .in('status', ['pending_l1','pending_l2','pending_l3','pending_finance'])

    // Monthly spend — approved POs
    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0)
    const { data: spendData } = await supabase.from('purchase_orders')
      .select('amount, currency')
      .in('company_id', targetIds)
      .eq('status', 'approved')
      .gte('created_at', from || startOfMonth.toISOString())
    const totalSpend = (spendData || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)

    // Overdue payments
    const { count: overdueCount } = await supabase.from('payments')
      .select('*', { count: 'exact', head: true })
      .in('company_id', targetIds)
      .not('status', 'in', '(paid,cancelled)')
      .lt('due_date', new Date().toISOString().split('T')[0])

    // Recent POs
    let poQuery = supabase.from('purchase_orders')
      .select('*, supplier:suppliers(name)')
      .in('company_id', targetIds)
      .order('created_at', { ascending: false }).limit(8)
    if (from) poQuery = poQuery.gte('created_at', from)
    if (to) poQuery = poQuery.lte('created_at', to + 'T23:59:59Z')
    const { data: pos } = await poQuery

    // Pending approvals list
    const { data: pending } = await supabase.from('purchase_orders')
      .select('*, supplier:suppliers(name), maker:user_profiles!purchase_orders_created_by_fkey(full_name)')
      .in('company_id', targetIds)
      .in('status', ['pending_l1','pending_l2','pending_l3','pending_finance'])
      .order('submitted_at', { ascending: true }).limit(8)

    // Determine display currency (use first entity's currency, or SGD)
    const displayCurrency = (cosMap || companiesMap)[cid]?.currency || 'SGD'

    setStats({
      activeSuppliers: supplierCount || 0,
      pendingApprovals: pendingCount || 0,
      monthlySpend: totalSpend,
      overduePayments: overdueCount || 0,
      currency: displayCurrency
    })
    setRecentPOs(pos || [])
    setPendingPOs(pending || [])
    setLoading(false)
  }

  async function openModal(type: 'suppliers'|'approvals'|'spend'|'overdue') {
    setModal(type)
    const targetIds = selectedCompanyId === 'all' ? userEntityIds : [selectedCompanyId]
    if (targetIds.length === 0) { setModalData([]); return }

    if (type === 'suppliers') {
      const { data } = await supabase.from('suppliers')
        .select('*').in('company_id', targetIds).eq('status', 'approved')
        .order('name')
      setModalData(data || [])
    }
    if (type === 'approvals') {
      const { data } = await supabase.from('purchase_orders')
        .select('*, supplier:suppliers(name), maker:user_profiles!purchase_orders_created_by_fkey(full_name)')
        .in('company_id', targetIds)
        .in('status', ['pending_l1','pending_l2','pending_l3','pending_finance'])
        .order('submitted_at', { ascending: true })
      setModalData(data || [])
    }
    if (type === 'spend') {
      const startOfMonth = new Date()
      startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0)
      const { data } = await supabase.from('purchase_orders')
        .select('*, supplier:suppliers(name)')
        .in('company_id', targetIds).eq('status', 'approved')
        .gte('created_at', dateFrom || startOfMonth.toISOString())
        .order('created_at', { ascending: false })
      setModalData(data || [])
    }
    if (type === 'overdue') {
      const { data } = await supabase.from('payments')
        .select('*, supplier:suppliers(name)')
        .in('company_id', targetIds)
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
      headers = ['Name','Category','Contact Email','Phone','GSTIN','Payment Terms']
      rows = modalData.map(s => [s.name, s.category||'—', s.contact_email||'—', s.contact_phone||'—', s.gstin||'—', `Net ${s.payment_terms}`])
    }
    if (modal === 'approvals') {
      headers = ['PO Number','Entity','Supplier','Amount','Currency','Status','Requested By','Submitted']
      rows = modalData.map(p => [p.po_number, companiesMap[p.company_id]?.code||'—', (p.supplier as any)?.name||'—', p.amount, p.currency, p.status, (p.maker as any)?.full_name||'—', p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '—'])
    }
    if (modal === 'spend') {
      headers = ['PO Number','Entity','Supplier','Amount','Currency','Approved Date']
      rows = modalData.map(p => [p.po_number, companiesMap[p.company_id]?.code||'—', (p.supplier as any)?.name||'—', p.amount, p.currency, p.final_action_at ? new Date(p.final_action_at).toLocaleDateString() : '—'])
    }
    if (modal === 'overdue') {
      headers = ['Invoice','Entity','Supplier','Amount','Currency','Due Date','Days Overdue']
      rows = modalData.map(p => {
        const days = Math.floor((new Date().getTime() - new Date(p.due_date).getTime()) / (1000*60*60*24))
        return [p.invoice_number, companiesMap[p.company_id]?.code||'—', (p.supplier as any)?.name||'—', p.invoice_amount, p.currency, p.due_date, `${days} days`]
      })
    }
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `ProcureIQ_${modal}_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const fmtAmt = (amount: number, cur: string) => {
    try { return new Intl.NumberFormat('en-US', { style:'currency', currency: cur||'INR', maximumFractionDigits:0 }).format(amount) }
    catch { return `${cur} ${amount?.toLocaleString()}` }
  }

  const statusColor: Record<string,string> = {
    approved:'#16a34a', rejected:'#dc2626', draft:'#6b7280',
    pending_l1:'#d97706', pending_l2:'#ea580c', pending_l3:'#9333ea', pending_finance:'#0891b2'
  }

  const inp: React.CSSProperties = { padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:'6px', fontFamily:'sans-serif', fontSize:'13px', outline:'none' }

  const statCards = [
    { key:'suppliers' as const, label:'Active Suppliers', value: stats.activeSuppliers, sub:'Approved & onboarded', color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe' },
    { key:'approvals' as const, label:'Pending Approvals', value: stats.pendingApprovals, sub:'Awaiting action', color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
    { key:'spend' as const, label:'Month-to-Date Spend', value: fmtAmt(stats.monthlySpend, stats.currency), sub:'Approved POs this month', color:'#7c3aed', bg:'#f5f3ff', border:'#ddd6fe' },
    { key:'overdue' as const, label:'Overdue Payments', value: stats.overduePayments, sub:'Past due date', color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
  ]

  if (loading && companies.length === 0) return (
    <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading dashboard...</div>
  )

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1200px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Dashboard</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>
            {userName ? `Welcome back, ${userName.split(' ')[0]}` : 'Welcome to ProcureIQ'} · {new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </p>
        </div>

        {/* Entity filter */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'13px', color:'#6b7280', fontWeight:'500' }}>Entity:</span>
          {[{id:'all',name:'All Entities',code:'ALL'}, ...companies].map(c => (
            <button key={c.id} onClick={() => { setSelectedCompanyId(c.id); loadData(c.id, dateFrom, dateTo) }}
              style={{ padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:'500', cursor:'pointer', border:'none',
                background: selectedCompanyId === c.id ? '#7c3aed' : '#f3f4f6',
                color: selectedCompanyId === c.id ? '#fff' : '#374151' }}>
              {c.code || (c.id === 'all' ? 'ALL' : c.name)}
            </button>
          ))}
        </div>
      </div>

      {/* Date Filter */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'14px 16px', marginBottom:'24px', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
        <span style={{ fontSize:'13px', fontWeight:'500', color:'#374151' }}>Date range:</span>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <label style={{ fontSize:'12px', color:'#6b7280' }}>From</label>
          <input type="date" style={inp} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <label style={{ fontSize:'12px', color:'#6b7280' }}>To</label>
          <input type="date" style={inp} value={dateTo} onChange={e => setDateTo(e.target.value)}/>
        </div>
        <button onClick={() => loadData(selectedCompanyId, dateFrom, dateTo)}
          style={{ padding:'6px 14px', background:'#7c3aed', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', cursor:'pointer', fontWeight:'500' }}>
          Apply
        </button>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); loadData(selectedCompanyId, '', '') }}
            style={{ padding:'6px 12px', background:'#fff', color:'#6b7280', border:'1px solid #e5e7eb', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {/* Stat Cards */}
      <div className="dash-stats-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'24px' }}>
        {statCards.map(s => (
          <div key={s.key} onClick={() => openModal(s.key)}
            style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:'12px', padding:'20px', cursor:'pointer', transition:'transform 0.1s, box-shadow 0.1s', position:'relative' }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='' }}>
            <div style={{ fontSize:'11px', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'8px', fontWeight:'600' }}>{s.label}</div>
            <div style={{ fontSize:'26px', fontWeight:'700', color:s.color, marginBottom:'4px' }}>{loading ? '—' : s.value}</div>
            <div style={{ fontSize:'12px', color:'#9ca3af' }}>{s.sub}</div>
            <div style={{ position:'absolute', top:'16px', right:'16px', fontSize:'18px', color:s.color, opacity:0.4 }}>›</div>
          </div>
        ))}
      </div>

      {/* Recent POs and Pending */}
      <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h2 style={{ fontSize:'15px', fontWeight:'600', margin:0 }}>Recent Purchase Orders</h2>
            <a href="/requests" style={{ fontSize:'12px', color:'#7c3aed', textDecoration:'none' }}>View all →</a>
          </div>
          {loading ? (
            <div style={{ padding:'32px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>Loading...</div>
          ) : recentPOs.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>No purchase orders yet.</div>
          ) : recentPOs.map(po => (
            <div key={po.id} style={{ padding:'12px 20px', borderBottom:'1px solid #f9fafb', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'12px', fontWeight:'600', fontFamily:'monospace', color:'#6b7280' }}>{po.po_number}</div>
                <div style={{ fontSize:'13px', fontWeight:'500', marginTop:'1px' }}>{po.title}</div>
                <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'1px' }}>
                  {companiesMap[po.company_id]?.code || '—'} · {(po.supplier as any)?.name || 'No supplier'}
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:'13px', fontWeight:'600' }}>{fmtAmt(po.amount, po.currency)}</div>
                <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'10px', fontWeight:'500',
                  background:(statusColor[po.status]||'#6b7280')+'20', color:statusColor[po.status]||'#6b7280' }}>
                  {po.status.replace(/_/g,' ')}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h2 style={{ fontSize:'15px', fontWeight:'600', margin:0 }}>Pending Approvals</h2>
            <a href="/approvals" style={{ fontSize:'12px', color:'#7c3aed', textDecoration:'none' }}>Review →</a>
          </div>
          {loading ? (
            <div style={{ padding:'32px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>Loading...</div>
          ) : pendingPOs.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>No pending approvals. 🎉</div>
          ) : pendingPOs.map(po => (
            <div key={po.id} style={{ padding:'12px 20px', borderBottom:'1px solid #f9fafb', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'12px', fontWeight:'600', fontFamily:'monospace', color:'#6b7280' }}>{po.po_number}</div>
                <div style={{ fontSize:'13px', fontWeight:'500', marginTop:'1px' }}>{po.title}</div>
                <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'1px' }}>
                  {companiesMap[po.company_id]?.code || '—'} · by {(po.maker as any)?.full_name||'—'}
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:'13px', fontWeight:'600' }}>{fmtAmt(po.amount, po.currency)}</div>
                <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'10px', fontWeight:'500', background:'#fef3c7', color:'#b45309' }}>
                  {po.status.replace('pending_','').toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'760px', maxWidth:'94vw', maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>
                {modal === 'suppliers' && 'Active Suppliers'}
                {modal === 'approvals' && 'Pending Approvals'}
                {modal === 'spend' && 'Month-to-Date Spend'}
                {modal === 'overdue' && 'Overdue Payments'}
                <span style={{ fontWeight:'400', color:'#9ca3af', fontSize:'14px', marginLeft:'8px' }}>({modalData.length})</span>
              </h2>
              <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                <button onClick={downloadModalCSV}
                  style={{ padding:'6px 12px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'#fff', fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>
                  ⬇ CSV
                </button>
                <button onClick={() => { setModal(null); setModalData([]) }}
                  style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280', lineHeight:1 }}>✕</button>
              </div>
            </div>

            <div style={{ overflowY:'auto', flex:1 }}>
              {modalData.length === 0 ? (
                <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>No data found.</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                  <thead style={{ background:'#f9fafb', position:'sticky', top:0 }}>
                    <tr>
                      {modal === 'suppliers' && ['Name','Entity','Category','Contact Email','GSTIN','Terms'].map(h => (
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                      ))}
                      {modal === 'approvals' && ['PO Number','Entity','Title','Amount','Level','Requested By'].map(h => (
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                      ))}
                      {modal === 'spend' && ['PO Number','Entity','Supplier','Amount','Date'].map(h => (
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                      ))}
                      {modal === 'overdue' && ['Invoice','Entity','Supplier','Amount','Due Date','Days Late'].map(h => (
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modal === 'suppliers' && modalData.map(s => (
                      <tr key={s.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                        <td style={{ padding:'10px 14px', fontWeight:'500' }}>{s.name}</td>
                        <td style={{ padding:'10px 14px', color:'#6b7280', fontSize:'12px' }}>{companiesMap[s.company_id]?.code||'—'}</td>
                        <td style={{ padding:'10px 14px', color:'#6b7280' }}>{s.category||'—'}</td>
                        <td style={{ padding:'10px 14px', color:'#6b7280' }}>{s.contact_email||'—'}</td>
                        <td style={{ padding:'10px 14px', color:'#6b7280', fontFamily:'monospace', fontSize:'12px' }}>{s.gstin||'—'}</td>
                        <td style={{ padding:'10px 14px', color:'#6b7280' }}>Net {s.payment_terms}</td>
                      </tr>
                    ))}
                    {modal === 'approvals' && modalData.map(p => (
                      <tr key={p.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                        <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{p.po_number}</td>
                        <td style={{ padding:'10px 14px', fontSize:'12px', color:'#6b7280' }}>{companiesMap[p.company_id]?.code||'—'}</td>
                        <td style={{ padding:'10px 14px', fontWeight:'500' }}>{p.title}</td>
                        <td style={{ padding:'10px 14px', fontWeight:'600' }}>{fmtAmt(p.amount, p.currency)}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', background:'#fef3c7', color:'#b45309', fontWeight:'600' }}>
                            {p.status.replace('pending_','').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding:'10px 14px', color:'#6b7280' }}>{(p.maker as any)?.full_name||'—'}</td>
                      </tr>
                    ))}
                    {modal === 'spend' && modalData.map(p => (
                      <tr key={p.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                        <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{p.po_number}</td>
                        <td style={{ padding:'10px 14px', fontSize:'12px', color:'#6b7280' }}>{companiesMap[p.company_id]?.code||'—'}</td>
                        <td style={{ padding:'10px 14px', fontWeight:'500' }}>{(p.supplier as any)?.name||'—'}</td>
                        <td style={{ padding:'10px 14px', fontWeight:'600' }}>{fmtAmt(p.amount, p.currency)}</td>
                        <td style={{ padding:'10px 14px', color:'#6b7280', fontSize:'12px' }}>{p.final_action_at ? new Date(p.final_action_at).toLocaleDateString('en-IN') : p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '—'}</td>
                      </tr>
                    ))}
                    {modal === 'overdue' && modalData.map(p => {
                      const days = Math.floor((new Date().getTime() - new Date(p.due_date).getTime()) / (1000*60*60*24))
                      return (
                        <tr key={p.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                          <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{p.invoice_number}</td>
                          <td style={{ padding:'10px 14px', fontSize:'12px', color:'#6b7280' }}>{companiesMap[p.company_id]?.code||'—'}</td>
                          <td style={{ padding:'10px 14px', fontWeight:'500' }}>{(p.supplier as any)?.name||'—'}</td>
                          <td style={{ padding:'10px 14px', fontWeight:'600' }}>{fmtAmt(p.invoice_amount, p.currency)}</td>
                          <td style={{ padding:'10px 14px', color:'#dc2626', fontWeight:'500' }}>{p.due_date}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', background:'#fef2f2', color:'#dc2626', fontWeight:'600' }}>
                              {days}d overdue
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
