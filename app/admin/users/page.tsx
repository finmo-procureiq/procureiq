'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin']

// Use service role to bypass RLS for admin queries
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function UsersPage() {
  const [members, setMembers] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [form, setForm] = useState({ email:'', role_code:'', department:'', entity:'all' })

  const supabase = adminClient

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setPageLoading(true)

    const { data: cos } = await supabase.from('companies')
      .select('id, name, code, currency').order('name')
    setCompanies(cos || [])
    if (!cos?.length) { setPageLoading(false); return }

    const { data: allMembers, error } = await supabase
      .from('company_members')
      .select('id, is_active, company_id, user_id, role_id')
      .eq('is_active', true)

    if (error) { console.error('members error:', error); setPageLoading(false); return }

    // Get all user profiles
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, department')

    // Get all roles
    const { data: allRoles } = await supabase
      .from('roles')
      .select('id, name, code, company_id')

    const userMap: Record<string, any> = {}
    ;(allMembers || []).forEach((m: any) => {
      const profile = profiles?.find(p => p.id === m.user_id)
      const role = allRoles?.find(r => r.id === m.role_id)
      const company = cos.find(c => c.id === m.company_id)
      if (!profile?.email) return
      if (!userMap[profile.email]) {
        userMap[profile.email] = {
          email: profile.email,
          full_name: profile.full_name,
          role_name: role?.name,
          role_code: role?.code,
          department: profile.department || '',
          entities: [],
        }
      }
      if (company?.code && !userMap[profile.email].entities.includes(company.code)) {
        userMap[profile.email].entities.push(company.code)
      }
    })
    setMembers(Object.values(userMap))

    // Load roles for first company (for role selector)
    const { data: roleList } = await supabase
      .from('roles').select('id, name, code')
      .eq('company_id', cos[0].id).order('name')
    setRoles(roleList || [])
    setPageLoading(false)
  }

  async function handleAddUser() {
    if (!form.email || !form.role_code) return
    setLoading(true)

    const { data: profile } = await supabase
      .from('user_profiles').select('id')
      .eq('email', form.email.toLowerCase().trim()).single()

    if (!profile) {
      alert('User not found. Ask them to log in at https://procureiq-gdja.onrender.com/auth/login first.')
      setLoading(false)
      return
    }

    if (form.department) {
      await supabase.from('user_profiles')
        .update({ department: form.department })
        .eq('id', profile.id)
    }

    const targetCompanies = form.entity === 'all'
      ? companies
      : companies.filter(c => c.id === form.entity)

    let successCount = 0
    for (const company of targetCompanies) {
      const { data: role } = await supabase.from('roles').select('id')
        .eq('company_id', company.id).eq('code', form.role_code).single()
      if (!role) continue
      const { error } = await supabase.from('company_members').upsert({
        company_id: company.id,
        user_id: profile.id,
        role_id: role.id,
        is_active: true,
      }, { onConflict: 'company_id,user_id' })
      if (!error) successCount++
    }

    setLoading(false)
    setShowForm(false)
    setForm({ email:'', role_code:'', department:'', entity:'all' })
    await loadAll()
    alert(`User added to ${successCount} ${successCount === 1 ? 'entity' : 'entities'} successfully!`)
  }

  async function deactivateUser(email: string) {
    if (!confirm(`Deactivate ${email} from all entities?`)) return
    const { data: profile } = await supabase
      .from('user_profiles').select('id').eq('email', email).single()
    if (!profile) return
    await supabase.from('company_members')
      .update({ is_active: false }).eq('user_id', profile.id)
    await loadAll()
  }

  async function changeRole(email: string, newRoleCode: string) {
    const { data: profile } = await supabase
      .from('user_profiles').select('id').eq('email', email).single()
    if (!profile) return
    for (const company of companies) {
      const { data: role } = await supabase.from('roles').select('id')
        .eq('company_id', company.id).eq('code', newRoleCode).single()
      if (!role) continue
      await supabase.from('company_members').update({ role_id: role.id })
        .eq('company_id', company.id).eq('user_id', profile.id)
    }
    await loadAll()
  }

  const roleColors: Record<string,string> = {
    SUPER_ADMIN:'#7c3aed', ADMIN:'#2563eb', L1_CHECKER:'#f59e0b',
    L2_CHECKER:'#ea580c', L3_CHECKER:'#dc2626', MAKER:'#16a34a', VIEWER:'#6b7280'
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }
  const selectedEntityName = form.entity === 'all' ? `all ${companies.length} entities` : companies.find(c => c.id === form.entity)?.code || ''

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Users & Roles</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>Manage team members across all {companies.length} entities</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Add User
        </button>
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              {['User','Email','Department','Role','Entities','Status','Actions'].map(h => (
                <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageLoading ? (
              <tr><td colSpan={7} style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>Loading users...</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>No users found.</td></tr>
            ) : members.map(m => (
              <tr key={m.email} style={{ borderBottom:'1px solid #f3f4f6' }}>
                <td style={{ padding:'12px 16px', fontWeight:'500' }}>{m.full_name || '—'}</td>
                <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{m.email}</td>
                <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{m.department || '—'}</td>
                <td style={{ padding:'12px 16px' }}>
                  <select value={m.role_code || ''} onChange={e => changeRole(m.email, e.target.value)}
                    style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid #e5e7eb', fontSize:'12px', fontFamily:'sans-serif', cursor:'pointer',
                      background:(roleColors[m.role_code]||'#6b7280')+'15', color:roleColors[m.role_code]||'#6b7280', fontWeight:'600' }}>
                    {roles.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                    {m.entities.map((e: string) => (
                      <span key={e} style={{ fontSize:'10px', padding:'2px 6px', borderRadius:'4px', background:'#ede9fe', color:'#7c3aed', fontWeight:'600' }}>{e}</span>
                    ))}
                  </div>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'500', background:'#f0fdf4', color:'#16a34a' }}>Active</span>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <button onClick={() => deactivateUser(m.email)}
                    style={{ fontSize:'12px', padding:'4px 10px', border:'1px solid #fecaca', borderRadius:'6px', background:'#fff', color:'#dc2626', cursor:'pointer' }}>
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop:'16px', padding:'12px 16px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', fontSize:'13px', color:'#1d4ed8' }}>
        <strong>How to add a new user:</strong> Ask them to log in at <strong>https://procureiq-gdja.onrender.com/auth/login</strong> first, then click + Add User.
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'480px', maxWidth:'94vw', padding:'28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <div>
                <h2 style={{ fontSize:'18px', fontWeight:'600', marginBottom:'2px' }}>Add New User</h2>
                <p style={{ fontSize:'12px', color:'#6b7280', margin:0 }}>Select entity access, department and role</p>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div>
                <label style={lbl}>Email Address *</label>
                <input style={inp} type="email" value={form.email}
                  onChange={e => setForm({...form, email:e.target.value})}
                  placeholder="name@finmo.net"/>
                <p style={{ fontSize:'11px', color:'#9ca3af', marginTop:'4px' }}>User must have logged in with Google first</p>
              </div>
              <div>
                <label style={lbl}>Entity Access</label>
                <select style={inp} value={form.entity} onChange={e => setForm({...form, entity:e.target.value})}>
                  <option value="all">All Entities ({companies.length})</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Department</label>
                <select style={inp} value={form.department} onChange={e => setForm({...form, department:e.target.value})}>
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Role *</label>
                <select style={inp} value={form.role_code} onChange={e => setForm({...form, role_code:e.target.value})}>
                  <option value="">Select role...</option>
                  {roles.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
              </div>
              {form.role_code && (
                <div style={{ padding:'10px 14px', background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:'8px', fontSize:'12px', color:'#5b21b6' }}>
                  {form.role_code === 'MAKER' && 'Can create and submit purchase orders'}
                  {form.role_code === 'L1_CHECKER' && 'Dept Head — first level approval'}
                  {form.role_code === 'L2_CHECKER' && 'Finance Manager — second level approval'}
                  {form.role_code === 'L3_CHECKER' && 'CFO — final escalation approval'}
                  {form.role_code === 'VIEWER' && 'Read only — cannot create or approve'}
                  {form.role_code === 'SUPER_ADMIN' && 'Full access to everything'}
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'24px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleAddUser} disabled={loading || !form.email || !form.role_code}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: !form.email||!form.role_code ? '#c4b5fd' : '#9B72F5' }}>
                {loading ? 'Adding...' : `Add to ${selectedEntityName}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}