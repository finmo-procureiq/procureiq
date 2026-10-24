'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

const DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin']

export default function RequestsPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyCode, setCompanyCode] = useState<string>('')
  const [currency, setCurrency] = useState<string>('INR')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [form, setForm] = useState({
    title: '', description: '', amount: '', supplier_id: '', department: '',
    justification: '', invoice_ref: ''
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    setUser(u)

    const { data: member } = await supabase
      .from('company_members')
      .select('company_id, company:companies(id, code, currency)')
      .eq('user_id', u.id)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (member?.company_id) {
      setCompanyId(member.company_id)
      setCompanyCode((member.company as any)?.code || '')
      setCurrency((member.company as any)?.currency || 'INR')
      await loadAll(member.company_id)
    }
    setLoading(false)
  }

  async function loadAll(cid: string) {
    const [ordersRes, suppliersRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, supplier:suppliers(id, name)')
        .eq('company_id', cid)
        .order('created_at', { ascending: false }),
      supabase.from('suppliers')
        .select('id, name')
        .eq('company_id', cid)
        .eq('status', 'approved')
        .order('name')
    ])

    setOrders(ordersRes.data || [])
    setSuppliers(suppliersRes.data || [])
  }

  async function handleSubmit() {
    if (!form.title || !form.amount || !form.department || !companyId || !user) return
    setSaving(true)

    const poNumber = `${companyCode}-PO-${Date.now().toString().slice(-6)}`

    const { error } = await supabase.from('purchase_orders').insert({
      company_id: companyId,
      po_number: poNumber,
      title: form.title,
      description: form.description || null,
      amount: parseFloat(form.amount),
      supplier_id: form.supplier_id || null,
      department: form.department,
      justification: form.justification || null,
      invoice_ref: form.invoice_ref || null,
      requested_by: user.id,
      status: 'pending_l1',
      current_level: 1,
    })

    if (error) {
      alert('Error submitting request: ' + error.message)
    } else {
      setShowForm(false)
      setForm({ title:'', description:'', amount:'', supplier_id:'', department:'', justification:'', invoice_ref:'' })
      await loadAll(companyId)
      alert('Request submitted successfully!')
    }
    setSaving(false)
  }

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pending_l1: { label: 'Pending L1', color: '#d97706', bg: '#fef3c7' },
    pending_l2: { label: 'Pending L2', color: '#ea580c', bg: '#ffedd5' },
    pending_l3: { label: 'Pending L3', color: '#9333ea', bg: '#f3e8ff' },
    approved: { label: 'Approved', color: '#16a34a', bg: '#f0fdf4' },
    rejected: { label: 'Rejected', color: '#dc2626', bg: '#fef2f2' },
    recalled: { label: 'Recalled', color: '#6b7280', bg: '#f3f4f6' },
    amended: { label: 'Amended', color: '#2563eb', bg: '#eff6ff' },
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style:'currency', currency, maximumFractionDigits:0 }).format(n)

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading requests...</div>

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>My Requests</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>{orders.length} purchase requests</p>
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
                {['PO Number','Title','Department','Supplier','Amount','Status','Date'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const sc = statusConfig[o.status] || { label: o.status, color:'#6b7280', bg:'#f3f4f6' }
                return (
                  <tr key={o.id} onClick={() => setSelectedOrder(o)} style={{ borderBottom:'1px solid #f3f4f6', cursor:'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background='#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{o.po_number}</td>
                    <td style={{ padding:'12px 16px', fontWeight:'500' }}>{o.title}</td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{o.department || '—'}</td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{o.supplier?.name || '—'}</td>
                    <td style={{ padding:'12px 16px', fontWeight:'600', color:'#111827' }}>{fmt(o.amount)}</td>
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

      {selectedOrder && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'520px', maxWidth:'94vw', padding:'28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <div>
                <div style={{ fontSize:'12px', color:'#9ca3af', fontFamily:'monospace', marginBottom:'4px' }}>{selectedOrder.po_number}</div>
                <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>{selectedOrder.title}</h2>
              </div>
              <button onClick={() => setSelectedOrder(null)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
              {[
                ['Amount', fmt(selectedOrder.amount)],
                ['Department', selectedOrder.department || '—'],
                ['Supplier', selectedOrder.supplier?.name || '—'],
                ['Status', (statusConfig[selectedOrder.status]||{label:selectedOrder.status}).label],
                ['Invoice Ref', selectedOrder.invoice_ref || '—'],
                ['Date', new Date(selectedOrder.created_at).toLocaleDateString('en-IN')],
              ].map(([k,v]) => (
                <div key={k}>
                  <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'2px' }}>{k}</div>
                  <div style={{ fontSize:'14px', fontWeight:'500', color:'#374151' }}>{v}</div>
                </div>
              ))}
            </div>
            {selectedOrder.description && (
              <div style={{ padding:'12px', background:'#f9fafb', borderRadius:'8px', fontSize:'13px', color:'#6b7280', marginBottom:'16px' }}>
                {selectedOrder.description}
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'20px' }}>
              <button onClick={() => setSelectedOrder(null)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'560px', maxWidth:'94vw', padding:'28px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>New Purchase Request</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div>
                <label style={lbl}>Request Title *</label>
                <input style={inp} value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="e.g. AWS Cloud Services Q2"/>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
                <div>
                  <label style={lbl}>Amount ({currency}) *</label>
                  <input style={inp} type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} placeholder="0.00"/>
                </div>
                <div>
                  <label style={lbl}>Department *</label>
                  <select style={inp} value={form.department} onChange={e => setForm({...form, department:e.target.value})}>
                    <option value="">Select department...</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={lbl}>Supplier {suppliers.length === 0 ? '(no approved suppliers yet)' : '(optional)'}</label>
                <select style={inp} value={form.supplier_id} onChange={e => setForm({...form, supplier_id:e.target.value})}>
                  <option value="">Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {suppliers.length === 0 && (
                  <p style={{ fontSize:'11px', color:'#f59e0b', marginTop:'4px' }}>No approved suppliers found. Go to Suppliers page to add and approve suppliers first.</p>
                )}
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
                  background: (!form.title||!form.amount||!form.department) ? '#c4b5fd' : '#9B72F5' }}>
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}