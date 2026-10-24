'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

const ROLES = [
  { code: 'MAKER', label: 'Maker (creates POs)' },
  { code: 'L1_CHECKER', label: 'L1 Approver' },
  { code: 'L2_CHECKER', label: 'L2 Approver' },
  { code: 'L3_CHECKER', label: 'L3 Approver' },
  { code: 'FINANCE', label: 'Finance' },
  { code: 'ADMIN', label: 'Admin' },
]

const DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin']

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [entities, setEntities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editUser, setEditUser] = useState<any>(null)

  const [addForm, setAddForm] = useState({
    email: '',
    entity_id: 'all',
    department: '',
    role: '',
    manages_dept: false,
  })

  const [editForm, setEditForm] = useState({
    department: '',
    role: '',
    manages_dept: false,
    add_entity_id: '',
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    // Load entities
    const { data: entData } = await supabase
      .from('entities')
      .select('id, name, code')
      .order('name')
    setEntities(entData || [])

    // Load users via company_members joined with user_profiles
    const { data: members } = await supabase
      .from('company_members')
      .select('*, profile:user_profiles(id, email, full_name), entity:entities(id, name, code)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (members) {
      // Group by user email
      const grouped: Record<string, any> = {}
      for (const m of members) {
        const email = m.profile?.email || m.user_id
        if (!grouped[email]) {
          grouped[email] = {
            user_id: m.user_id,
            email,
            full_name: m.profile?.full_name || email,
            department: m.department || '',
            role: m.role || '',
            manages_dept: m.manages_dept || false,
            entities: [],
            member_ids: [],
          }
        }
        grouped[email].entities.push(m.entity?.name || m.entity_id || m.company_id)
        grouped[email].member_ids.push(m.id)
      }
      setUsers(Object.values(grouped))
    }
    setLoading(false)
  }

  async function handleAdd() {
    if (!addForm.email || !addForm.role) return
    setSaving(true)

    try {
      // Find the user profile by email
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', addForm.email.toLowerCase().trim())
        .single()

      if (!profile) {
        alert('User not found. They must log in with Google first at procureiq-gdja.onrender.com')
        setSaving(false)
        return
      }

      const entityList = addForm.entity_id === 'all'
        ? entities.map(e => e.id)
        : [addForm.entity_id]

      for (const eid of entityList) {
        await supabase.from('company_members').upsert({
          user_id: profile.id,
          entity_id: eid,
          role: addForm.role,
          department: addForm.department || null,
          manages_dept: addForm.manages_dept,
          is_active: true,
        }, { onConflict: 'user_id,entity_id' })
      }

      setShowAdd(false)
      setAddForm({ email:'', entity_id:'all', department:'', role:'', manages_dept:false })
      await init()
      alert('User added successfully!')
    } catch (e: any) {
      alert('Error adding user: ' + e.message)
    }
    setSaving(false)
  }

  async function handleEdit() {
    if (!editUser) return
    setSaving(true)

    try {
      // Update all existing memberships for this user
      await supabase.from('company_members')
        .update({
          role: editForm.role,
          department: editForm.department || null,
          manages_dept: editForm.manages_dept,
        })
        .eq('user_id', editUser.user_id)
        .eq('is_active', true)

      // Add new entity access if selected
      if (editForm.add_entity_id) {
        await supabase.from('company_members').upsert({
          user_id: editUser.user_id,
          entity_id: editForm.add_entity_id,
          role: editForm.role,
          department: editForm.department || null,
          manages_dept: editForm.manages_dept,
          is_active: true,
        }, { onConflict: 'user_id,entity_id' })
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
    if (!confirm(`Deactivate ${email}? They will lose access to all entities.`)) return
    await supabase.from('company_members')
      .update({ is_active: false })
      .eq('user_id', userId)
    await init()
  }

  function openEdit(u: any) {
    setEditUser(u)
    setEditForm({
      department: u.department || '',
      role: u.role || '',
      manages_dept: u.manages_dept || false,
      add_entity_id: '',
    })
    setShowEdit(true)
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  const roleLabel = (code: string) => ROLES.find(r => r.code === code)?.label || code

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
              {['User','Role','Dept','Entities','Actions'].map(h => (
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
                    {roleLabel(u.role)}
                  </span>
                  {u.manages_dept && <div style={{ fontSize:'11px', color:'#059669', marginTop:'4px' }}>✓ Manages dept</div>}
                </td>
                <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{u.department || '—'}</td>
                <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{u.entities.join(', ') || '—'}</td>
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
              <tr><td colSpan={5} style={{ padding:'32px', textAlign:'center', color:'#9ca3af' }}>No users yet. Click + Add User.</td></tr>
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
            <p style={{ fontSize:'13px', color:'#9ca3af', marginBottom:'20px', marginTop:0 }}>Select entity access, department and role</p>

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
                <select style={inp} value={addForm.entity_id} onChange={e => setAddForm({...addForm, entity_id:e.target.value})}>
                  <option value="all">All Entities ({entities.length})</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
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
                <select style={inp} value={addForm.role} onChange={e => setAddForm({...addForm, role:e.target.value})}>
                  <option value="">Select role...</option>
                  {ROLES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <input type="checkbox" id="manages_dept_add" checked={addForm.manages_dept}
                  onChange={e => setAddForm({...addForm, manages_dept:e.target.checked})}
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
              <button onClick={handleAdd} disabled={saving || !addForm.email || !addForm.role}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: (!addForm.email||!addForm.role) ? '#c4b5fd' : '#9B72F5' }}>
                {saving ? 'Adding...' : `Add to ${addForm.entity_id === 'all' ? `all ${entities.length}` : '1'} ${addForm.entity_id === 'all' && entities.length !== 1 ? 'entities' : 'entity'}`}
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
                <select style={inp} value={editForm.role} onChange={e => setEditForm({...editForm, role:e.target.value})}>
                  <option value="">Select role...</option>
                  {ROLES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <input type="checkbox" id="manages_dept_edit" checked={editForm.manages_dept}
                  onChange={e => setEditForm({...editForm, manages_dept:e.target.checked})}
                  style={{ width:'16px', height:'16px', cursor:'pointer' }}/>
                <label htmlFor="manages_dept_edit" style={{ fontSize:'13px', color:'#374151', cursor:'pointer' }}>
                  Manages Department
                </label>
              </div>

              <div>
                <label style={lbl}>Add Access to Entity (optional)</label>
                <select style={inp} value={editForm.add_entity_id} onChange={e => setEditForm({...editForm, add_entity_id:e.target.value})}>
                  <option value="">No additional entity</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
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
