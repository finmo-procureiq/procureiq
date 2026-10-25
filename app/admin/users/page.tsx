'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

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
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editUser, setEditUser] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  const [addForm, setAddForm] = useState({
    email: '', company_ids: [] as string[], department: '',
    roles: [] as string[], manages_department: false
  })
  const [editForm, setEditForm] = useState({
    department: '', roles: [] as string[], manages_department: false,
    company_ids: [] as string[]
  })

  const supabase = createClient()
  useEffect(() => { init() }, [])

  async function init() {
    const res = await fetch('/api/companies')
    const cos = await res.json()
    setCompanies(Array.isArray(cos) ? cos : [])
    await load(Array.isArray(cos) ? cos : [])
  }

  async function load(cos?: any[]) {
    setLoading(true)
    const companyList = cos || companies
    const companyMap: Record<string, string> = Object.fromEntries(companyList.map((c: any) => [c.id, c.name]))

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
        let roles: string[] = m.roles?.filter(Boolean) || []
        grouped[uid] = {
          user_id: uid,
          email: p.email || uid,
          full_name: p.full_name || p.email || uid,
          department: m.department || p.department || '',
          manages_department: m.manages_department === true,
          roles,
          companies: [],
          company_ids: [],
          member_rows: [],
        }
      }
      const name = companyMap[m.company_id]
      if (name && !grouped[uid].companies.includes(name)) grouped[uid].companies.push(name)
      if (!grouped[uid].company_ids.includes(m.company_id)) grouped[uid].company_ids.push(m.company_id)
      grouped[uid].member_rows.push(m.id)
    }
    setUsers(Object.values(grouped))
    setLoading(false)
  }

  function toggleRole(role: string, current: string[], setter: (r: string[]) => void) {
    setter(current.includes(role) ? current.filter(r => r !== role) : [...current, role])
  }

  function toggleCompany(cid: string, current: string[], setter: (c: string[]) => void) {
    setter(current.includes(cid) ? current.filter(c => c !== cid) : [...current, cid])
  }

  async function handleAdd() {
    if (!addForm.email || !addForm.roles.length || !addForm.company_ids.length) return
    setSaving(true)
    try {
      const { data: profile } = await supabase
        .from('user_profiles').select('id')
        .eq('email', addForm.email.toLowerCase().trim()).single()
      if (!profile) {
        alert('User not found. They must log in at https://procureiq-gdja.onrender.com first.')
        setSaving(false); return
      }
      for (const cid of addForm.company_ids) {
        await supabase.from('company_members').upsert({
          user_id: profile.id, company_id: cid,
          roles: addForm.roles,
          department: addForm.department || null,
          manages_department: addForm.manages_department === true,
          is_active: true,
        }, { onConflict: 'user_id,company_id' })
      }
      setShowAdd(false)
      setAddForm({ email: '', company_ids: [], department: '', roles: [], manages_department: false })
      await load()
      alert('User added successfully!')
    } catch (e: any) { alert('Error: ' + e.message) }
    setSaving(false)
  }

  async function handleEdit() {
    if (!editUser || !editForm.roles.length || !editForm.company_ids.length) return
    setSaving(true)
    try {
      const allCompanyIds = companies.map((c: any) => c.id)
      const toAdd = editForm.company_ids.filter((cid: string) => !editUser.company_ids.includes(cid))
      const toRemove = editUser.company_ids.filter((cid: string) => !editForm.company_ids.includes(cid))
      const toUpdate = editForm.company_ids.filter((cid: string) => editUser.company_ids.includes(cid))

      // Update existing entity memberships
      for (const cid of toUpdate) {
        await supabase.from('company_members').update({
          roles: editForm.roles,
          department: editForm.department || null,
          manages_department: editForm.manages_department === true,
        }).eq('user_id', editUser.user_id).eq('company_id', cid).eq('is_active', true)
      }

      // Add new entity memberships
      for (const cid of toAdd) {
        await supabase.from('company_members').upsert({
          user_id: editUser.user_id, company_id: cid,
          roles: editForm.roles,
          department: editForm.department || null,
          manages_department: editForm.manages_department === true,
          is_active: true,
        }, { onConflict: 'user_id,company_id' })
      }

      // Remove entity access
      for (const cid of toRemove) {
        await supabase.from('company_members')
          .update({ is_active: false })
          .eq('user_id', editUser.user_id).eq('company_id', cid)
      }

      setUsers(prev => prev.map(u => u.user_id === editUser.user_id
        ? {
            ...u,
            roles: [...editForm.roles],
            department: editForm.department,
            manages_department: editForm.manages_department,
            company_ids: [...editForm.company_ids],
            companies: companies.filter((c: any) => editForm.company_ids.includes(c.id)).map((c: any) => c.name),
          }
        : u
      ))
      setShowEdit(false)
      setEditUser(null)
    } catch (e: any) { alert('Error saving: ' + e.message) }
    setSaving(false)
  }

  function openEdit(u: any) {
    setEditUser(u)
    setEditForm({
      department: u.department,
      roles: [...u.roles],
      manages_department: u.manages_department === true,
      company_ids: [...u.company_ids],
    })
    setShowEdit(true)
  }

  async function deactivate(userId: string, email: string) {
    if (!confirm(`Deactivate ${email}? This removes all their entity access.`)) return
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
              style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: active ? 'none' : '1px solid #e5e7eb',
                background: active ? c.bg : '#fff', color: active ? c.color : '#9ca3af',
                outline: active ? `2px solid ${c.color}` : 'none', outlineOffset: 1 }}>
              {ROLE_LABELS[r]}
            </button>
          )
        })}
      </div>
    )
  }

  function EntityPicker({ selected, onChange }: { selected: string[], onChange: (c: string[]) => void }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {companies.map((c: any) => {
          const active = selected.includes(c.id)
          return (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `1px solid ${active ? '#9B72F5' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', background: active ? '#f5f3ff' : '#fff' }}>
              <input type="checkbox" checked={active} onChange={() => toggleCompany(c.id, selected, onChange)}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#9B72F5' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: active ? '#7c3aed' : '#374151' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{c.code}</div>
              </div>
            </label>
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

      <div style={{ padding: '12px 16px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 13, color: '#5b21b6', marginBottom: 20 }}>
        <strong>Approval routing:</strong>&nbsp;
        Under 10k → L1 only · 10k–25k → L1 then L2 · Above 25k → L1 → L2 → L3 · Finance processes after all approvals
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
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 12 }}>
                  {u.companies.length > 0
                    ? u.companies.map((name: string) => (
                        <div key={name} style={{ fontSize: 12, color: '#374151' }}>{name}</div>
                      ))
                    : <span style={{ color: '#d1d5db' }}>—</span>}
                </td>
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
                  onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="name@company.com" />
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>User must have logged in first</p>
              </div>
              <div>
                <label style={lbl}>Entity Access * (select all that apply)</label>
                <EntityPicker selected={addForm.company_ids} onChange={c => setAddForm({ ...addForm, company_ids: c })} />
                {addForm.company_ids.length === 0 && <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>Select at least one entity</p>}
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
              <button onClick={handleAdd} disabled={saving || !addForm.email || !addForm.roles.length || !addForm.company_ids.length}
                style={{ padding: '9px 18px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#fff',
                  background: (!addForm.email || !addForm.roles.length || !addForm.company_ids.length) ? '#c4b5fd' : '#9B72F5' }}>
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
                <label style={lbl}>Entity Access * (check to grant, uncheck to remove)</label>
                <EntityPicker selected={editForm.company_ids} onChange={c => setEditForm({ ...editForm, company_ids: c })} />
                {editForm.company_ids.length === 0 && <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>Select at least one entity</p>}
              </div>
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
              <button onClick={handleEdit} disabled={saving || !editForm.roles.length || !editForm.company_ids.length}
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
