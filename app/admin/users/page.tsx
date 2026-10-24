'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

// Known role UUIDs from the database
const ROLE_OPTIONS = [
  { id: '3439de3b-d891-4852-9ecb-9c143f4c2516', label: 'MAKER' },
  { id: '824f70e7-bdcf-41af-a57f-72f4c2295173', label: 'MAKER' },
  { id: '299f57cd-13c7-49d7-b4c3-3d6111ba78f6', label: 'MAKER' },
  { id: '878b9e57-6825-43ad-ab6a-9ed1301f88c1', label: 'MAKER' },
  { id: 'f7c2af7d-a798-4cca-bf93-97b6ec1ab367', label: 'MAKER' },
  { id: '36689185-99ec-4d70-8037-5797884e5e78', label: 'L1 CHECKER' },
  { id: '097c907d-6e1c-433f-ab45-16d9be64a1ad', label: 'L2 CHECKER' },
  { id: 'ca9a3015-bd1a-44df-aaa1-bf822f6261a5', label: 'L3 CHECKER' },
  { id: '0fafb943-5a6e-468f-a6da-0fded964c173', label: 'FINANCE' },
  { id: 'd4ca2a99-039e-4976-b7d1-a42ef2894477', label: 'ADMIN' },
]

// Simple roles for new users — we'll use the first UUID for each role type
// These are placeholder UUIDs; admin can update role via edit
const NEW_USER_ROLES = [
  { id: '3439de3b-d891-4852-9ecb-9c143f4c2516', label: 'Maker (creates POs)' },
  { id: '36689185-99ec-4d70-8037-5797884e5e78', label: 'L1 Approver' },
  { id: '097c907d-6e1c-433f-ab45-16d9be64a1ad', label: 'L2 Approver' },
  { id: 'ca9a3015-bd1a-44df-aaa1-bf822f6261a5', label: 'L3 Approver' },
  { id: '0fafb943-5a6e-468f-a6da-0fded964c173', label: 'Finance' },
  { id: 'd4ca2a99-039e-4976-b7d1-a42ef2894477', label: 'Admin' },
]

const DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin']

