'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

const DEFAULT_DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin']

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<string[]>([])
  const [newDept, setNewDept] = useState('')
  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadDepartments() }, [])

  async function loadDepartments() {
    const { data } = await supabase.from('departments').select('name').order('name')
    if (data?.length) {
      setDepartments(data.map((d: any) => d.name))
    } else {
      setDepartments(DEFAULT_DEPARTMENTS)
    }
  }

  async function addDepartment() {
    if (!newDept.trim()) return
    const name = newDept.trim()
    if (departments.includes(name)) { alert('Department already exists'); return }
    setLoading(true)
    await supabase.from('departments').upsert({ name }, { onConflict: 'name' })
    setNewDept('')
    await loadDepartments()
    setLoading(false)
  }

  async function deleteDepartment(name: string) {
    if (!confirm(`Delete "${name}" department? This won't affect existing POs.`)) return
    await supabase.from('departments').delete().eq('name', name)
    await loadDepartments()
  }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'700px', margin:'0 auto' }}>
      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Manage Departments</h1>
        <p style={{ color:'#666', fontSize:'14px' }}>Add or remove departments used across the app</p>
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'20px', marginBottom:'20px' }}>
        <div style={{ display:'flex', gap:'10px' }}>
          <input
            style={{ flex:1, padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none' }}
            value={newDept}
            onChange={e => setNewDept(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDepartment()}
            placeholder="e.g. Product, Engineering, Legal..."
          />
          <button onClick={addDepartment} disabled={loading || !newDept.trim()}
            style={{ padding:'9px 20px', background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', whiteSpace:'nowrap' }}>
            + Add
          </button>
        </div>
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
        {departments.length === 0 ? (
          <div style={{ padding:'40px', textAlign:'center', color:'#9ca3af' }}>No departments yet.</div>
        ) : departments.map((dept, i) => (
          <div key={dept} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom: i < departments.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#9B72F5' }}></div>
              <span style={{ fontSize:'14px', fontWeight:'500' }}>{dept}</span>
            </div>
            <button onClick={() => deleteDepartment(dept)}
              style={{ fontSize:'12px', padding:'4px 10px', border:'1px solid #fecaca', borderRadius:'6px', background:'#fff', color:'#dc2626', cursor:'pointer' }}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop:'16px', padding:'12px 16px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', fontSize:'13px', color:'#1d4ed8' }}>
        Departments added here will automatically appear in the dropdowns when creating requests and adding users.
      </div>
    </div>
  )
}