'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { getActiveCompanyId } from '@/lib/company'

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [companyId, setCompanyId] = useState('')
  const [userId, setUserId] = useState('')
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [supplierDocs, setSupplierDocs] = useState<any[]>([])
  const [form, setForm] = useState({
    name:'', category:'', email:'', phone:'',
    contact_name:'', gstin:'', payment_terms:'30',
    credit_limit:'', bank_name:'', account_number:'', ifsc:''
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])
  useEffect(() => { if (companyId) loadSuppliers() }, [companyId, filter])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const cid = await getActiveCompanyId()
    setCompanyId(cid)
  }

  async function loadSuppliers() {
    let query = supabase.from('suppliers').select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)
    const { data } = await query
    setSuppliers(data || [])
  }

  async function loadSupplierDocs(supplierId: string) {
    const { data } = await supabase.storage
      .from('procureiq-docs')
      .list(`suppliers/${supplierId}`)
    setSupplierDocs(data || [])
  }

  async function handleSubmit() {
    if (!form.name || !form.category) return
    setLoading(true)
    const { error } = await supabase.from('suppliers').insert({
      company_id: companyId,
      name: form.name, category: form.category,
      email: form.email, phone: form.phone,
      contact_name: form.contact_name, gstin: form.gstin,
      payment_terms: parseInt(form.payment_terms) || 30,
      credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
      bank_details: { bank_name: form.bank_name, account_number: form.account_number, ifsc: form.ifsc },
      status: 'pending', created_by: userId,
    })
    setLoading(false)
    if (error) { alert('Error: ' + error.message); return }
    setShowForm(false)
    setForm({ name:'', category:'', email:'', phone:'', contact_name:'', gstin:'', payment_terms:'30', credit_limit:'', bank_name:'', account_number:'', ifsc:'' })
    loadSuppliers()
  }

  async function approveSupplier(id: string) {
    await supabase.from('suppliers').update({
      status: 'approved', approved_by: userId, approved_at: new Date().toISOString()
    }).eq('id', id)
    setSelected((prev: any) => ({ ...prev, status: 'approved' }))
    loadSuppliers()
  }

  async function handleDocUpload(supplierId: string, file: File) {
    setUploadingDoc(true)
    const path = `suppliers/${supplierId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage
      .from('procureiq-docs')
      .upload(path, file)
    setUploadingDoc(false)
    if (error) { alert('Upload error: ' + error.message); return }
    loadSupplierDocs(supplierId)
  }

  async function handleDocDelete(supplierId: string, fileName: string) {
    await supabase.storage
      .from('procureiq-docs')
      .remove([`suppliers/${supplierId}/${fileName}`])
    loadSupplierDocs(supplierId)
  }

  async function getDocUrl(supplierId: string, fileName: string) {
    const { data } = await supabase.storage
      .from('procureiq-docs')
      .createSignedUrl(`suppliers/${supplierId}/${fileName}`, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const statusColor: Record<string, string> = {
    pending: '#f59e0b', approved: '#16a34a',
    suspended: '#dc2626', blacklisted: '#7f1d1d', under_review: '#2563eb'
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1200px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Suppliers</h1>
          <p style={{ color:'#666', fontSize:'14px' }}>Manage your approved vendor list</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Add Supplier
        </button>
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
        {[['all','All'],['approved','Approved'],['pending','Pending'],['under_review','Under Review'],['blacklisted','Blacklisted']].map(([val,label]) => (
          <button key={val} onClick={() => setFilter(val)}
            style={{ padding:'6px 14px', borderRadius:'20px', border:'1px solid #e5e7eb', background:filter===val?'#2563eb':'#fff', color:filter===val?'#fff':'#374151', fontSize:'13px', cursor:'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              {['Supplier','Category','Contact','GSTIN','Payment Terms','Status','Actions'].map(h => (
                <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>No suppliers yet. Click "+ Add Supplier" to get started.</td></tr>
            ) : suppliers.map(s => (
              <tr key={s.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                <td style={{ padding:'12px 16px', fontWeight:'500' }}>{s.name}</td>
                <td style={{ padding:'12px 16px', color:'#6b7280' }}>{s.category}</td>
                <td style={{ padding:'12px 16px', color:'#6b7280' }}>{s.contact_name || '—'}</td>
                <td style={{ padding:'12px 16px', color:'#6b7280', fontFamily:'monospace', fontSize:'12px' }}>{s.gstin || '—'}</td>
                <td style={{ padding:'12px 16px', color:'#6b7280' }}>Net {s.payment_terms}</td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'500', background:(statusColor[s.status]||'#6b7280')+'20', color:statusColor[s.status]||'#6b7280' }}>
                    {s.status.replace('_',' ')}
                  </span>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <button onClick={() => { setSelected(s); loadSupplierDocs(s.id) }}
                    style={{ fontSize:'12px', padding:'4px 10px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'#fff', cursor:'pointer' }}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Supplier Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'560px', maxWidth:'94vw', maxHeight:'90vh', overflowY:'auto', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600' }}>Add New Supplier</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Company Name *</label><input style={inp} value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="e.g. Tata Steel Ltd"/></div>
              <div><label style={lbl}>Category *</label>
                <select style={inp} value={form.category} onChange={e => setForm({...form, category:e.target.value})}>
                  <option value="">Select...</option>
                  {['IT & Software','Raw Materials','Logistics','Office Supplies','Professional Services','Manufacturing','Other'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Payment Terms</label>
                <select style={inp} value={form.payment_terms} onChange={e => setForm({...form, payment_terms:e.target.value})}>
                  <option value="15">Net 15</option><option value="30">Net 30</option>
                  <option value="45">Net 45</option><option value="60">Net 60</option>
                </select>
              </div>
              <div><label style={lbl}>Contact Name</label><input style={inp} value={form.contact_name} onChange={e => setForm({...form, contact_name:e.target.value})} placeholder="Primary contact"/></div>
              <div><label style={lbl}>Email</label><input style={inp} type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} placeholder="contact@company.com"/></div>
              <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} placeholder="+91 98765 43210"/></div>
              <div><label style={lbl}>GSTIN</label><input style={inp} value={form.gstin} onChange={e => setForm({...form, gstin:e.target.value})} placeholder="22AAAAA0000A1Z5"/></div>
              <div><label style={lbl}>Credit Limit</label><input style={inp} type="number" value={form.credit_limit} onChange={e => setForm({...form, credit_limit:e.target.value})} placeholder="500000"/></div>
              <div style={{ gridColumn:'1/-1', paddingTop:'12px', borderTop:'1px solid #f3f4f6' }}>
                <p style={{ fontSize:'12px', fontWeight:'600', color:'#6b7280', marginBottom:'10px' }}>BANK DETAILS</p>
              </div>
              <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Bank Name</label><input style={inp} value={form.bank_name} onChange={e => setForm({...form, bank_name:e.target.value})} placeholder="State Bank of India"/></div>
              <div><label style={lbl}>Account Number</label><input style={inp} value={form.account_number} onChange={e => setForm({...form, account_number:e.target.value})} placeholder="Account number"/></div>
              <div><label style={lbl}>IFSC Code</label><input style={inp} value={form.ifsc} onChange={e => setForm({...form, ifsc:e.target.value})} placeholder="SBIN0001234"/></div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={loading || !form.name || !form.category}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', background:loading||!form.name||!form.category?'#93c5fd':'#2563eb', color:'#fff', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
                {loading ? 'Saving...' : 'Add Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Supplier Modal */}
      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'560px', maxWidth:'94vw', maxHeight:'90vh', overflowY:'auto', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600' }}>{selected.name}</h2>
              <button onClick={() => { setSelected(null); setSupplierDocs([]) }} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>

            {/* Supplier Details */}
            <div style={{ display:'grid', gap:'2px', fontSize:'14px', marginBottom:'20px' }}>
              {[
                ['Category', selected.category],
                ['Status', selected.status],
                ['Contact', selected.contact_name || '—'],
                ['Email', selected.email || '—'],
                ['Phone', selected.phone || '—'],
                ['GSTIN', selected.gstin || '—'],
                ['Payment Terms', `Net ${selected.payment_terms}`],
                ['Credit Limit', selected.credit_limit ? `₹${Number(selected.credit_limit).toLocaleString()}` : '—'],
                ['Bank', selected.bank_details?.bank_name || '—'],
                ['Account', selected.bank_details?.account_number || '—'],
                ['IFSC', selected.bank_details?.ifsc || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
                  <span style={{ color:'#6b7280' }}>{label}</span>
                  <span style={{ fontWeight:'500' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Documents Section */}
            <div style={{ borderTop:'2px solid #f3f4f6', paddingTop:'16px', marginBottom:'16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151' }}>Documents</div>
                <label style={{ padding:'6px 12px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'6px', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
                  {uploadingDoc ? 'Uploading...' : '+ Attach File'}
                  <input type="file" style={{ display:'none' }}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    onChange={e => { if (e.target.files?.[0]) handleDocUpload(selected.id, e.target.files[0]) }}/>
                </label>
              </div>

              {supplierDocs.length === 0 ? (
                <div style={{ padding:'16px', background:'#f9fafb', borderRadius:'8px', textAlign:'center', fontSize:'13px', color:'#9ca3af' }}>
                  No documents attached. Upload contracts, NDAs, registration certificates etc.
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {supplierDocs.map(doc => (
                    <div key={doc.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#f9fafb', borderRadius:'8px', fontSize:'13px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                        <span style={{ fontSize:'16px' }}>
                          {doc.name.endsWith('.pdf') ? '📄' : doc.name.match(/\.(jpg|jpeg|png)$/i) ? '🖼️' : '📎'}
                        </span>
                        <span style={{ color:'#374151' }}>{doc.name.replace(/^\d+_/, '')}</span>
                        <span style={{ fontSize:'11px', color:'#9ca3af' }}>
                          {doc.metadata?.size ? `${Math.round(doc.metadata.size / 1024)}KB` : ''}
                        </span>
                      </div>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button onClick={() => getDocUrl(selected.id, doc.name)}
                          style={{ padding:'3px 8px', border:'1px solid #e5e7eb', borderRadius:'4px', background:'#fff', fontSize:'11px', cursor:'pointer', color:'#2563eb' }}>
                          View
                        </button>
                        <button onClick={() => handleDocDelete(selected.id, doc.name)}
                          style={{ padding:'3px 8px', border:'1px solid #fecaca', borderRadius:'4px', background:'#fff', fontSize:'11px', cursor:'pointer', color:'#dc2626' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize:'11px', color:'#9ca3af', marginTop:'8px' }}>
                Accepted: PDF, Word, Excel, Images (max 50MB each)
              </p>
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => { setSelected(null); setSupplierDocs([]) }}
                style={{ flex:1, padding:'9px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Close
              </button>
              {selected.status === 'pending' && (
                <button onClick={() => approveSupplier(selected.id)}
                  style={{ flex:1, padding:'9px', border:'none', borderRadius:'8px', background:'#16a34a', color:'#fff', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
                  Approve Supplier
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}