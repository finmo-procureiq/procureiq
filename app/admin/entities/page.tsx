'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

export default function EntitiesPage() {
  const [companies, setCompanies] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState('')
  const [form, setForm] = useState({
    name:'', legal_name:'', code:'', country:'',
    currency:'INR', gstin:'', address:''
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    loadCompanies()
  }

  async function loadCompanies() {
    const { data } = await supabase.from('companies')
      .select('*').order('created_at')
    setCompanies(data || [])
  }

  async function handleSubmit() {
    if (!form.name || !form.code || !form.country || !form.currency) {
      alert('Please fill in all required fields')
      return
    }
    setLoading(true)
    const { data: company, error } = await supabase.from('companies').insert({
      name: form.name,
      legal_name: form.legal_name || null,
      code: form.code.toUpperCase(),
      country: form.country,
      currency: form.currency,
      gstin: form.gstin || null,
      address: form.address ? { line1: form.address } : {},
      created_by: userId,
    }).select().single()

    if (error) { alert('Error: ' + error.message); setLoading(false); return }

    // Create default roles for new entity
    const roles = [
      { name:'Super Admin', code:'SUPER_ADMIN', permissions:{ can_create_po:true, can_approve_po:true, can_approve_supplier:true, can_approve_payment:true, can_manage_users:true, can_view_reports:true, can_export_audit:true, approval_level:'L5' }},
      { name:'Maker', code:'MAKER', permissions:{ can_create_po:true, can_approve_po:false, can_approve_supplier:false, can_approve_payment:false, can_manage_users:false, can_view_reports:true, can_export_audit:false }},
      { name:'L1 Dept Head', code:'L1_CHECKER', permissions:{ can_create_po:true, can_approve_po:true, can_approve_supplier:false, can_approve_payment:false, can_manage_users:false, can_view_reports:true, can_export_audit:false, approval_level:'L1', spend_limit:50000 }},
      { name:'L2 Finance Manager', code:'L2_CHECKER', permissions:{ can_create_po:true, can_approve_po:true, can_approve_supplier:true, can_approve_payment:true, can_manage_users:false, can_view_reports:true, can_export_audit:false, approval_level:'L2', spend_limit:500000 }},
      { name:'L3 CFO', code:'L3_CHECKER', permissions:{ can_create_po:true, can_approve_po:true, can_approve_supplier:true, can_approve_payment:true, can_manage_users:true, can_view_reports:true, can_export_audit:true, approval_level:'L3' }},
      { name:'Viewer', code:'VIEWER', permissions:{ can_create_po:false, can_approve_po:false, can_approve_supplier:false, can_approve_payment:false, can_manage_users:false, can_view_reports:true, can_export_audit:false }},
    ]

    await supabase.from('roles').insert(
      roles.map(r => ({ company_id: company.id, name: r.name, code: r.code, permissions: r.permissions, is_system: true }))
    )

    // Create default approval matrix
    await supabase.from('approval_matrix').insert([
      { company_id: company.id, min_amount: 0, max_amount: 50000, required_levels: ['L1','L2'], escalation_hrs: 48 },
      { company_id: company.id, min_amount: 50000, max_amount: 500000, required_levels: ['L1','L2'], escalation_hrs: 48 },
      { company_id: company.id, min_amount: 500000, max_amount: null, required_levels: ['L1','L2','L3'], escalation_hrs: 72 },
    ])

    // Add current user as Super Admin of new entity
    const { data: superAdminRole } = await supabase
      .from('roles').select('id').eq('company_id', company.id).eq('code', 'SUPER_ADMIN').single()
    if (superAdminRole) {
      await supabase.from('company_members').insert({
        company_id: company.id, user_id: userId,
        role_id: superAdminRole.id, is_active: true
      })
    }

    setLoading(false)
    setShowForm(false)
    setForm({ name:'', legal_name:'', code:'', country:'', currency:'INR', gstin:'', address:'' })
    loadCompanies()
    alert(`✅ ${form.name} created successfully! Refresh the page to see it in the entity switcher.`)
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  const currencies = ['INR','USD','EUR','GBP','AED','SGD','AUD','CAD','JPY','MYR','THB']
  const countries = ['India','United Arab Emirates','Singapore','United Kingdom','United States','Australia','Canada','Japan','Malaysia','Thailand','Other']

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Manage Entities</h1>
          <p style={{ color:'#666', fontSize:'14px' }}>Add and manage your company subsidiaries and branches</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Add New Entity
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'24px' }}>
        {companies.map(c => (
          <div key={c.id} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
              <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'#2563eb' }}>
                {c.code?.slice(0,2)}
              </div>
              <span style={{ padding:'3px 8px', borderRadius:'20px', fontSize:'11px', background: c.is_active ? '#f0fdf4' : '#f9fafb', color: c.is_active ? '#16a34a' : '#6b7280', fontWeight:'500' }}>
                {c.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div style={{ fontSize:'15px', fontWeight:'600', marginBottom:'2px' }}>{c.name}</div>
            {c.legal_name && <div style={{ fontSize:'12px', color:'#6b7280', marginBottom:'8px' }}>{c.legal_name}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px', marginTop:'10px', paddingTop:'10px', borderTop:'1px solid #f3f4f6' }}>
              {[['Code', c.code], ['Country', c.country], ['Currency', c.currency], ['GSTIN', c.gstin || '—']].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize:'10px', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.4px' }}>{label}</div>
                  <div style={{ fontSize:'12px', fontWeight:'500', marginTop:'1px' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'560px', maxWidth:'94vw', maxHeight:'90vh', overflowY:'auto', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600' }}>Add New Entity / Subsidiary</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>✕</button>
            </div>

            <div style={{ padding:'10px 12px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', marginBottom:'16px', fontSize:'12px', color:'#1d4ed8' }}>
              ℹ️ Creating a new entity will automatically set up default roles and approval matrix. You will be added as Super Admin.
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Company Name *</label>
                <input style={inp} value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="e.g. Acme Japan KK"/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Legal Name</label>
                <input style={inp} value={form.legal_name} onChange={e => setForm({...form, legal_name:e.target.value})} placeholder="Full legal entity name"/>
              </div>
              <div>
                <label style={lbl}>Entity Code * <span style={{ fontWeight:'400', color:'#9ca3af' }}>(unique, e.g. ACME-JP)</span></label>
                <input style={inp} value={form.code} onChange={e => setForm({...form, code:e.target.value.toUpperCase()})} placeholder="ACME-JP" maxLength={12}/>
              </div>
              <div>
                <label style={lbl}>Country *</label>
                <select style={inp} value={form.country} onChange={e => setForm({...form, country:e.target.value})}>
                  <option value="">Select country...</option>
                  {countries.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Base Currency *</label>
                <select style={inp} value={form.currency} onChange={e => setForm({...form, currency:e.target.value})}>
                  {currencies.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>GSTIN / Tax ID</label>
                <input style={inp} value={form.gstin} onChange={e => setForm({...form, gstin:e.target.value})} placeholder="Tax registration number"/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Address</label>
                <input style={inp} value={form.address} onChange={e => setForm({...form, address:e.target.value})} placeholder="Registered office address"/>
              </div>
            </div>

            <div style={{ marginTop:'16px', padding:'12px', background:'#f9fafb', borderRadius:'8px', fontSize:'12px', color:'#6b7280' }}>
              <strong style={{ color:'#374151' }}>All currencies will be available</strong> on this entity — INR, USD, EUR, GBP, AED, SGD and more. The base currency above is just the default display currency.
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSubmit}
                disabled={loading || !form.name || !form.code || !form.country || !form.currency}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', background: !form.name||!form.code||!form.country ? '#93c5fd' : '#2563eb', color:'#fff', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
                {loading ? 'Creating...' : 'Create Entity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}