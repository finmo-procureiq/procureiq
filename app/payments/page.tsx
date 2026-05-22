'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { getActiveCompanyId } from '@/lib/company'

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [pos, setPOs] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [payModal, setPayModal] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [companyId, setCompanyId] = useState('')
  const [userId, setUserId] = useState('')
  const [dupWarning, setDupWarning] = useState<string|null>(null)
  const [payForm, setPayForm] = useState({ amount:'', method:'NEFT', ref:'', type:'full' })
  const [form, setForm] = useState({
    invoice_number:'', supplier_id:'', po_id:'',
    invoice_amount:'', tax_amount:'', tds_amount:'0',
    currency:'INR', due_date:'', notes:''
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])
  useEffect(() => { if (companyId) { loadAll(); loadSuppliers(); loadPOs() } }, [companyId, filter])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const cid = await getActiveCompanyId()
    setCompanyId(cid)
  }

  async function loadAll() {
    const { data: recorded } = await supabase
      .from('payments')
      .select('*, supplier:suppliers(name), po:purchase_orders(po_number)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    const { data: approvedPOs } = await supabase
      .from('purchase_orders')
      .select('id, po_number, amount, tax_amount, currency, required_by, final_action_at, supplier_id, supplier:suppliers(id, name)')
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .order('final_action_at', { ascending: false })

    const recordedPoIds = (recorded || []).map((p: any) => p.po_id).filter(Boolean)
    const autoItems = (approvedPOs || [])
      .filter((po: any) => !recordedPoIds.includes(po.id))
      .map((po: any) => ({
        id: 'po-' + po.id,
        invoice_number: po.po_number,
        supplier: po.supplier,
        supplier_id: po.supplier_id,
        po: { po_number: po.po_number },
        po_id: po.id,
        invoice_amount: po.amount,
        tax_amount: po.tax_amount,
        currency: po.currency,
        due_date: po.required_by || new Date(
          new Date(po.final_action_at || Date.now()).getTime() + 30*24*60*60*1000
        ).toISOString().split('T')[0],
        status: 'pending',
        notes: '',
        created_at: po.final_action_at,
        isFromPO: true,
      }))

    if (filter === 'all' || filter === 'pending') {
      setPayments([...(recorded || []), ...autoItems])
    } else {
      setPayments(recorded || [])
    }
  }

  async function loadSuppliers() {
    const { data } = await supabase.from('suppliers').select('id, name')
      .eq('company_id', companyId).eq('status', 'approved')
    setSuppliers(data || [])
  }

  async function loadPOs() {
    const { data } = await supabase.from('purchase_orders').select('id, po_number')
      .eq('company_id', companyId).eq('status', 'approved')
    setPOs(data || [])
  }

  async function checkDuplicates() {
    setDupWarning(null)
    if (!form.invoice_number || !form.supplier_id) return true

    // Check 1 — exact same invoice number + supplier
    const { data: exactMatch } = await supabase
      .from('payments')
      .select('id, invoice_number, status, created_at')
      .eq('company_id', companyId)
      .eq('invoice_number', form.invoice_number)
      .eq('supplier_id', form.supplier_id)
      .not('status', 'eq', 'cancelled')

    if (exactMatch && exactMatch.length > 0) {
      const existing = exactMatch[0]
      setDupWarning(`DUPLICATE BLOCKED: Invoice "${form.invoice_number}" from this supplier already exists (Status: ${existing.status}, recorded on ${new Date(existing.created_at).toLocaleDateString()}).`)
      return false
    }

    // Check 2 — same amount + same supplier within 30 days
    if (form.invoice_amount && form.supplier_id) {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const { data: amountMatch } = await supabase
        .from('payments')
        .select('id, invoice_number, invoice_amount, created_at')
        .eq('company_id', companyId)
        .eq('supplier_id', form.supplier_id)
        .eq('invoice_amount', parseFloat(form.invoice_amount))
        .gte('created_at', thirtyDaysAgo.toISOString())
        .not('status', 'eq', 'cancelled')

      if (amountMatch && amountMatch.length > 0) {
        const existing = amountMatch[0]
        setDupWarning(`WARNING: A payment of ${form.currency} ${Number(form.invoice_amount).toLocaleString()} to this supplier was already recorded on ${new Date(existing.created_at).toLocaleDateString()} (Invoice: ${existing.invoice_number}). Please verify this is not a duplicate before proceeding.`)
        // Don't block — just warn
      }
    }

    return true
  }

  async function handleSubmit(force = false) {
    if (!form.invoice_number || !form.supplier_id || !form.invoice_amount || !form.due_date) return

    // Run duplicate check
    const canProceed = await checkDuplicates()
    if (!canProceed) return // Hard block on exact duplicate

    // If soft warning exists and not forced
    if (dupWarning && !force) return

    setLoading(true)
    const { error } = await supabase.from('payments').insert({
      company_id: companyId,
      invoice_number: form.invoice_number,
      supplier_id: form.supplier_id,
      po_id: form.po_id || null,
      invoice_amount: parseFloat(form.invoice_amount),
      tax_amount: parseFloat(form.tax_amount) || 0,
      tds_amount: parseFloat(form.tds_amount) || 0,
      currency: form.currency,
      due_date: form.due_date,
      notes: form.notes,
      status: 'pending',
      created_by: userId,
    })
    setLoading(false)
    if (error) { alert('Error: ' + error.message); return }
    setShowForm(false)
    setDupWarning(null)
    setForm({ invoice_number:'', supplier_id:'', po_id:'', invoice_amount:'', tax_amount:'', tds_amount:'0', currency:'INR', due_date:'', notes:'' })
    loadAll()
  }

  async function handlePayment() {
    if (!payForm.ref || !payForm.amount) {
      alert('Please enter amount and reference number')
      return
    }
    setLoading(true)
    const paidAmount = parseFloat(payForm.amount)
    const totalAmount = Number(payModal.invoice_amount)
    const isPartial = payForm.type === 'partial' && paidAmount < totalAmount
    const newStatus = isPartial ? 'partial' : 'paid'
    const today = new Date().toISOString().split('T')[0]
    const paymentData = {
      status: newStatus,
      paid_date: today,
      payment_method: payForm.method,
      bank_ref: payForm.ref,
      paid_by: userId,
      paid_confirmed_at: new Date().toISOString(),
      notes: isPartial
        ? `Partial: ${payModal.currency} ${paidAmount.toLocaleString()} paid. Balance: ${payModal.currency} ${(totalAmount - paidAmount).toLocaleString()}`
        : 'Fully paid',
    }

    if (String(payModal.id).startsWith('po-')) {
      const { error } = await supabase.from('payments').insert({
        company_id: companyId,
        invoice_number: payModal.invoice_number,
        supplier_id: payModal.supplier_id,
        po_id: payModal.po_id,
        invoice_amount: totalAmount,
        tax_amount: Number(payModal.tax_amount) || 0,
        tds_amount: 0,
        currency: payModal.currency,
        due_date: payModal.due_date,
        created_by: userId,
        ...paymentData,
      })
      if (error) { alert('Error: ' + error.message); setLoading(false); return }
    } else {
      const { error } = await supabase.from('payments')
        .update(paymentData).eq('id', payModal.id)
      if (error) { alert('Error: ' + error.message); setLoading(false); return }
    }

    setLoading(false)
    setPayModal(null)
    setPayForm({ amount:'', method:'NEFT', ref:'', type:'full' })
    loadAll()
  }

  const statusColor: Record<string,string> = {
    pending:'#f59e0b', paid:'#16a34a', partial:'#7c3aed',
    overdue:'#dc2626', cancelled:'#6b7280', processing:'#2563eb'
  }

  const overdueCount = payments.filter(p =>
    !['paid','cancelled'].includes(p.status) && new Date(p.due_date) < new Date()
  ).length
  const paidTotal = payments.filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.invoice_amount), 0)
  const pendingTotal = payments.filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.invoice_amount), 0)

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1200px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Payments</h1>
          <p style={{ color:'#666', fontSize:'14px' }}>Track invoices and payment records</p>
        </div>
        <button onClick={() => { setShowForm(true); setDupWarning(null) }}
          style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Record Invoice
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'24px' }}>
        {[
          { label:'Overdue Invoices', value: overdueCount, color:'#dc2626', sub:'need immediate attention' },
          { label:'Pending Amount', value: `₹${pendingTotal.toLocaleString()}`, color:'#f59e0b', sub:'awaiting payment' },
          { label:'Paid This Period', value: `₹${paidTotal.toLocaleString()}`, color:'#16a34a', sub:'successfully processed' },
        ].map(s => (
          <div key={s.label} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'20px' }}>
            <div style={{ fontSize:'12px', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'8px' }}>{s.label}</div>
            <div style={{ fontSize:'26px', fontWeight:'700', color:s.color }}>{s.value}</div>
            <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'4px' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
        {[['all','All'],['pending','Pending'],['partial','Partial'],['paid','Paid'],['overdue','Overdue']].map(([val,label]) => (
          <button key={val} onClick={() => setFilter(val)}
            style={{ padding:'6px 14px', borderRadius:'20px', border:'1px solid #e5e7eb', background:filter===val?'#9B72F5':'#fff', color:filter===val?'#fff':'#374151', fontSize:'13px', cursor:'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              {['Invoice #','Supplier','PO Ref','Amount','Due Date','Status','Actions'].map(h => (
                <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>No invoices yet.</td></tr>
            ) : payments.map(p => {
              const isOverdue = !['paid','cancelled'].includes(p.status) && new Date(p.due_date) < new Date()
              return (
                <tr key={p.id} style={{ borderBottom:'1px solid #f3f4f6', background:isOverdue?'#fff7f7':'white' }}>
                  <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:'12px' }}>
                    {p.invoice_number}
                    {p.isFromPO && <span style={{ marginLeft:'6px', fontSize:'10px', background:'#ede9fe', color:'#7c3aed', padding:'1px 5px', borderRadius:'4px' }}>PO</span>}
                  </td>
                  <td style={{ padding:'12px 16px', fontWeight:'500' }}>{(p.supplier as any)?.name}</td>
                  <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{(p.po as any)?.po_number || '—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontWeight:'600' }}>{p.currency} {Number(p.invoice_amount).toLocaleString()}</div>
                    {p.status === 'partial' && p.notes && (
                      <div style={{ fontSize:'11px', color:'#7c3aed', marginTop:'2px' }}>{p.notes.split('.')[0]}</div>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px', color:isOverdue?'#dc2626':'#6b7280', fontWeight:isOverdue?'600':'400' }}>
                    {new Date(p.due_date).toLocaleDateString()}
                    {isOverdue && <span style={{ fontSize:'11px', display:'block' }}>OVERDUE</span>}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'500', background:(statusColor[p.status]||'#6b7280')+'20', color:statusColor[p.status]||'#6b7280' }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    {!['paid','cancelled'].includes(p.status) && (
                      <button onClick={() => { setPayModal(p); setPayForm({ amount:String(p.invoice_amount), method:'NEFT', ref:'', type:'full' }) }}
                        style={{ fontSize:'12px', padding:'5px 12px', border:'none', borderRadius:'6px', background:p.status==='partial'?'#7c3aed':'#9B72F5', color:'#fff', cursor:'pointer' }}>
                        {p.status === 'partial' ? 'Pay Balance' : 'Pay'}
                      </button>
                    )}
                    {p.status === 'paid' && <span style={{ fontSize:'12px', color:'#16a34a' }}>✓ {p.paid_date}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Record Invoice Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'560px', maxWidth:'94vw', maxHeight:'90vh', overflowY:'auto', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600' }}>Record Invoice</h2>
              <button onClick={() => { setShowForm(false); setDupWarning(null) }} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>

            {/* Duplicate Warning */}
            {dupWarning && (
              <div style={{ padding:'12px 14px', borderRadius:'8px', marginBottom:'16px', fontSize:'13px',
                background: dupWarning.startsWith('DUPLICATE BLOCKED') ? '#fef2f2' : '#fffbeb',
                border: `1px solid ${dupWarning.startsWith('DUPLICATE BLOCKED') ? '#fecaca' : '#fde68a'}`,
                color: dupWarning.startsWith('DUPLICATE BLOCKED') ? '#dc2626' : '#92400e'
              }}>
                <div style={{ fontWeight:'600', marginBottom:'4px' }}>
                  {dupWarning.startsWith('DUPLICATE BLOCKED') ? '🚫 Duplicate Invoice Blocked' : '⚠️ Possible Duplicate Detected'}
                </div>
                <div>{dupWarning}</div>
                {!dupWarning.startsWith('DUPLICATE BLOCKED') && (
                  <button onClick={() => handleSubmit(true)}
                    style={{ marginTop:'10px', padding:'6px 14px', border:'1px solid #f59e0b', borderRadius:'6px', background:'#fff', fontSize:'12px', cursor:'pointer', color:'#92400e', fontWeight:'500' }}>
                    I confirm this is NOT a duplicate — proceed anyway
                  </button>
                )}
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Invoice Number *</label>
                <input style={inp} value={form.invoice_number}
                  onChange={e => { setForm({...form, invoice_number:e.target.value}); setDupWarning(null) }}
                  onBlur={() => checkDuplicates()}
                  placeholder="INV-2025-0001"/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Supplier *</label>
                <select style={inp} value={form.supplier_id}
                  onChange={e => { setForm({...form, supplier_id:e.target.value}); setDupWarning(null) }}>
                  <option value="">Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>PO Reference (optional)</label>
                <select style={inp} value={form.po_id} onChange={e => setForm({...form, po_id:e.target.value})}>
                  <option value="">Select PO...</option>
                  {pos.map(p => <option key={p.id} value={p.id}>{p.po_number}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Invoice Amount *</label>
                <input style={inp} type="number" value={form.invoice_amount}
                  onChange={e => { setForm({...form, invoice_amount:e.target.value}); setDupWarning(null) }}
                  onBlur={() => checkDuplicates()}
                  placeholder="0"/>
              </div>
              <div>
                <label style={lbl}>Currency</label>
                <select style={inp} value={form.currency} onChange={e => setForm({...form, currency:e.target.value})}>
                  {['INR','USD','EUR','GBP','AED','SGD','AUD','CAD','JPY','MYR'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>GST Amount</label>
                <input style={inp} type="number" value={form.tax_amount} onChange={e => setForm({...form, tax_amount:e.target.value})} placeholder="0"/>
              </div>
              <div>
                <label style={lbl}>TDS Amount</label>
                <input style={inp} type="number" value={form.tds_amount} onChange={e => setForm({...form, tds_amount:e.target.value})} placeholder="0"/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Due Date *</label>
                <input style={inp} type="date" value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})}/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Notes</label>
                <textarea style={{...inp, height:'60px', resize:'vertical'}} value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Any additional notes..."/>
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
              <button onClick={() => { setShowForm(false); setDupWarning(null) }}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>Cancel</button>
              <button onClick={() => handleSubmit(false)}
                disabled={loading || !form.invoice_number || !form.supplier_id || !form.invoice_amount || !form.due_date || dupWarning?.startsWith('DUPLICATE BLOCKED')}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', background:'#9B72F5', color:'#fff', fontSize:'14px', fontWeight:'500', cursor:'pointer',
                  opacity: dupWarning?.startsWith('DUPLICATE BLOCKED') ? 0.4 : 1 }}>
                {loading ? 'Saving...' : 'Record Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {payModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'460px', maxWidth:'94vw', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600' }}>Record Payment</h2>
              <button onClick={() => setPayModal(null)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <div style={{ padding:'12px', background:'#f9fafb', borderRadius:'8px', marginBottom:'16px', fontSize:'13px' }}>
              <div style={{ fontWeight:'600' }}>{payModal.invoice_number}</div>
              <div style={{ color:'#6b7280', marginTop:'2px' }}>Total: {payModal.currency} {Number(payModal.invoice_amount).toLocaleString()}</div>
            </div>
            <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
              {[['full','Full Payment'],['partial','Partial Payment']].map(([val,label]) => (
                <button key={val} onClick={() => setPayForm({...payForm, type:val, amount:val==='full'?String(payModal.invoice_amount):''})}
                  style={{ flex:1, padding:'8px', borderRadius:'8px', border:`2px solid ${payForm.type===val?'#9B72F5':'#e5e7eb'}`, background:payForm.type===val?'#f5f3ff':'#fff', color:payForm.type===val?'#7c3aed':'#374151', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display:'grid', gap:'12px' }}>
              <div>
                <label style={lbl}>{payForm.type === 'partial' ? 'Amount Paying Now *' : 'Amount *'}</label>
                <input style={inp} type="number" value={payForm.amount}
                  onChange={e => setPayForm({...payForm, amount:e.target.value})}
                  readOnly={payForm.type === 'full'} placeholder="0"/>
                {payForm.type === 'partial' && payForm.amount && (
                  <div style={{ fontSize:'11px', color:'#7c3aed', marginTop:'4px' }}>
                    Balance: {payModal.currency} {(Number(payModal.invoice_amount) - parseFloat(payForm.amount||'0')).toLocaleString()}
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>Payment Method *</label>
                <select style={inp} value={payForm.method} onChange={e => setPayForm({...payForm, method:e.target.value})}>
                  {['NEFT','RTGS','IMPS','Cheque','Wire Transfer','UPI'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Transaction Reference (UTR / Cheque No.) *</label>
                <input style={inp} value={payForm.ref} onChange={e => setPayForm({...payForm, ref:e.target.value})} placeholder="e.g. UTR123456789"/>
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'20px' }}>
              <button onClick={() => setPayModal(null)} style={{ flex:1, padding:'10px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>Cancel</button>
              <button onClick={handlePayment} disabled={loading || !payForm.ref || !payForm.amount}
                style={{ flex:1, padding:'10px', border:'none', borderRadius:'8px', background:payForm.type==='partial'?'#7c3aed':'#9B72F5', color:'#fff', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
                {loading ? 'Processing...' : payForm.type === 'partial' ? 'Partial Payment' : 'Mark as Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}