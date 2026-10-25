'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

const COMPANIES = [
  { id: '33a0603c-5b4e-4418-9683-1a5d544560ea', name: 'Acme India Pvt Ltd' },
  { id: 'f1d448b1-bc01-4f86-b3fc-6bc0b31c992e', name: 'Acme Singapore Pte Ltd' },
  { id: '485d369d-087f-4776-a70b-6d1203e29c2d', name: 'Acme UAE LLC' },
  { id: '8d37db04-7eb7-4b76-afed-df2a50590d7f', name: 'Finmo Tech Pte Ltd' },
  { id: 'fcf15fb0-29e9-466d-aad2-5b0cf2089a0b', name: 'Finmo Tech India Pvt Ltd' },
]
const COMPANY_MAP: Record<string, string> = Object.fromEntries(COMPANIES.map(c => [c.id, c.name]))

const ALL_ROLES = ['MAKER', 'L1', 'L2', 'L3', 'FINANCE', 'ADMIN']
const ROLE_LABELS: Record<string, string> = {
  MAKER: 'Maker', L1: 'L1 Approver', L2: 'L2 Approver',
  L3: 'L3 Approver (CFO)', FINANCE: 'Finance', ADMIN: 'Admin'
}
const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  MAKER:   { bg: '#f5f3ff', color: '#7c3aed' },
  L1:      { bg: '#eff6ff', color: '#1d4ed8' },
  L2:      { bg: '#ecfdf5', color: '#059669' },
  L3:      { bg: '#fff7ed', color: '#c2410c' },
  FINANCE: { bg: '#fdf2f8', color: '#9d174d' },
  ADMIN:   { bg: '#1f2937', color: '#f9fafb' },
}

const DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps',
  'Customer Success','Legal','Marketing','Sales','Admin']

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editUser, setEditUser] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  const [addForm, setAddForm] = useState({
    email: '', company_id: 'all', department: '',
    roles: [] as string[], manages_department: false
  })
  const [editForm, setEditForm] = useState({
    department: '', roles: [] as string[], manages_department: false
  })

  const supabase = createClient()
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: members } = await supabase
      .from('company_members')
      .select('id, company_id, user_id, role_id, roles, department, manages_department')
      .eq('is_active', true)

    if (!members?.length) { setUsers([]); setLoading(false); return }

    const userIds = [...new Set(members.map((m: any) => m.user_id))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, department, designation')
      .in('id', userIds)

    const profileMap: Record<string, any> = {}
    for (const p of profiles || []) profileMap[p.id] = p

    const grouped: Record<string, any> = {}
    for (const m of members) {
      const uid = m.user_id
      if (!grouped[uid]) {
        const p = profileMap[uid] || {}
        // Resolve roles: prefer new roles[] array, fallback to role_id mapping
        let roles: string[] = m.roles?.filter(Boolean) || []
        if (!roles.length && m.role_id) {
          const legacyMap: Record<string, string> = {
            '3439de3b-d891-4852-9ecb-9c143f4c2516': 'MAKER',
            '824f70e7-bdcf-41af-a57f-72f4c2295173': 'MAKER',
            '299f57cd-13c7-49d7-b4c3-3d6111ba78f6': 'MAKER',
            '878b9e57-6825-43ad-ab6a-9ed1301f88c1': 'MAKER',
            'f7c2af7d-a798-4cca-bf93-97b6ec1ab367': 'MAKER',
            '36689185-99ec-4d70-8037-5797884e5e78': 'L1',
            '097c907d-6e1c-433f-ab45-16d9be64a1ad': 'L2',
            'ca9a3015-bd1a-44df-aaa1-bf822f6261a5': 'L3',
            '0fafb943-5a6e-468f-a6da-0fded964c173': 'FINANCE',
            'd4ca2a99-039e-4976-b7d1-a42ef2894477': 'ADMIN',
          }
          roles = legacyMap[m.role_id] ? [legacyMap[m.role_id]] : ['MAKER']
        }
        grouped[uid] = {
          user_id: uid,
          email: p.email || uid,
          full_name: p.full_name || p.email || uid,
          department: m.department || p.department || '',
          manages_department: m.manages_department || true,
          roles,
          companies: [],
          member_rows: [],
        }
      }
      const name = COMPANY_MAP[m.company_id]
      if (name && !grouped[uid].companies.includes(name)) grouped[uid].companies.push(name)
      grouped[uid].member_rows.push(m.id)
    }
    setUsers(Object.values(grouped))
    setLoading(false)
  }

  function toggleRole(role: string, current: string[], setter: (r: string[]) => void) {
    setter(current.includes(role) ? current.filter(r => r !== role) : [...current, role])
  }

  async function handleAdd() {
    if (!addForm.email || !addForm.roles.length) return
    setSaving(true)
    try {
      const { data: profile } = await supabase
        .from('user_profiles').select('id')
        .eq('email', addForm.email.toLowerCase().trim()).single()
      if (!profile) {
        alert('User not found. They must log in at https://procureiq-gdja.onrender.com first.')
        setSaving(false); return
      }
      if (addForm.department) {
        await supabase.from('user_profiles').update({ department: addForm.department }).eq('id', profile.id)
      }
      const companyList = addForm.company_id === 'all' ? COMPANIES.map(c => c.id) : [addForm.company_id]
      // Use first role as role_id for backwards compat
      const primaryRoleId: Record<string, string> = {
        MAKER: '3439de3b-d891-4852-9ecb-9c143f4c2516',
        L1: '36689185-99ec-4d70-8037-5797884e5e78',
        L2: '097c907d-6e1c-433f-ab45-16d9be64a1ad',
        L3: 'ca9a3015-bd1a-44df-aaa1-bf822f6261a5',
        FINANCE: '0fafb943-5a6e-468f-a6da-0fded964c173',
        ADMIN: 'd4ca2a99-039e-4976-b7d1-a42ef2894477',
      }
      for (const cid of companyList) {
        await supabase.from('company_members').upsert({
          user_id: profile.id, company_id: cid,
          role_id: primaryRoleId[addForm.roles[0]],
          roles: addForm.roles,
          department: addForm.department || null,
          manages_department: addForm.manages_department,
          is_active: true,
        }, { onConflict: 'user_id,company_id' })
      }
      setShowAdd(false)
      setAddForm({ email: '', company_id: 'all', department: '', roles: [], manages_department: false })
      await load()
      alert('User added successfully!')
    } catch (e: any) { alert('Error: ' + e.message) }
    setSaving(false)
  }

  async function handleEdit() {
    if (!editUser || !editForm.roles.length) return
    setSaving(true)
    try {
      const primaryRoleId: Record<string, string> = {
        MAKER: '3439de3b-d891-4852-9ecb-9c143f4c2516',
        L1: '36689185-99ec-4d70-8037-5797884e5e78',
        L2: '097c907d-6e1c-433f-ab45-16d9be64a1ad',
        L3: 'ca9a3015-bd1a-44df-aaa1-bf822f6261a5',
        FINANCE: '0fafb943-5a6e-468f-a6da-0fded964c173',
        ADMIN: 'd4ca2a99-039e-4976-b7d1-a42ef2894477',
      }
      // Update all company_members rows for this user
      const updatePayload = {
        roles: editForm.roles,
        role_id: primaryRoleId[editForm.roles[0]],
        department: editForm.department || null,
        manages_department: editForm.manages_department,
      }
      console.log('Updating user_id:', editUser.user_id, 'payload:', updatePayload)

      const { data: updatedRows, error: updateError } = await supabase
        .from('company_members')
        .update(updatePayload)
        .eq('user_id', editUser.user_id)
        .eq('is_active', true)
        .select()

      console.log('Update result - rows:', updatedRows, 'error:', updateError)

      if (updateError) throw updateError
      if (!updatedRows || updatedRows.length === 0) {
        alert('Warning: no rows were updated. The user may not have active company_members records.')
      }

      if (editForm.department) {
        await supabase.from('user_profiles').update({ department: editForm.department }).eq('id', editUser.user_id)
      }

      // Update local state immediately so UI reflects change before reload
      setUsers(prev => prev.map(u => u.user_id === editUser.user_id
        ? { ...u, roles: editForm.roles, department: editForm.department, manages_department: editForm.manages_department }
        : u
      ))
      setShowEdit(false); setEditUser(null)
      await load()
    } catch (e: any) { alert('Error: ' + e.message) }
    setSaving(false)
  }

  function openEdit(u: any) {
    setEditUser(u)
    setEditForm({ department: u.department, roles: [...u.roles], manages_department: u.manages_department })
    setShowEdit(true)
  }

  async function deactivate(userId: string, email: string) {
    if (!confirm(`Deactivate ${email}?`)) return
    await supabase.from('company_members').update({ is_active: false }).eq('user_id', userId)
    await load()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 4 }

  function RolePicker({ selected, onChange }: { selected: string[], onChange: (r: string[]) => void }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ALL_ROLES.map(r => {
          const active = selected.includes(r)
          const c = ROLE_COLORS[r]
          return (
            <button key={r} type="button" onClick={() => toggleRole(r, selected, onChange)}
              style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: active ? 'none' : '1px solid #e5e7eb',
                background: active ? c.bg : '#fff', color: active ? c.color : '#9ca3af',
                outline: active ? `2px solid ${c.color}` : 'none', outlineOffset: 1 }}>
              {ROLE_LABELS[r]}
            </button>
          )
        })}
      </div>
    )
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontFamily: 'sans-serif' }}>Loading users...</div>

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Users & Roles</h1>
          <p style={{ color: '#666', fontSize: 14, margin: '4px 0 0' }}>{users.length} team members · users can hold multiple roles</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ background: '#9B72F5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          + Add User
        </button>
      </div>

      {/* Approval flow info */}
      <div style={{ padding: '12px 16px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 13, color: '#5b21b6', marginBottom: 20 }}>
        <strong>Approval routing (USD):</strong>&nbsp;
        Under $10k → L1 only · $10k–$25k → L1 then L2 · Above $25k → L1 → L2 → L3 · Finance processes after all approvals
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              {['User', 'Department', 'Roles', 'Entities', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 500 }}>{u.full_name}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{u.email}</div>
                  {u.manages_department && <div style={{ fontSize: 11, color: '#059669', marginTop: 2 }}>✓ Dept manager</div>}
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 13 }}>
                  {u.department || <span style={{ color: '#d1d5db' }}>—</span>}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {u.roles.map((r: string) => {
                      const c = ROLE_COLORS[r] || { bg: '#f3f4f6', color: '#374151' }
                      return (
                        <span key={r} style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>
                          {ROLE_LABELS[r] || r}
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 12 }}>{u.companies.join(', ') || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(u)}
                      style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #ddd6fe', borderRadius: 6, background: '#fff', color: '#7c3aed', cursor: 'pointer' }}>
                      Edit
                    </button>
                    <button onClick={() => deactivate(u.user_id, u.email)}
                      style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff', color: '#dc2626', cursor: 'pointer' }}>
                      Deactivate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 500, maxWidth: '94vw', padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Add New User</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Email Address *</label>
                <input style={inp} type="email" value={addForm.email}
                  onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="name@finmo.net" />
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>User must have logged in with Google SSO first</p>
              </div>
              <div>
                <label style={lbl}>Entity Access</label>
                <select style={inp} value={addForm.company_id} onChange={e => setAddForm({ ...addForm, company_id: e.target.value })}>
                  <option value="all">All Entities ({COMPANIES.length})</option>
                  {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Department</label>
                <select style={inp} value={addForm.department} onChange={e => setAddForm({ ...addForm, department: e.target.value })}>
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Roles * (select all that apply)</label>
                <RolePicker selected={addForm.roles} onChange={r => setAddForm({ ...addForm, roles: r })} />
                {addForm.roles.length === 0 && <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>Select at least one role</p>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="mgmt_add" checked={addForm.manages_department}
                  onChange={e => setAddForm({ ...addForm, manages_department: e.target.checked })}
                  style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="mgmt_add" style={{ fontSize: 13, cursor: 'pointer' }}>
                  Manages Department <span style={{ color: '#9ca3af' }}>(approver receives POs from this dept)</span>
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)}
                style={{ padding: '9px 18px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving || !addForm.email || !addForm.roles.length}
                style={{ padding: '9px 18px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#fff',
                  background: (!addForm.email || !addForm.roles.length) ? '#c4b5fd' : '#9B72F5' }}>
                {saving ? 'Adding...' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEdit && editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 500, maxWidth: '94vw', padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Edit User</h2>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>{editUser.full_name} · {editUser.email}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Department</label>
                <select style={inp} value={editForm.department} onChange={e => setEditForm({ ...editForm, department: e.target.value })}>
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Roles * (select all that apply)</label>
                <RolePicker selected={editForm.roles} onChange={r => setEditForm({ ...editForm, roles: r })} />
                {editForm.roles.length === 0 && <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>Select at least one role</p>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="mgmt_edit" checked={editForm.manages_department}
                  onChange={e => setEditForm({ ...editForm, manages_department: e.target.checked })}
                  style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="mgmt_edit" style={{ fontSize: 13, cursor: 'pointer' }}>Manages Department</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowEdit(false)}
                style={{ padding: '9px 18px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleEdit} disabled={saving || !editForm.roles.length}
                style={{ padding: '9px 18px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#fff', background: '#9B72F5' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
