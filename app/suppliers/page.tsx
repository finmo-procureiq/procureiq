'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', contact_email: '', contact_phone: '', gstin: '',
    bank_name: '', bank_account: '', bank_ifsc: '', address: '',
    payment_terms: '30', category: '', status: 'pending'
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: member } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (member?.company_id) {
      setCompanyId(member.company_id)
      await loadSuppliers(member.company_id)
    }
    setLoading(false)
  }

  async function loadSuppliers(cid: string) {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('company_id', cid)
      .order('created_at', { ascending: false })
    setSuppliers(data || [])
  }

  async function handleSave() {
    if (!form.name || !companyId) return
    setSaving(true)

    const { error } = await supabase.from('suppliers').insert({
      company_id: companyId,
      name: form.name,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      gstin: form.gstin || null,
      bank_name: form.bank_name || null,
      bank_account: form.bank_account || null,
      bank_ifsc: form.bank_ifsc || null,
      address: form.address || null,
      payment_terms: parseInt(form.payment_terms) || 30,
      category: form.category || null,
      status: form.status,
    })

    if (error) {
      alert('Error saving supplier: ' + error.message)
    } else {
      setShowForm(false)
      setForm({ name:'', contact_email:'', contact_phone:'', gstin:'', bank_name:'', bank_account:'', bank_ifsc:'', address:'', payment_terms:'30', category:'', status:'pending' })
      await loadSuppliers(companyId)
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('suppliers').update({ status }).eq('id', id)
    if (companyId) await loadSuppliers(companyId)
  }

  const statusColor: Record<string,string> = {
    approved: '#16a34a', pending: '#f59e0b', rejected: '#dc2626', blacklisted: '#6b7280'
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading suppliers...</div>

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Suppliers</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>{suppliers.length} suppliers registered</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Add Supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'48px', textAlign:'center', color:'#9ca3af' }}>
          No suppliers yet. Click + Add Supplier to get started.
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
            <thead style={{ background:'#f9fafb' }}>
              <tr>
                {['Supplier Name','Category','Contact','GSTIN','Payment Terms','Status','Actions'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                  <td style={{ padding:'12px 16px', fontWeight:'500' }}>
                    {s.name}
                    {s.address && <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'2px' }}>{s.address}</div>}
                  </td>
                  <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{s.category || '—'}</td>
                  <td style={{ padding:'12px 16px', fontSize:'13px' }}>
                    {s.contact_email && <div style={{ color:'#6b7280' }}>{s.contact_email}</div>}
                    {s.contact_phone && <div style={{ color:'#9ca3af' }}>{s.contact_phone}</div>}
                    {!s.contact_email && !s.contact_phone && <span style={{ color:'#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px', fontFamily:'monospace' }}>{s.gstin || '—'}</td>
                  <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{s.payment_terms} days</td>
                  <td style={{ padding:'12px 16px' }}>
                    <select value={s.status} onChange={e => updateStatus(s.id, e.target.value)}
                      style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid #e5e7eb', fontSize:'12px', fontFamily:'sans-serif', cursor:'pointer',
                        background:(statusColor[s.status]||'#6b7280')+'15', color:statusColor[s.status]||'#6b7280', fontWeight:'600' }}>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="blacklisted">Blacklisted</option>
                    </select>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <button onClick={() => updateStatus(s.id, 'blacklisted')}
                      style={{ fontSize:'12px', padding:'4px 10px', border:'1px solid #fecaca', borderRadius:'6px', background:'#fff', color:'#dc2626', cursor:'pointer' }}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'560px', maxWidth:'94vw', padding:'28px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>Add New Supplier</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Supplier Name *</label>
                <input style={inp} value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="Company name"/>
              </div>
              <div>
                <label style={lbl}>Category</label>
                <input style={inp} value={form.category} onChange={e => setForm({...form, category:e.target.value})} placeholder="e.g. IT Services, Logistics"/>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={form.status} onChange={e => setForm({...form, status:e.target.value})}>
                  <option value="pending">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Contact Email</label>
                <input style={inp} type="email" value={form.contact_email} onChange={e => setForm({...form, contact_email:e.target.value})} placeholder="supplier@company.com"/>
              </div>
              <div>
                <label style={lbl}>Contact Phone</label>
                <input style={inp} value={form.contact_phone} onChange={e => setForm({...form, contact_phone:e.target.value})} placeholder="+91 98765 43210"/>
              </div>
              <div>
                <label style={lbl}>GSTIN</label>
                <input style={inp} value={form.gstin} onChange={e => setForm({...form, gstin:e.target.value})} placeholder="27AAPFU0939F1ZV"/>
              </div>
              <div>
                <label style={lbl}>Payment Terms (days)</label>
                <input style={inp} type="number" value={form.payment_terms} onChange={e => setForm({...form, payment_terms:e.target.value})} placeholder="30"/>
              </div>
              <div>
                <label style={lbl}>Bank Name</label>
                <input style={inp} value={form.bank_name} onChange={e => setForm({...form, bank_name:e.target.value})} placeholder="HDFC Bank"/>
              </div>
              <div>
                <label style={lbl}>Bank Account Number</label>
                <input style={inp} value={form.bank_account} onChange={e => setForm({...form, bank_account:e.target.value})} placeholder="1234567890"/>
              </div>
              <div>
                <label style={lbl}>IFSC Code</label>
                <input style={inp} value={form.bank_ifsc} onChange={e => setForm({...form, bank_ifsc:e.target.value})} placeholder="HDFC0001234"/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Address</label>
                <input style={inp} value={form.address} onChange={e => setForm({...form, address:e.target.value})} placeholder="Full business address"/>
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'24px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.name}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: !form.name ? '#c4b5fd' : '#9B72F5' }}>
                {saving ? 'Saving...' : 'Save Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}