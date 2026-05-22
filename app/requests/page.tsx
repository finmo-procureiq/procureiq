'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { logAction } from '@/lib/audit'
import { getActiveCompanyId } from '@/lib/company'

const DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin']

export default function RequestsPage() {
  const [pos, setPOs] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingPO, setEditingPO] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyCode, setCompanyCode] = useState('')
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<any>(null)
  const [approverNote, setApproverNote] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [viewDocs, setViewDocs] = useState<any[]>([])
  const [viewingPO, setViewingPO] = useState<any>(null)
  const [amendHistory, setAmendHistory] = useState<any>(null)
  const [form, setForm] = useState({
    supplier_id:'', category:'', description:'',
    amount:'', currency:'INR', priority:'normal',
    tax_rate:'18', required_by:'', department:'', notes:''
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])
  useEffect(() => { if (companyId) { loadPOs(); loadSuppliers() } }, [companyId, filter])

  async function init() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: prof } = await supabase
        .from('user_profiles').select('full_name, email').eq('id', user.id).single()
      setProfile(prof)
      const savedId = localStorage.getItem('activeCompanyId')
      const { data: memberships } = await supabase
        .from('company_members')
        .select('company_id, company:companies(id, name, code, currency)')
        .eq('user_id', user.id).eq('is_active', true)
      if (!memberships?.length) return
      const companies = memberships.map((m: any) => m.company)
      const active = companies.find((c: any) => c.id === savedId) || companies[0]
      setCompanyId(active.id)
      setCompanyName(active.name)
      setCompanyCode(active.code)
      setForm(f => ({ ...f, currency: active.currency || 'INR' }))
    } catch(e) { console.error(e) }
  }

  async function loadPOs() {
    try {
      let query = supabase.from('purchase_orders')
        .select('*, supplier:suppliers(name), company:companies(name, code)')
        .eq('company_id', companyId)
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
      if (filter !== 'all') query = query.eq('status', filter)
      const { data } = await query
      setPOs(data || [])
    } catch(e) { console.error(e) }
  }

  async function loadSuppliers() {
    const { data } = await supabase.from('suppliers').select('id, name, category')
      .eq('company_id', companyId).eq('status', 'approved')
    setSuppliers(data || [])
  }

  async function handleSubmit() {
    if (!form.supplier_id || !form.category || !form.description || !form.amount || !form.department) return
    setLoading(true)
    const amount = parseFloat(form.amount)
    const taxRate = parseFloat(form.tax_rate) || 18
    const taxAmount = parseFloat((amount * taxRate / 100).toFixed(2))

    if (editingPO) {
      // Amendment — update existing PO
      const oldValues = {
        amount: editingPO.amount,
        description: editingPO.description,
        supplier_id: editingPO.supplier_id,
        category: editingPO.category,
        department: editingPO.cost_center,
        tax_rate: editingPO.tax_rate,
      }
      const { error } = await supabase.from('purchase_orders').update({
        supplier_id: form.supplier_id,
        category: form.category,
        description: form.description,
        amount, currency: form.currency,
        tax_rate: taxRate, tax_amount: taxAmount,
        priority: form.priority,
        required_by: form.required_by || null,
        cost_center: form.department,
        notes: form.notes,
        status: 'draft',
        amendment_count: (editingPO.amendment_count || 0) + 1,
        last_amended_at: new Date().toISOString(),
      }).eq('id', editingPO.id)
      if (error) { alert('Error: ' + error.message); setLoading(false); return }
      await logAction({
        company_id: companyId, user_id: userId,
        user_name: profile?.full_name || '', user_email: profile?.email || '',
        action: 'UPDATE', entity_type: 'purchase_order', entity_ref: editingPO.po_number,
        old_values: oldValues,
        new_values: { amount, description: form.description, category: form.category, department: form.department, tax_rate: taxRate },
        severity: 'warning'
      })
    } else {
      // New PO
      const { count } = await supabase.from('purchase_orders')
        .select('*', { count:'exact', head:true }).eq('company_id', companyId)
      const poNumber = `${companyCode}-PO-${new Date().getFullYear()}-${String((count||0)+1).padStart(5,'0')}`
      const { data: po, error } = await supabase.from('purchase_orders').insert({
        company_id: companyId,
        po_number: poNumber,
        supplier_id: form.supplier_id,
        category: form.category,
        description: form.description,
        amount, currency: form.currency,
        tax_rate: taxRate, tax_amount: taxAmount,
        priority: form.priority,
        required_by: form.required_by || null,
        cost_center: form.department,
        notes: form.notes,
        status: 'draft', created_by: userId,
        amendment_count: 0,
      }).select().single()
      if (error) { alert('Error: ' + error.message); setLoading(false); return }
      if (attachedFiles.length > 0 && po) {
        setUploadingDocs(true)
        for (const file of attachedFiles) {
          const path = `purchase_orders/${po.id}/${Date.now()}_${file.name}`
          await supabase.storage.from('procureiq-docs').upload(path, file)
        }
        setUploadingDocs(false)
      }
      await logAction({
        company_id: companyId, user_id: userId,
        user_name: profile?.full_name || '', user_email: profile?.email || '',
        action: 'CREATE', entity_type: 'purchase_order', entity_ref: poNumber,
        new_values: { amount, tax_rate: taxRate, category: form.category, department: form.department, status: 'draft' }
      })
    }

    setLoading(false)
    setShowForm(false)
    setEditingPO(null)
    setAttachedFiles([])
    setForm(f => ({ ...f, supplier_id:'', category:'', description:'', amount:'', priority:'normal', tax_rate:'18', required_by:'', department:'', notes:'' }))
    setApproverNote('')
    loadPOs()
  }

  async function recallPO(po: any) {
    if (!confirm(`Recall ${po.po_number}? It will be moved back to Draft so you can edit and resubmit.`)) return
    await supabase.from('purchase_orders').update({
      status: 'draft',
      current_level: null,
      submitted_at: null,
    }).eq('id', po.id)
    await logAction({
      company_id: companyId, user_id: userId,
      user_name: profile?.full_name || '', user_email: profile?.email || '',
      action: 'RECALL', entity_type: 'purchase_order', entity_ref: po.po_number,
      new_values: { status: 'draft', reason: 'Recalled by maker for amendment' },
      severity: 'warning'
    })
    loadPOs()
  }

  function openAmend(po: any) {
    setEditingPO(po)
    setForm({
      supplier_id: po.supplier_id || '',
      category: po.category || '',
      description: po.description || '',
      amount: String(po.amount || ''),
      currency: po.currency || 'INR',
      priority: po.priority || 'normal',
      tax_rate: String(po.tax_rate || '18'),
      required_by: po.required_by || '',
      department: po.cost_center || '',
      notes: po.notes || '',
    })
    setShowForm(true)
  }

  async function submitForApproval(id: string, poNumber: string) {
    await supabase.from('purchase_orders').update({
      status: 'pending_l1', current_level: 'L1',
      submitted_at: new Date().toISOString()
    }).eq('id', id)
    await logAction({
      company_id: companyId, user_id: userId,
      user_name: profile?.full_name || '', user_email: profile?.email || '',
      action: 'SUBMIT', entity_type: 'purchase_order', entity_ref: poNumber,
      new_values: { status: 'pending_l1' }
    })
    const po = pos.find(p => p.id === id)
    if (po) {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'po_submitted',
          data: { po: { ...po, supplier_name: (po.supplier as any)?.name }, makerEmail: profile?.email }
        })
      })
    }
    loadPOs()
  }

  async function loadPODocs(poId: string) {
    const { data } = await supabase.storage.from('procureiq-docs').list(`purchase_orders/${poId}`)
    setViewDocs(data || [])
  }

  async function getDocUrl(poId: string, fileName: string) {
    const { data } = await supabase.storage.from('procureiq-docs')
      .createSignedUrl(`purchase_orders/${poId}/${fileName}`, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function uploadMoreDocs(poId: string, file: File) {
    const path = `purchase_orders/${poId}/${Date.now()}_${file.name}`
    await supabase.storage.from('procureiq-docs').upload(path, file)
    loadPODocs(poId)
  }

  function removeAttachedFile(index: number) {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const statusColor: Record<string,string> = {
    draft:'#6b7280', pending_l1:'#f59e0b', pending_l2:'#f59e0b',
    pending_l3:'#f59e0b', approved:'#16a34a', rejected:'#dc2626', recalled:'#7c3aed'
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }
  const isFormValid = form.supplier_id && form.category && form.description && form.amount && form.department

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1300px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>My Requests</h1>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <p style={{ color:'#666', fontSize:'14px', margin:0 }}>Purchase orders you have created</p>
            {companyName && (
              <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:'#ede9fe', color:'#7c3aed' }}>
                {companyCode} — {companyName}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => { setEditingPO(null); setShowForm(true) }}
          style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + New Request
        </button>
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
        {[['all','All'],['draft','Draft'],['pending_l1','Pending'],['approved','Approved'],['rejected','Rejected']].map(([val,label]) => (
          <button key={val} onClick={() => setFilter(val)}
            style={{ padding:'6px 14px', borderRadius:'20px', border:'1px solid #e5e7eb', background:filter===val?'#9B72F5':'#fff', color:filter===val?'#fff':'#374151', fontSize:'13px', cursor:'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              {['PO Number','Dept','Supplier','Amount','Total','Status','Priority','Date','Actions'].map(h => (
                <th key={h} style={{ padding:'12px 14px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pos.length === 0 ? (
              <tr><td colSpan={9} style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>No requests yet. Click "+ New Request" to create your first PO.</td></tr>
            ) : pos.map(po => (
              <tr key={po.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ fontFamily:'monospace', fontSize:'12px', fontWeight:'600' }}>{po.po_number}</div>
                  {(po.amendment_count > 0) && (
                    <span style={{ fontSize:'10px', background:'#ede9fe', color:'#7c3aed', padding:'1px 5px', borderRadius:'4px' }}>
                      Amended x{po.amendment_count}
                    </span>
                  )}
                </td>
                <td style={{ padding:'10px 14px', color:'#6b7280', fontSize:'12px' }}>{po.cost_center || '—'}</td>
                <td style={{ padding:'10px 14px', fontWeight:'500' }}>{(po.supplier as any)?.name || '—'}</td>
                <td style={{ padding:'10px 14px' }}>{po.currency} {Number(po.amount).toLocaleString()}</td>
                <td style={{ padding:'10px 14px', fontWeight:'600', color:'#3C2B5A' }}>{po.currency} {Number(po.total_amount).toLocaleString()}</td>
                <td style={{ padding:'10px 14px' }}>
                  <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'500', background:(statusColor[po.status]||'#6b7280')+'20', color:statusColor[po.status]||'#6b7280' }}>
                    {po.status.replace(/_/g,' ')}
                  </span>
                </td>
                <td style={{ padding:'10px 14px', color:'#6b7280', textTransform:'capitalize', fontSize:'12px' }}>{po.priority}</td>
                <td style={{ padding:'10px 14px', color:'#6b7280', fontSize:'12px' }}>{new Date(po.created_at).toLocaleDateString()}</td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                    {po.status === 'draft' && (
                      <>
                        <button onClick={() => submitForApproval(po.id, po.po_number)}
                          style={{ fontSize:'11px', padding:'4px 8px', border:'none', borderRadius:'6px', background:'#9B72F5', color:'#fff', cursor:'pointer' }}>
                          Submit
                        </button>
                        <button onClick={() => openAmend(po)}
                          style={{ fontSize:'11px', padding:'4px 8px', border:'1px solid #9B72F5', borderRadius:'6px', background:'#fff', color:'#9B72F5', cursor:'pointer' }}>
                          Edit
                        </button>
                      </>
                    )}
                    {['pending_l1','pending_l2','pending_l3'].includes(po.status) && (
                      <button onClick={() => recallPO(po)}
                        style={{ fontSize:'11px', padding:'4px 8px', border:'1px solid #f59e0b', borderRadius:'6px', background:'#fffbeb', color:'#b45309', cursor:'pointer' }}>
                        Recall
                      </button>
                    )}
                    <button onClick={() => { setViewingPO(po); loadPODocs(po.id) }}
                      style={{ fontSize:'11px', padding:'4px 8px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'#fff', cursor:'pointer' }}>
                      Docs
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New / Edit Request Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'620px', maxWidth:'94vw', maxHeight:'90vh', overflowY:'auto', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <div>
                <h2 style={{ fontSize:'18px', fontWeight:'600', marginBottom:'2px' }}>
                  {editingPO ? `Amend PO — ${editingPO.po_number}` : 'New Purchase Request'}
                </h2>
                <div style={{ fontSize:'12px', color:'#6b7280' }}>
                  {editingPO
                    ? <span style={{ color:'#7c3aed', fontWeight:'500' }}>Amendment #{(editingPO.amendment_count||0)+1} — changes will be logged in audit trail</span>
                    : `Creating for ${companyName}`}
                </div>
              </div>
              <button onClick={() => { setShowForm(false); setEditingPO(null); setAttachedFiles([]) }}
                style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>

            {editingPO && (
              <div style={{ padding:'10px 14px', background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:'8px', marginBottom:'16px', fontSize:'12px', color:'#5b21b6' }}>
                Original values — Amount: {editingPO.currency} {Number(editingPO.amount).toLocaleString()} · Category: {editingPO.category} · Dept: {editingPO.cost_center || '—'}
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ ...lbl, color:'#374151' }}>Department *</label>
                <select style={{ ...inp, border: !form.department ? '1px solid #f87171' : '1px solid #d1d5db' }}
                  value={form.department} onChange={e => setForm({...form, department:e.target.value})}>
                  <option value="">Select your department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {!form.department && <p style={{ fontSize:'11px', color:'#dc2626', marginTop:'3px' }}>Please select a department</p>}
              </div>

              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Supplier *</label>
                <select style={inp} value={form.supplier_id} onChange={e => setForm({...form, supplier_id:e.target.value})}>
                  <option value="">Select approved supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} — {s.category}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>Category *</label>
                <select style={inp} value={form.category} onChange={e => setForm({...form, category:e.target.value})}>
                  <option value="">Select...</option>
                  {['IT & Software','Raw Materials','Logistics','Office Supplies','Professional Services','Manufacturing','Other'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>Priority</label>
                <select style={inp} value={form.priority} onChange={e => setForm({...form, priority:e.target.value})}>
                  {['low','normal','high','urgent','emergency'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                </select>
              </div>

              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Description *</label>
                <textarea style={{...inp, height:'70px', resize:'vertical'}} value={form.description}
                  onChange={e => setForm({...form, description:e.target.value})} placeholder="Describe what you are purchasing..."/>
              </div>

              <div>
                <label style={lbl}>Amount *</label>
                <input style={inp} type="number" value={form.amount} onChange={e => {
                  setForm({...form, amount:e.target.value})
                  const amt = parseFloat(e.target.value) || 0
                  if (amt < 50000) setApproverNote('L1 — Dept Head approval')
                  else if (amt < 500000) setApproverNote('L1 + L2 — Finance Manager')
                  else setApproverNote('L1 + L2 + L3 — CFO')
                }} placeholder="0"/>
              </div>

              <div>
                <label style={lbl}>Currency</label>
                <select style={inp} value={form.currency} onChange={e => setForm({...form, currency:e.target.value})}>
                  {['INR','USD','EUR','GBP','AED','SGD','AUD','CAD','JPY','MYR'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>GST Rate</label>
                <select style={inp} value={form.tax_rate} onChange={e => setForm({...form, tax_rate:e.target.value})}>
                  <option value="0">0% — Exempt</option>
                  <option value="5">5% GST</option>
                  <option value="12">12% GST</option>
                  <option value="18">18% GST</option>
                  <option value="28">28% GST</option>
                </select>
              </div>

              <div>
                <label style={lbl}>Tax Amount (auto)</label>
                <input style={{...inp, background:'#f9fafb', color:'#6b7280'}} readOnly
                  value={form.amount ? `${form.currency} ${(parseFloat(form.amount||'0') * parseFloat(form.tax_rate||'18') / 100).toLocaleString()}` : '—'}/>
              </div>

              {form.amount && (
                <div style={{ gridColumn:'1/-1', padding:'10px 12px', background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:'8px', fontSize:'13px' }}>
                  <span style={{ fontWeight:'600', color:'#7c3aed' }}>
                    Total: {form.currency} {(parseFloat(form.amount||'0') * (1 + parseFloat(form.tax_rate||'18')/100)).toLocaleString()}
                  </span>
                  <span style={{ color:'#6b7280', marginLeft:'8px' }}>(incl. {form.tax_rate}% GST)</span>
                </div>
              )}

              {approverNote && (
                <div style={{ gridColumn:'1/-1', padding:'8px 12px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', fontSize:'12px', color:'#1d4ed8' }}>
                  Approval required: {approverNote}
                </div>
              )}

              <div>
                <label style={lbl}>Required By</label>
                <input style={inp} type="date" value={form.required_by} onChange={e => setForm({...form, required_by:e.target.value})}/>
              </div>

              <div>
                <label style={lbl}>Notes</label>
                <input style={inp} value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Any additional notes..."/>
              </div>

              {!editingPO && (
                <div style={{ gridColumn:'1/-1', borderTop:'2px solid #f3f4f6', paddingTop:'16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                    <label style={{ fontSize:'13px', fontWeight:'600', color:'#374151' }}>Supporting Documents</label>
                    <label style={{ padding:'6px 12px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'6px', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
                      + Attach Files
                      <input type="file" multiple style={{ display:'none' }}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                        onChange={e => {
                          if (e.target.files) setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)])
                        }}/>
                    </label>
                  </div>
                  {attachedFiles.length === 0 ? (
                    <div style={{ padding:'12px', background:'#f9fafb', borderRadius:'8px', textAlign:'center', fontSize:'12px', color:'#9ca3af' }}>
                      Attach quotes, purchase approvals, or any supporting documents
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                      {attachedFiles.map((file, i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#f9fafb', borderRadius:'8px', fontSize:'13px' }}>
                          <span style={{ color:'#374151' }}>{file.name} <span style={{ color:'#9ca3af', fontSize:'11px' }}>{Math.round(file.size/1024)}KB</span></span>
                          <button onClick={() => removeAttachedFile(i)}
                            style={{ padding:'2px 8px', border:'1px solid #fecaca', borderRadius:'4px', background:'#fff', fontSize:'11px', cursor:'pointer', color:'#dc2626' }}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditingPO(null); setAttachedFiles([]) }}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSubmit}
                disabled={loading || uploadingDocs || !isFormValid}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: !isFormValid ? '#c4b5fd' : '#9B72F5' }}>
                {uploadingDocs ? 'Uploading...' : loading ? 'Saving...' : editingPO ? 'Save Amendment' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View PO Documents Modal */}
      {viewingPO && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'500px', maxWidth:'94vw', maxHeight:'80vh', overflowY:'auto', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
              <div>
                <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'2px' }}>Documents</h2>
                <div style={{ fontSize:'12px', color:'#6b7280', fontFamily:'monospace' }}>{viewingPO.po_number}</div>
              </div>
              <button onClick={() => { setViewingPO(null); setViewDocs([]) }} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <div style={{ marginBottom:'12px' }}>
              <label style={{ padding:'8px 14px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'6px', fontSize:'13px', cursor:'pointer', color:'#374151' }}>
                + Attach More Documents
                <input type="file" multiple style={{ display:'none' }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  onChange={e => {
                    if (e.target.files) Array.from(e.target.files).forEach(f => uploadMoreDocs(viewingPO.id, f))
                  }}/>
              </label>
            </div>
            {viewDocs.length === 0 ? (
              <div style={{ padding:'24px', background:'#f9fafb', borderRadius:'8px', textAlign:'center', fontSize:'13px', color:'#9ca3af' }}>
                No documents attached to this PO.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {viewDocs.map(doc => (
                  <div key={doc.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:'#f9fafb', borderRadius:'8px', fontSize:'13px' }}>
                    <span style={{ color:'#374151' }}>{doc.name.replace(/^\d+_/, '')}</span>
                    <button onClick={() => getDocUrl(viewingPO.id, doc.name)}
                      style={{ padding:'4px 10px', border:'1px solid #e5e7eb', borderRadius:'4px', background:'#fff', fontSize:'12px', cursor:'pointer', color:'#7c3aed' }}>
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}