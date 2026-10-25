'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [formEntityId, setFormEntityId] = useState<string>('')
  const [form, setForm] = useState({
    name: '', contact_email: '', contact_phone: '', gstin: '',
    bank_name: '', bank_account: '', bank_ifsc: '', address: '',
    payment_terms: '30', category: '', status: 'approved'
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    try {
      const cosRes = await fetch('/api/companies')
      const cosData = await cosRes.json()
      if (Array.isArray(cosData) && cosData.length > 0) {
        setCompanies(cosData)
        setFormEntityId(cosData[0].id)
      }
      await loadSuppliers()
    } catch (e) {
      console.error('init error:', e)
    }
    setLoading(false)
  }

  async function loadSuppliers() {
    try {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name, contact_email, contact_phone, gstin, bank_name, bank_account, bank_ifsc, address, payment_terms, category, status, created_at, company_id')
        .order('name')
      setSuppliers(data || [])
    } catch (e) {
      console.error('loadSuppliers error:', e)
      setSuppliers([])
    }
  }

  async function handleSave() {
    if (!form.name || !formEntityId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('suppliers').insert({
        company_id: formEntityId,
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
      if (error) { alert('Error saving supplier: ' + error.message); setSaving(false); return }
      setShowForm(false)
      setForm({ name:'', contact_email:'', contact_phone:'', gstin:'', bank_name:'', bank_account:'', bank_ifsc:'', address:'', payment_terms:'30', category:'', status:'approved' })
      await loadSuppliers()
    } catch (e: any) {
      alert('Error saving supplier: ' + e.message)
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('suppliers').update({ status }).eq('id', id)
    await loadSuppliers()
  }

  function downloadCSV() {
    const rows = filtered.map(s => [
      s.name, s.category || '', s.status,
      s.contact_email || '', s.contact_phone || '',
      s.gstin || '', s.bank_name || '', s.bank_account || '', s.bank_ifsc || '',
      `Net ${s.payment_terms} days`, s.address || '',
      companies.find(c => c.id === s.company_id)?.code || ''
    ])
    const headers = ['Name','Category','Status','Email','Phone','GSTIN','Bank','Account','IFSC','Payment Terms','Address','Entity']
    const escape = (v: any) => { const s = String(v ?? '').replace(/"/g,'""'); return /[,"\n]/.test(s)?`"${s}"`:s }
    const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`Suppliers_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const statusColor: Record<string,string> = {
    approved: '#16a34a', pending: '#f59e0b', rejected: '#dc2626', blacklisted: '#6b7280'
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  // Filter by entity tab + search
  const filtered = suppliers
    .filter(s => entityFilter === 'all' || s.company_id === entityFilter)
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.category||'').toLowerCase().includes(search.toLowerCase()))

  const approvedCount = filtered.filter(s => s.status === 'approved').length
  const pendingCount = filtered.filter(s => s.status === 'pending').length

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading suppliers...</div>

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Suppliers</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>
            {approvedCount} approved · {pendingCount} pending review
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={downloadCSV}
            style={{ padding:'9px 16px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#374151' }}>
            ⬇ Download
          </button>
          <button onClick={() => setShowForm(true)}
            style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
            + Add Supplier
          </button>
        </div>
      </div>

      {/* Search + Entity filter */}
      <div style={{ display:'flex', gap:'10px', marginBottom:'20px', flexWrap:'wrap', alignItems:'center' }}>
        <input
          placeholder="Search suppliers..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none', minWidth:'220px' }}
        />
        {/* Entity tabs — All + one per company */}
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {[{id:'all', name:'All', code:''},...companies].map(c => (
            <button key={c.id} onClick={() => setEntityFilter(c.id)}
              style={{ padding:'7px 14px', borderRadius:'20px', fontSize:'13px', fontWeight:'500', cursor:'pointer', border:'none',
                background: entityFilter === c.id ? '#9B72F5' : '#f3f4f6',
                color: entityFilter === c.id ? '#fff' : '#374151' }}>
              {c.id === 'all' ? 'All' : `${c.code}`}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'64px', textAlign:'center' }}>
          <div style={{ fontSize:'48px', marginBottom:'16px' }}>🏭</div>
          <h3 style={{ fontSize:'18px', fontWeight:'600', marginBottom:'8px', color:'#374151' }}>
            {search ? 'No suppliers match your search' : 'No suppliers yet'}
          </h3>
          <p style={{ color:'#9ca3af', marginBottom:'24px' }}>
            {search ? 'Try a different name or category' : 'Add your first supplier to get started'}
          </p>
          {!search && (
            <button onClick={() => setShowForm(true)}
              style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 20px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
              + Add Supplier
            </button>
          )}
        </div>
      ) : (
        <div className="table-scroll-wrapper" style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
            <thead style={{ background:'#f9fafb' }}>
              <tr>
                {['Supplier Name','Entity','Category','Contact','GSTIN','Bank Details','Payment Terms','Status','Actions'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const co = companies.find(c => c.id === s.company_id)
                return (
                  <tr key={s.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                    <td style={{ padding:'12px 16px', fontWeight:'500' }}>
                      {s.name}
                      {s.address && <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'2px' }}>{s.address}</div>}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      {co && <span style={{ fontSize:'11px', padding:'3px 7px', borderRadius:'10px', background:'#f3f4f6', color:'#6b7280', fontWeight:'600' }}>{co.code}</span>}
                    </td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{s.category || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:'13px' }}>
                      {s.contact_email && <div style={{ color:'#6b7280' }}>{s.contact_email}</div>}
                      {s.contact_phone && <div style={{ color:'#9ca3af', fontSize:'12px' }}>{s.contact_phone}</div>}
                      {!s.contact_email && !s.contact_phone && <span style={{ color:'#9ca3af' }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'12px', fontFamily:'monospace' }}>{s.gstin || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:'12px' }}>
                      {s.bank_name ? (
                        <div>
                          <div style={{ color:'#374151', fontWeight:'500' }}>{s.bank_name}</div>
                          {s.bank_account && <div style={{ color:'#9ca3af', fontFamily:'monospace' }}>{s.bank_account}</div>}
                          {s.bank_ifsc && <div style={{ color:'#9ca3af' }}>{s.bank_ifsc}</div>}
                        </div>
                      ) : <span style={{ color:'#9ca3af' }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>Net {s.payment_terms} days</td>
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
                      <button onClick={() => { if (confirm(`Remove ${s.name}?`)) updateStatus(s.id, 'blacklisted') }}
                        style={{ fontSize:'12px', padding:'4px 10px', border:'1px solid #fecaca', borderRadius:'6px', background:'#fff', color:'#dc2626', cursor:'pointer' }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'580px', maxWidth:'94vw', padding:'28px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>Add New Supplier</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>✕</button>
            </div>

            {companies.length > 0 && (
              <div style={{ marginBottom:'14px' }}>
                <label style={lbl}>Entity *</label>
                <select style={inp} value={formEntityId} onChange={e => setFormEntityId(e.target.value)}>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </select>
              </div>
            )}

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
                  <option value="approved">Approved</option>
                  <option value="pending">Pending Review</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Contact Email</label>
                <input style={inp} type="email" value={form.contact_email} onChange={e => setForm({...form, contact_email:e.target.value})} placeholder="supplier@company.com"/>
              </div>
              <div>
                <label style={lbl}>Contact Phone</label>
                <input style={inp} value={form.contact_phone} onChange={e => setForm({...form, contact_phone:e.target.value})} placeholder="+65 9123 4567"/>
              </div>
              <div>
                <label style={lbl}>GSTIN / Tax ID</label>
                <input style={inp} value={form.gstin} onChange={e => setForm({...form, gstin:e.target.value})} placeholder="27AAPFU0939F1ZV"/>
              </div>
              <div>
                <label style={lbl}>Payment Terms (days)</label>
                <input style={inp} type="number" value={form.payment_terms} onChange={e => setForm({...form, payment_terms:e.target.value})} placeholder="30"/>
              </div>
              <div>
                <label style={lbl}>Bank Name</label>
                <input style={inp} value={form.bank_name} onChange={e => setForm({...form, bank_name:e.target.value})} placeholder="DBS Bank"/>
              </div>
              <div>
                <label style={lbl}>Bank Account Number</label>
                <input style={inp} value={form.bank_account} onChange={e => setForm({...form, bank_account:e.target.value})} placeholder="1234567890"/>
              </div>
              <div>
                <label style={lbl}>IFSC / Swift Code</label>
                <input style={inp} value={form.bank_ifsc} onChange={e => setForm({...form, bank_ifsc:e.target.value})} placeholder="DBSSSGSG"/>
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
                  background: !form.name ? '#c4b5fd' : '#9B72F5', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
