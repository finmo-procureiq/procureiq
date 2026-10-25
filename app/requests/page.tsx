'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

const DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin']
const CURRENCIES = ['INR','SGD','AED','USD','EUR','GBP','MYR','HKD']

const COMPANIES: Record<string, { code: string; currency: string; name: string }> = {
  '33a0603c-5b4e-4418-9683-1a5d544560ea': { code: 'ACIN', currency: 'INR', name: 'Acme India Pvt Ltd' },
  'f1d448b1-bc01-4f86-b3fc-6bc0b31c992e': { code: 'ACSG', currency: 'SGD', name: 'Acme Singapore Pte Ltd' },
  '485d369d-087f-4776-a70b-6d1203e29c2d': { code: 'ACAE', currency: 'AED', name: 'Acme UAE LLC' },
  '8d37db04-7eb7-4b76-afed-df2a50590d7f': { code: 'FTSG', currency: 'SGD', name: 'Finmo Tech Pte Ltd' },
  'fcf15fb0-29e9-466d-aad2-5b0cf2089a0b': { code: 'FTIN', currency: 'INR', name: 'Finmo Tech India Pvt Ltd' },
}

export default function RequestsPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [entityId, setEntityId] = useState<string | null>(null)
  const [entityCode, setEntityCode] = useState<string>('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [formEntityId, setFormEntityId] = useState<string | null>(null)
  const [formSuppliers, setFormSuppliers] = useState<any[]>([])
  const [approvalHistory, setApprovalHistory] = useState<any[]>([])
  const [form, setForm] = useState({
    title: '', description: '', amount: '', currency: 'INR',
    supplier_id: '', department: '', justification: '', invoice_ref: ''
  })

  const supabase = createClient()
  useEffect(() => { init() }, [])

  async function init() {
    try {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return
      setUser(u)

      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', u.id)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (member?.company_id) {
        const eid = member.company_id
        setEntityId(eid)
        setFormEntityId(eid)
        const co = COMPANIES[eid]
        setEntityCode(co?.code || 'PO')
        // Default form currency to entity currency
        setForm(f => ({ ...f, currency: co?.currency || 'INR' }))
        await loadAll(eid)
        await loadFormSuppliers(eid)
      }
    } catch (e) {
      console.error('init error:', e)
    }
    setLoading(false)
  }

  async function loadAll(eid: string) {
    try {
      // Load ALL POs created by this user across all entities
      const { data: ordersData } = await supabase
        .from('purchase_orders')
        .select('*, supplier:suppliers(id, name)')
        .order('created_at', { ascending: false })
      setOrders(ordersData || [])

      const { data: suppData } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('company_id', eid)
        .eq('status', 'approved')
        .order('name')
      setSuppliers(suppData || [])
    } catch (e) {
      console.error('loadAll error:', e)
    }
  }

  async function loadFormSuppliers(eid: string) {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('company_id', eid)
      .eq('status', 'approved')
      .order('name')
    setFormSuppliers(data || [])
  }

  async function handleFormEntityChange(eid: string) {
    setFormEntityId(eid)
    const co = COMPANIES[eid]
    setForm(f => ({ ...f, currency: co?.currency || 'INR', supplier_id: '' }))
    await loadFormSuppliers(eid)
  }

  async function loadApprovalHistory(poId: string) {
    const { data } = await supabase
      .from('approval_requests')
      .select(`
        *,
        approver:user_profiles(full_name, email)
      `)
      .eq('purchase_order_id', poId)
      .order('created_at', { ascending: true })
    setApprovalHistory(data || [])
  }

  async function getRequiredLevels(companyId: string, amount: number): Promise<string[]> {
    const { data: matrix } = await supabase
      .from('approval_matrix')
      .select('min_amount, max_amount, required_levels')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('min_amount', { ascending: true })

    if (!matrix?.length) return ['L1']

    for (const row of matrix) {
      const aboveMin = amount >= row.min_amount
      const belowMax = row.max_amount === null || amount <= row.max_amount
      if (aboveMin && belowMax) return row.required_levels
    }
    return ['L1']
  }

  async function getApproversForLevel(companyId: string, level: string): Promise<string[]> {
    const { data: members } = await supabase
      .from('company_members')
      .select('user_id, roles')
      .eq('company_id', companyId)
      .eq('is_active', true)

    return (members || [])
      .filter((m: any) => Array.isArray(m.roles) && (m.roles.includes(level) || m.roles.includes('ADMIN')))
      .map((m: any) => m.user_id)
  }

  async function handleSubmit() {
    const submitEntityId = formEntityId || entityId
    if (!form.title || !form.amount || !form.department || !submitEntityId || !user) return
    setSaving(true)

    try {
      const amount = parseFloat(form.amount)
      const co = COMPANIES[submitEntityId]
      const code = co?.code || entityCode || 'PO'
      const poNumber = `${code}-${Date.now().toString().slice(-6)}`

      // 1. Determine required approval levels BEFORE inserting
      const requiredLevels = await getRequiredLevels(submitEntityId, amount)

      // 2. Insert the PO with required_levels stored
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          company_id: submitEntityId,
          po_number: poNumber,
          title: form.title,
          description: form.description || null,
          amount,
          currency: form.currency,
          supplier_id: form.supplier_id || null,
          department: form.department,
          justification: form.justification || null,
          invoice_ref: form.invoice_ref || null,
          created_by: user.id,
          requested_by: user.id,
          submitted_at: new Date().toISOString(),
          status: 'pending_l1',
          current_level: '1',
          required_levels: requiredLevels,
        })
        .select()
        .single()

      if (poError) throw poError

      // 3. Create approval_requests for the FIRST level only
      const firstLevel = requiredLevels[0]
      const approvers = await getApproversForLevel(submitEntityId, firstLevel)

      if (approvers.length > 0) {
        const approvalRows = approvers.map((approverId: string) => ({
          document_id: po.id,
          document_type: 'purchase_order',
          submitted_by: approverId,
          status: 'submitted',
          level: firstLevel,
        }))
        const { error: arErr } = await supabase.from('approval_requests').insert(approvalRows)
        if (arErr) console.warn('approval_requests insert error:', arErr.message)
      }

      setShowForm(false)
      setForm(f => ({ ...f, title:'', description:'', amount:'', supplier_id:'', justification:'', invoice_ref:'' }))
      // Reload the user's primary entity view
      if (entityId) await loadAll(entityId)

      const chain = requiredLevels.join(' → ')
      alert(`Request submitted!\nApproval chain: ${chain}\n\nSent to ${firstLevel} approver${approvers.length !== 1 ? 's' : ''} for review.`)
    } catch (e: any) {
      alert('Error submitting request: ' + e.message)
    }
    setSaving(false)
  }

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pending_l1:      { label: 'Pending L1',      color: '#d97706', bg: '#fef3c7' },
    pending_l2:      { label: 'Pending L2',      color: '#ea580c', bg: '#ffedd5' },
    pending_l3:      { label: 'Pending L3',      color: '#9333ea', bg: '#f3e8ff' },
    pending_finance: { label: 'Pending Finance', color: '#0891b2', bg: '#ecfeff' },
    approved:        { label: 'Approved',        color: '#16a34a', bg: '#f0fdf4' },
    rejected:        { label: 'Rejected',        color: '#dc2626', bg: '#fef2f2' },
    recalled:        { label: 'Recalled',        color: '#6b7280', bg: '#f3f4f6' },
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  const fmtAmt = (amount: number, cur: string) => {
    try {
      return new Intl.NumberFormat('en-US', { style:'currency', currency: cur, maximumFractionDigits: 2 }).format(amount)
    } catch { return `${cur} ${amount.toLocaleString()}` }
  }

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading requests...</div>

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>My Requests</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>{orders.length} purchase request{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + New Request
        </button>
      </div>

      {orders.length === 0 ? (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'64px', textAlign:'center' }}>
          <div style={{ fontSize:'48px', marginBottom:'16px' }}>📋</div>
          <h3 style={{ fontSize:'18px', fontWeight:'600', marginBottom:'8px', color:'#374151' }}>No requests yet</h3>
          <p style={{ color:'#9ca3af', marginBottom:'24px' }}>Create your first purchase request to get started</p>
          <button onClick={() => setShowForm(true)}
            style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 20px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
            + New Request
          </button>
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
            <thead style={{ background:'#f9fafb' }}>
              <tr>
                {['PO Number','Title','Entity','Department','Supplier','Amount','Status','Date'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const sc = statusConfig[o.status] || { label: o.status, color:'#6b7280', bg:'#f3f4f6' }
                return (
                  <tr key={o.id}
                    onClick={async () => { setSelectedOrder(o); await loadApprovalHistory(o.id) }}
                    style={{ borderBottom:'1px solid #f3f4f6', cursor:'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background='#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{o.po_number}</td>
                    <td style={{ padding:'12px 16px', fontWeight:'500' }}>{o.title}</td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{COMPANIES[o.company_id]?.code || '—'}</td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{o.department || '—'}</td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{o.supplier?.name || '—'}</td>
                    <td style={{ padding:'12px 16px', fontWeight:'600', color:'#111827' }}>{fmtAmt(o.amount, o.currency || 'INR')}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:sc.bg, color:sc.color }}>{sc.label}</span>
                    </td>
                    <td style={{ padding:'12px 16px', color:'#9ca3af', fontSize:'12px' }}>{new Date(o.created_at).toLocaleDateString('en-IN')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail / History Modal */}
      {selectedOrder && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'580px', maxWidth:'94vw', padding:'28px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <div>
                <div style={{ fontSize:'12px', color:'#9ca3af', fontFamily:'monospace', marginBottom:'4px' }}>{selectedOrder.po_number}</div>
                <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>{selectedOrder.title}</h2>
              </div>
              <button onClick={() => { setSelectedOrder(null); setApprovalHistory([]) }}
                style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
              {[
                ['Amount', fmtAmt(selectedOrder.amount, selectedOrder.currency || 'INR')],
                ['Currency', selectedOrder.currency || 'INR'],
                ['Department', selectedOrder.department || '—'],
                ['Supplier', selectedOrder.supplier?.name || '—'],
                ['Status', (statusConfig[selectedOrder.status]||{label:selectedOrder.status}).label],
                ['Invoice Ref', selectedOrder.invoice_ref || '—'],
              ].map(([k,v]) => (
                <div key={k}>
                  <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'2px' }}>{k}</div>
                  <div style={{ fontSize:'14px', fontWeight:'500', color:'#374151' }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Approval chain */}
            {selectedOrder.required_levels?.length > 0 && (
              <div style={{ marginBottom:'16px', padding:'12px', background:'#f8f9fa', borderRadius:'8px' }}>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'8px', fontWeight:'600' }}>APPROVAL CHAIN</div>
                <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
                  {selectedOrder.required_levels.map((lvl: string, i: number) => {
                    const history = approvalHistory.filter(a => a.level === lvl)
                    const anyApproved = history.some(a => a.status === 'approved')
                    const anyRejected = history.some(a => a.status === 'rejected')
                    const color = anyApproved ? '#16a34a' : anyRejected ? '#dc2626' : '#d97706'
                    const bg = anyApproved ? '#f0fdf4' : anyRejected ? '#fef2f2' : '#fef3c7'
                    return (
                      <span key={lvl} style={{ display:'inline-flex', alignItems:'center', gap:'4px' }}>
                        <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:bg, color }}>
                          {anyApproved ? '✓ ' : anyRejected ? '✗ ' : ''}{lvl}
                        </span>
                        {i < selectedOrder.required_levels.length - 1 && <span style={{ color:'#9ca3af' }}>→</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {selectedOrder.description && (
              <div style={{ padding:'12px', background:'#f9fafb', borderRadius:'8px', fontSize:'13px', color:'#6b7280', marginBottom:'12px' }}>
                {selectedOrder.description}
              </div>
            )}
            {selectedOrder.justification && (
              <div style={{ marginBottom:'12px' }}>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'4px' }}>Business Justification</div>
                <div style={{ padding:'12px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'8px', fontSize:'13px', color:'#92400e' }}>
                  {selectedOrder.justification}
                </div>
              </div>
            )}

            {/* Approval history */}
            {approvalHistory.length > 0 && (
              <div>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'8px', fontWeight:'600' }}>APPROVAL HISTORY</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {approvalHistory.map((a: any) => {
                    const isApproved = a.status === 'approved'
                    const isRejected = a.status === 'rejected'
                    return (
                      <div key={a.id} style={{
                        display:'flex', alignItems:'flex-start', gap:'10px', padding:'10px 12px', borderRadius:'8px',
                        background: isApproved ? '#f0fdf4' : isRejected ? '#fef2f2' : '#fef3c7',
                        border: `1px solid ${isApproved ? '#bbf7d0' : isRejected ? '#fecaca' : '#fde68a'}`
                      }}>
                        <span style={{ fontSize:'16px' }}>{isApproved ? '✅' : isRejected ? '❌' : '⏳'}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:'13px', fontWeight:'500' }}>
                            {a.approver?.full_name || a.approver?.email || 'Approver'} <span style={{ color:'#9ca3af', fontWeight:'400' }}>· {a.level}</span>
                          </div>
                          {a.notes && <div style={{ fontSize:'12px', color:'#6b7280', marginTop:'2px', fontStyle:'italic' }}>"{a.notes}"</div>}
                          {a.responded_at && <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'2px' }}>{new Date(a.responded_at).toLocaleString('en-IN')}</div>}
                        </div>
                        <span style={{ fontSize:'12px', fontWeight:'600', color: isApproved ? '#16a34a' : isRejected ? '#dc2626' : '#d97706', textTransform:'capitalize' }}>{a.status}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'20px' }}>
              <button onClick={() => { setSelectedOrder(null); setApprovalHistory([]) }}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Request Form */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'580px', maxWidth:'94vw', padding:'28px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>New Purchase Request</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>✕</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div>
                <label style={lbl}>Entity (Legal Entity) *</label>
                <select style={inp} value={formEntityId || ''} onChange={e => handleFormEntityChange(e.target.value)}>
                  {Object.entries(COMPANIES).map(([id, co]) => (
                    <option key={id} value={id}>{co.name} ({co.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={lbl}>Request Title *</label>
                <input style={inp} value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="e.g. AWS Cloud Services Q2"/>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
                <div>
                  <label style={lbl}>Amount *</label>
                  <input style={inp} type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} placeholder="0.00"/>
                </div>
                <div>
                  <label style={lbl}>Invoice Currency *</label>
                  <select style={inp} value={form.currency} onChange={e => setForm({...form, currency:e.target.value})}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Threshold hint */}
              {form.amount && (
                <div style={{ padding:'8px 12px', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:'8px', fontSize:'12px', color:'#0369a1' }}>
                  {parseFloat(form.amount) < 10000 ? '→ L1 approval only' :
                   parseFloat(form.amount) < 25000 ? '→ L1 then L2 approval' :
                   '→ L1 → L2 → L3 approval chain'}
                  {' '}(based on {form.currency} amount)
                </div>
              )}

              <div>
                <label style={lbl}>Department *</label>
                <select style={inp} value={form.department} onChange={e => setForm({...form, department:e.target.value})}>
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Supplier {formSuppliers.length === 0 ? '(no approved suppliers for this entity)' : '(optional)'}</label>
                <select style={inp} value={form.supplier_id} onChange={e => setForm({...form, supplier_id:e.target.value})}>
                  <option value="">Select supplier...</option>
                  {formSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Invoice / Reference Number</label>
                <input style={inp} value={form.invoice_ref} onChange={e => setForm({...form, invoice_ref:e.target.value})} placeholder="INV-2024-001"/>
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea style={{...inp, height:'72px', resize:'vertical' as any}} value={form.description}
                  onChange={e => setForm({...form, description:e.target.value})} placeholder="What is this purchase for?"/>
              </div>
              <div>
                <label style={lbl}>Business Justification</label>
                <textarea style={{...inp, height:'72px', resize:'vertical' as any}} value={form.justification}
                  onChange={e => setForm({...form, justification:e.target.value})} placeholder="Why is this purchase needed?"/>
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'24px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={saving || !form.title || !form.amount || !form.department}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: (!form.title||!form.amount||!form.department) ? '#c4b5fd' : '#9B72F5',
                  opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
