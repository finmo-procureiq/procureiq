'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

const DEFAULT_DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin']

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newDept, setNewDept] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadDepartments() }, [])

  async function loadDepartments() {
    setLoading(true)
    const { data } = await supabase
      .from('departments')
      .select('name')
      .order('name')

    if (data && data.length > 0) {
      setDepartments(data.map((d: any) => d.name))
    } else {
      setDepartments(DEFAULT_DEPARTMENTS)
    }
    setLoading(false)
  }

  async function handleAdd() {
    if (!newDept.trim()) return
    setSaving(true)

    const { error } = await supabase
      .from('departments')
      .insert({ name: newDept.trim() })

    if (error) {
      if (!departments.includes(newDept.trim())) {
        setDepartments([...departments, newDept.trim()].sort())
      }
    } else {
      await loadDepartments()
    }

    setNewDept('')
    setShowForm(false)
    setSaving(false)
  }

  async function handleDelete(name: string) {
    if (!confirm(`Remove department "${name}"?`)) return

    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('name', name)

    if (error) {
      setDepartments(departments.filter(d => d !== name))
    } else {
      await loadDepartments()
    }
  }

  const deptColors = ['#9B72F5','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#14B8A6','#F97316','#84CC16','#6366F1']

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading departments...</div>

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Departments</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>{departments.length} departments configured</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Add Department
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'12px', marginBottom:'24px' }}>
        {departments.map((dept, i) => (
          <div key={dept} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', background: deptColors[i % deptColors.length]+'20',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:'700', color: deptColors[i % deptColors.length] }}>
                {dept.substring(0,1)}
              </div>
              <span style={{ fontSize:'14px', fontWeight:'500', color:'#374151' }}>{dept}</span>
            </div>
            <button onClick={() => handleDelete(dept)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:'16px', padding:'4px', lineHeight:'1' }}>
              ×
            </button>
          </div>
        ))}
      </div>

      <div style={{ padding:'14px 16px', background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:'8px', fontSize:'13px', color:'#5b21b6' }}>
        <strong>Tip:</strong> Departments are used when creating purchase requests. Making the department field mandatory helps track spend by department in the analytics dashboard.
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'400px', maxWidth:'94vw', padding:'28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>Add Department</h2>
              <button onClick={() => { setShowForm(false); setNewDept('') }} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>

            <div>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }}>Department Name *</label>
              <input
                style={{ width:'100%', padding:'10px 12px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'14px', outline:'none', boxSizing:'border-box' }}
                value={newDept}
                onChange={e => setNewDept(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="e.g. Operations, Product, Engineering"
                autoFocus
              />
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
              <button onClick={() => { setShowForm(false); setNewDept('') }}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleAdd} disabled={saving || !newDept.trim()}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: !newDept.trim() ? '#c4b5fd' : '#9B72F5' }}>
                {saving ? 'Adding...' : 'Add Department'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}