function getRoleLabel(roleId: string) {
  const match = ROLE_OPTIONS.find(r => r.id === roleId)
  return match?.label || roleId?.substring(0, 8) + '...'
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editUser, setEditUser] = useState<any>(null)

  const [addForm, setAddForm] = useState({
    email: '',
    company_id: 'all',
    department: '',
    role_id: '',
    manages_department: false,
  })

  const [editForm, setEditForm] = useState({
    department: '',
    role_id: '',
    manages_department: false,
    add_company_id: '',
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)

    // Load companies
    const { data: compData } = await supabase
      .from('companies')
      .select('id, name, code')
      .order('name')
    setCompanies(compData || [])

    // Load company_members with user profiles
    const { data: members } = await supabase
      .from('company_members')
      .select('id, company_id, user_id, role_id, manages_department, is_active, company:companies(id, name, code), profile:user_profiles(id, email, full_name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (members) {
      // Group by user_id
      const grouped: Record<string, any> = {}
      for (const m of members) {
        const uid = m.user_id
        if (!grouped[uid]) {
          grouped[uid] = {
            user_id: uid,
            email: m.profile?.email || uid,
            full_name: m.profile?.full_name || m.profile?.email || uid,
            role_id: m.role_id,
            department: m.department || '',
            manages_department: m.manages_department || false,
            companies: [],
            member_ids: [],
          }
        }
        if (m.company?.name) grouped[uid].companies.push(m.company.name)
        grouped[uid].member_ids.push(m.id)
      }
      setUsers(Object.values(grouped))
    }
    setLoading(false)
  }

  async function handleAdd() {
    if (!addForm.email || !addForm.role_id) return
    setSaving(true)

    try {
      // Find user profile by email
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', addForm.email.toLowerCase().trim())
        .single()

      if (!profile) {
        alert('User not found. They must log in with Google SSO first at:\nhttps://procureiq-gdja.onrender.com')
        setSaving(false)
        return
      }

      const companyList = addForm.company_id === 'all'
        ? companies.map(c => c.id)
        : [addForm.company_id]

      let successCount = 0
      for (const cid of companyList) {
        const { error } = await supabase.from('company_members').upsert({
          user_id: profile.id,
          company_id: cid,
          role_id: addForm.role_id,
          manages_department: addForm.manages_department,
          is_active: true,
        }, { onConflict: 'user_id,company_id' })
        if (!error) successCount++
      }

      setShowAdd(false)
      setAddForm({ email:'', company_id:'all', department:'', role_id:'', manages_department:false })
      await init()
      alert(`User added to ${successCount} ${successCount === 1 ? 'entity' : 'entities'} successfully!`)
    } catch (e: any) {
      alert('Error adding user: ' + e.message)
    }
    setSaving(false)
  }

  async function handleEdit() {
    if (!editUser) return
    setSaving(true)

    try {
      const updates: any = { role_id: editForm.role_id, manages_department: editForm.manages_department }

      await supabase.from('company_members')
        .update(updates)
        .eq('user_id', editUser.user_id)
        .eq('is_active', true)

      // Add to new company if selected
      if (editForm.add_company_id) {
        await supabase.from('company_members').upsert({
          user_id: editUser.user_id,
          company_id: editForm.add_company_id,
          role_id: editForm.role_id,
          manages_department: editForm.manages_department,
          is_active: true,
        }, { onConflict: 'user_id,company_id' })
      }

      setShowEdit(false)
      setEditUser(null)
      await init()
    } catch (e: any) {
      alert('Error updating user: ' + e.message)
    }
    setSaving(false)
  }

  async function handleDeactivate(userId: string, email: string) {
    if (!confirm(`Deactivate ${email}? They will lose all access.`)) return
    await supabase.from('company_members')
      .update({ is_active: false })
      .eq('user_id', userId)
    await init()
  }

  function openEdit(u: any) {
    setEditUser(u)
    setEditForm({
      department: u.department || '',
      role_id: u.role_id || '',
      manages_department: u.manages_department || false,
      add_company_id: '',
    })
    setShowEdit(true)
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading users...</div>

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Users & Roles</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>Manage team members and their approval roles</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Add User
        </button>
      </div>

      <div style={{ padding:'12px 16px', background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:'8px', fontSize:'13px', color:'#5b21b6', marginBottom:'20px' }}>
        <strong>Approval routing:</strong> POs route to the approver whose "Manages Dept" matches the maker's department. Set this on each approver via Edit.
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden', marginBottom:'24px' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              {['User','Role','Entities','Actions'].map(h => (
                <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                <td style={{ padding:'12px 16px' }}>
                  <div style={{ fontWeight:'500', color:'#111827' }}>{u.full_name}</div>
                  <div style={{ fontSize:'12px', color:'#9ca3af' }}>{u.email}</div>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:'#f5f3ff', color:'#7c3aed' }}>
                    {getRoleLabel(u.role_id)}
                  </span>
                  {u.manages_department && <div style={{ fontSize:'11px', color:'#059669', marginTop:'4px' }}>✓ Manages dept</div>}
                </td>
                <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{u.companies.join(', ') || '—'}</td>
                <td style={{ padding:'12px 16px' }}>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <button onClick={() => openEdit(u)}
                      style={{ fontSize:'12px', padding:'4px 12px', border:'1px solid #ddd6fe', borderRadius:'6px', background:'#fff', color:'#7c3aed', cursor:'pointer' }}>
                      Edit
                    </button>
                    <button onClick={() => handleDeactivate(u.user_id, u.email)}
                      style={{ fontSize:'12px', padding:'4px 12px', border:'1px solid #fecaca', borderRadius:'6px', background:'#fff', color:'#dc2626', cursor:'pointer' }}>
                      Deactivate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} style={{ padding:'32px', textAlign:'center', color:'#9ca3af' }}>No users yet. Click + Add User.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding:'14px 16px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'8px', fontSize:'13px', color:'#6b7280' }}>
        <strong style={{ color:'#374151' }}>How to add a new user:</strong> They must first log in at this URL with their @finmo.net Google account. Then click + Add User.
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'500px', maxWidth:'94vw', padding:'28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>Add New User</h2>
              <button onClick={() => setShowAdd(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <p style={{ fontSize:'13px', color:'#9ca3af', marginBottom:'20px', marginTop:0 }}>Select entity access and role</p>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div>
                <label style={lbl}>Email Address *</label>
                <input style={inp} type="email" value={addForm.email}
                  onChange={e => setAddForm({...addForm, email:e.target.value})}
                  placeholder="name@finmo.net"/>
                <p style={{ fontSize:'11px', color:'#9ca3af', marginTop:'4px' }}>User must have logged in with Google first</p>
              </div>

              <div>
                <label style={lbl}>Entity Access</label>
                <select style={inp} value={addForm.company_id} onChange={e => setAddForm({...addForm, company_id:e.target.value})}>
                  <option value="all">All Entities ({companies.length})</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>Department</label>
                <select style={inp} value={addForm.department} onChange={e => setAddForm({...addForm, department:e.target.value})}>
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>Role *</label>
                <select style={inp} value={addForm.role_id} onChange={e => setAddForm({...addForm, role_id:e.target.value})}>
                  <option value="">Select role...</option>
                  {NEW_USER_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <input type="checkbox" id="manages_dept_add" checked={addForm.manages_department}
                  onChange={e => setAddForm({...addForm, manages_department:e.target.checked})}
                  style={{ width:'16px', height:'16px', cursor:'pointer' }}/>
                <label htmlFor="manages_dept_add" style={{ fontSize:'13px', color:'#374151', cursor:'pointer' }}>
                  Manages Department (approver receives POs from their dept)
                </label>
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'24px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowAdd(false)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleAdd} disabled={saving || !addForm.email || !addForm.role_id}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: (!addForm.email||!addForm.role_id) ? '#c4b5fd' : '#9B72F5' }}>
                {saving ? 'Adding...' : `Add to ${addForm.company_id === 'all' ? `all ${companies.length}` : '1'} ${addForm.company_id === 'all' && companies.length !== 1 ? 'entities' : 'entity'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEdit && editUser && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'500px', maxWidth:'94vw', padding:'28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>Edit User</h2>
              <button onClick={() => setShowEdit(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <p style={{ fontSize:'13px', color:'#9ca3af', marginBottom:'20px', marginTop:0 }}>{editUser.email}</p>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div>
                <label style={lbl}>Department</label>
                <select style={inp} value={editForm.department} onChange={e => setEditForm({...editForm, department:e.target.value})}>
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>Role *</label>
                <select style={inp} value={editForm.role_id} onChange={e => setEditForm({...editForm, role_id:e.target.value})}>
                  <option value="">Select role...</option>
                  {NEW_USER_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <input type="checkbox" id="manages_dept_edit" checked={editForm.manages_department}
                  onChange={e => setEditForm({...editForm, manages_department:e.target.checked})}
                  style={{ width:'16px', height:'16px', cursor:'pointer' }}/>
                <label htmlFor="manages_dept_edit" style={{ fontSize:'13px', color:'#374151', cursor:'pointer' }}>
                  Manages Department
                </label>
              </div>

              <div>
                <label style={lbl}>Add Access to Entity (optional)</label>
                <select style={inp} value={editForm.add_company_id} onChange={e => setEditForm({...editForm, add_company_id:e.target.value})}>
                  <option value="">No additional entity</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'24px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowEdit(false)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleEdit} disabled={saving}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff', background:'#9B72F5' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
