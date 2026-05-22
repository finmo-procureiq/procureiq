'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { getActiveCompanyId } from '@/lib/company'

export default function UsersPage() {
  const [members, setMembers] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email:'', role_id:'' })

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const cid = await getActiveCompanyId()
    setCompanyId(cid)
    const { data: co } = await supabase.from('companies').select('name').eq('id', cid).single()
    if (co) setCompanyName(co.name)
    await loadData(cid)
  }

  async function loadData(cid: string) {
    const { data: mem } = await supabase
      .from('company_members')
      .select('id, user_id, role_id, is_active, invited_at')
      .eq('company_id', cid)
    if (!mem?.length) { setMembers([]); return }

    const userIds = mem.map(m => m.user_id)
    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, department')
      .in('id', userIds)

    const { data: rols } = await supabase
      .from('roles')
      .select('id, name, code')
      .eq('company_id', cid)
    setRoles(rols || [])

    const enriched = mem.map(m => ({
      ...m,
      user: users?.find(u => u.id === m.user_id),
      role: rols?.find(r => r.id === m.role_id),
    }))
    setMembers(enriched)
  }

  async function handleInvite() {
    if (!form.email || !form.role_id) return
    setLoading(true)
    const { data: user } = await supabase
      .from('user_profiles').select('id').eq('email', form.email).single()
    if (!user) {
      alert('User not found. They must sign in with Google first before being added.')
      setLoading(false)
      return
    }
    const { error } = await supabase.from('company_members').insert({
      company_id: companyId,
      user_id: user.id,
      role_id: form.role_id,
      is_active: true,
    })
    setLoading(false)
    if (error) { alert('Error: ' + error.message); return }
    setShowForm(false)
    setForm({ email:'', role_id:'' })
    loadData(companyId)
  }

  async function changeRole(memberId: string, roleId: string) {
    await supabase.from('company_members').update({ role_id: roleId }).eq('id', memberId)
    loadData(companyId)
  }

  async function toggleActive(memberId: string, current: boolean) {
    await supabase.from('company_members').update({
      is_active: !current,
      deactivated_at: current ? new Date().toISOString() : null
    }).eq('id', memberId)
    loadData(companyId)
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1200px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Users & Roles</h1>
          <p style={{ color:'#666', fontSize:'14px' }}>Manage team members for {companyName}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Add User
        </button>
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              {['User','Email','Department','Role','Status','Actions'].map(h => (
                <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr><td colSpan={6} style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>No users yet.</td></tr>
            ) : members.map(m => (
              <tr key={m.id} style={{ borderBottom:'1px solid #f3f4f6', opacity: m.is_active ? 1 : 0.5 }}>
                <td style={{ padding:'12px 16px', fontWeight:'500' }}>{m.user?.full_name || '—'}</td>
                <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{m.user?.email || '—'}</td>
                <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{m.user?.department || '—'}</td>
                <td style={{ padding:'12px 16px' }}>
                  <select value={m.role_id} onChange={e => changeRole(m.id, e.target.value)}
                    style={{ padding:'4px 8px', border:'1px solid #e5e7eb', borderRadius:'6px', fontSize:'12px', background:'#fff', cursor:'pointer' }}>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'500', background: m.is_active ? '#f0fdf4' : '#f9fafb', color: m.is_active ? '#16a34a' : '#6b7280' }}>
                    {m.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <button onClick={() => toggleActive(m.id, m.is_active)}
                    style={{ fontSize:'12px', padding:'4px 10px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'#fff', cursor:'pointer', color: m.is_active ? '#dc2626' : '#16a34a' }}>
                    {m.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop:'24px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'12px', padding:'16px', fontSize:'13px', color:'#1d4ed8' }}>
        <strong>How to add a new user:</strong> The user must first sign in to ProcureIQ using their Google account. Once they have signed in, you can add them here by their email address and assign them a role.
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'460px', maxWidth:'94vw', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600' }}>Add User to {companyName}</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <div style={{ display:'grid', gap:'12px' }}>
              <div>
                <label style={lbl}>Email Address *</label>
                <input style={inp} type="email" value={form.email}
                  onChange={e => setForm({...form, email:e.target.value})}
                  placeholder="colleague@company.com"/>
                <p style={{ fontSize:'11px', color:'#9ca3af', marginTop:'4px' }}>User must have signed in with Google first</p>
              </div>
              <div>
                <label style={lbl}>Role *</label>
                <select style={inp} value={form.role_id} onChange={e => setForm({...form, role_id:e.target.value})}>
                  <option value="">Select role...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div style={{ background:'#f9fafb', borderRadius:'8px', padding:'12px', fontSize:'12px', color:'#6b7280' }}>
                <strong style={{ color:'#374151', display:'block', marginBottom:'6px' }}>Role permissions:</strong>
                <div>Maker — can create POs only</div>
                <div>L1 Checker — Dept Head, first approval</div>
                <div>L2 Checker — Finance Manager, second approval</div>
                <div>L3 Checker — CFO, optional escalation</div>
                <div>Viewer — read only access</div>
                <div>Super Admin — full access</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'20px' }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex:1, padding:'10px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleInvite} disabled={loading || !form.email || !form.role_id}
                style={{ flex:1, padding:'10px', border:'none', borderRadius:'8px', background: !form.email||!form.role_id?'#93c5fd':'#2563eb', color:'#fff', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
                {loading ? 'Adding...' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}