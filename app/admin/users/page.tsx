'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

// Hardcoded — companies table has RLS, can't query from browser
const COMPANIES = [
  { id: '33a0603c-5b4e-4418-9683-1a5d544560ea', name: 'Acme India Pvt Ltd', code: 'ACIN' },
  { id: 'f1d448b1-bc01-4f86-b3fc-6bc0b31c992e', name: 'Acme Singapore Pte Ltd', code: 'ACSG' },
  { id: '485d369d-087f-4776-a70b-6d1203e29c2d', name: 'Acme UAE LLC', code: 'ACAE' },
  { id: '8d37db04-7eb7-4b76-afed-df2a50590d7f', name: 'Finmo Tech Pte Ltd', code: 'FTSG' },
  { id: 'fcf15fb0-29e9-466d-aad2-5b0cf2089a0b', name: 'Finmo Tech India Pvt Ltd', code: 'FTIN' },
]

const COMPANY_MAP: Record<string, string> = Object.fromEntries(COMPANIES.map(c => [c.id, c.name]))

const ROLE_MAP: Record<string, string> = {
  '3439de3b-d891-4852-9ecb-9c143f4c2516': 'Maker',
  '824f70e7-bdcf-41af-a57f-72f4c2295173': 'Maker',
  '299f57cd-13c7-49d7-b4c3-3d6111ba78f6': 'Maker',
  '878b9e57-6825-43ad-ab6a-9ed1301f88c1': 'Maker',
  'f7c2af7d-a798-4cca-bf93-97b6ec1ab367': 'Maker',
  '36689185-99ec-4d70-8037-5797884e5e78': 'L1 Approver',
  '097c907d-6e1c-433f-ab45-16d9be64a1ad': 'L2 Approver',
  'ca9a3015-bd1a-44df-aaa1-bf822f6261a5': 'L3 Approver',
  '0fafb943-5a6e-468f-a6da-0fded964c173': 'Finance',
  'd4ca2a99-039e-4976-b7d1-a42ef2894477': 'Admin',
}

const ROLE_OPTIONS = [
  { id: '3439de3b-d891-4852-9ecb-9c143f4c2516', label: 'Maker (creates POs)' },
  { id: '36689185-99ec-4d70-8037-5797884e5e78', label: 'L1 Approver' },
  { id: '097c907d-6e1c-433f-ab45-16d9be64a1ad', label: 'L2 Approver' },
  { id: 'ca9a3015-bd1a-44df-aaa1-bf822f6261a5', label: 'L3 Approver' },
  { id: '0fafb943-5a6e-468f-a6da-0fded964c173', label: 'Finance' },
  { id: 'd4ca2a99-039e-4976-b7d1-a42ef2894477', label: 'Admin' },
]

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', company_id: 'all', role_id: '', manages_department: false })
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    const { data: members, error } = await supabase
      .from('company_members')
      .select('id, company_id, user_id, role_id, manages_department')
      .eq('is_active', true)

    if (error || !members?.length) {
      setUsers([])
      setLoading(false)
      return
    }

    const userIds = [...new Set(members.map((m: any) => m.user_id))]

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .in('id', userIds)

    const profileMap: Record<string, any> = {}
    for (const p of profiles || []) profileMap[p.id] = p

    const grouped: Record<string, any> = {}
    for (const m of members) {
      const uid = m.user_id
      if (!grouped[uid]) {
        const p = profileMap[uid] || {}
        grouped[uid] = {
          user_id: uid,
          email: p.email || uid,
          full_name: p.full_name || p.email || uid,
          role_id: m.role_id,
          manages_department: m.manages_department || false,
          companies: [],
        }
      }
      const name = COMPANY_MAP[m.company_id]
      if (name && !grouped[uid].companies.includes(name)) {
        grouped[uid].companies.push(name)
      }
    }

    setUsers(Object.values(grouped))
    setLoading(false)
  }

  async function handleAdd() {
    if (!addForm.email || !addForm.role_id) return
    setSaving(true)
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', addForm.email.toLowerCase().trim())
        .single()

      if (!profile) {
        alert('User not found. They must log in at https://procureiq-gdja.onrender.com first.')
        setSaving(false)
        return
      }

      const companyList = addForm.company_id === 'all'
        ? COMPANIES.map(c => c.id)
        : [addForm.company_id]

      for (const cid of companyList) {
        await supabase.from('company_members').upsert({
          user_id: profile.id,
          company_id: cid,
          role_id: addForm.role_id,
          manages_department: addForm.manages_department,
          is_active: true,
        }, { onConflict: 'user_id,company_id' })
      }

      setShowAdd(false)
      setAddForm({ email: '', company_id: 'all', role_id: '', manages_department: false })
      await load()
      alert('User added successfully!')
    } catch (e: any) {
      alert('Error: ' + e.message)
    }
    setSaving(false)
  }

  async function deactivate(userId: string, email: string) {
    if (!confirm(`Deactivate ${email}? They will lose all access.`)) return
    await supabase.from('company_members').update({ is_active: false }).eq('user_id', userId)
    await load()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontFamily: 'sans-serif' }}>Loading users...</div>

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Users & Roles</h1>
          <p style={{ color: '#666', fontSize: 14, margin: '4px 0 0' }}>{users.length} team members</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ background: '#9B72F5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          + Add User
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              {['User', 'Role', 'Entities', 'Actions'].map(h => (
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
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f5f3ff', color: '#7c3aed' }}>
                    {ROLE_MAP[u.role_id] || 'Unknown'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 13 }}>{u.companies.join(', ') || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => deactivate(u.user_id, u.email)}
                    style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff', color: '#dc2626', cursor: 'pointer' }}>
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 480, maxWidth: '94vw', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Add New User</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Email Address *</label>
                <input style={inp} type="email" value={addForm.email}
                  onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                  placeholder="name@finmo.net" />
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
                <label style={lbl}>Role *</label>
                <select style={inp} value={addForm.role_id} onChange={e => setAddForm({ ...addForm, role_id: e.target.value })}>
                  <option value="">Select role...</option>
                  {ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="mgmt" checked={addForm.manages_department}
                  onChange={e => setAddForm({ ...addForm, manages_department: e.target.checked })}
                  style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="mgmt" style={{ fontSize: 13, cursor: 'pointer' }}>
                  Manages Department (approver receives POs from their dept)
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)}
                style={{ padding: '9px 18px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleAdd} disabled={saving || !addForm.email || !addForm.role_id}
                style={{ padding: '9px 18px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#fff',
                  background: (!addForm.email || !addForm.role_id) ? '#c4b5fd' : '#9B72F5' }}>
                {saving ? 'Adding...' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
