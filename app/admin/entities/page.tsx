'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

export default function EntitiesPage() {
  const [entities, setEntities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', currency: 'INR', description: '' })

  const supabase = createClient()

  useEffect(() => { loadEntities() }, [])

  async function loadEntities() {
    setLoading(true)
    const { data, error } = await supabase
      .from('entities')
      .select('*')
      .order('name')
    if (error) console.error('Error loading entities:', error)
    setEntities(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.name || !form.code) return
    setSaving(true)

    const { error } = await supabase.from('entities').insert({
      name: form.name,
      code: form.code.toUpperCase(),
      currency: form.currency,
      description: form.description || null,
    })

    if (error) {
      alert('Error saving entity: ' + error.message)
    } else {
      setShowForm(false)
      setForm({ name:'', code:'', currency:'INR', description:'' })
      await loadEntities()
    }
    setSaving(false)
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  const colors = ['#9B72F5','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4']

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading entities...</div>

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Manage Entities</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>{entities.length} entities configured</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Add Entity
        </button>
      </div>

      {entities.length === 0 ? (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'64px', textAlign:'center' }}>
          <div style={{ fontSize:'48px', marginBottom:'16px' }}>🏢</div>
          <h3 style={{ fontSize:'18px', fontWeight:'600', marginBottom:'8px', color:'#374151' }}>No entities yet</h3>
          <p style={{ color:'#9ca3af', marginBottom:'24px' }}>Add your first company entity to get started</p>
          <button onClick={() => setShowForm(true)}
            style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 20px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
            + Add First Entity
          </button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:'16px' }}>
          {entities.map((e, i) => (
            <div key={e.id} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'24px', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:'4px', background: colors[i % colors.length] }}/>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'16px' }}>
                <div style={{ width:'48px', height:'48px', borderRadius:'12px', background: colors[i % colors.length]+'20',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', fontWeight:'700', color: colors[i % colors.length] }}>
                  {e.code?.substring(0,2)}
                </div>
                <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:'#f0fdf4', color:'#16a34a' }}>Active</span>
              </div>
              <h3 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'4px', color:'#111827' }}>{e.name}</h3>
              <div style={{ fontSize:'13px', color:'#6b7280', marginBottom:'8px' }}>{e.description || 'No description'}</div>
              <div style={{ display:'flex', gap:'12px', fontSize:'12px', color:'#9ca3af' }}>
                <span style={{ padding:'3px 8px', borderRadius:'6px', background:'#f3f4f6', color:'#374151', fontWeight:'600', fontFamily:'monospace' }}>{e.code}</span>
                <span style={{ padding:'3px 8px', borderRadius:'6px', background:'#eff6ff', color:'#1d4ed8', fontWeight:'600' }}>{e.currency || 'INR'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop:'20px', padding:'14px 16px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', fontSize:'13px', color:'#1d4ed8' }}>
        <strong>Note:</strong> Each entity has its own suppliers, purchase orders, and approval matrix. Users are automatically given access to all entities when added.
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'480px', maxWidth:'94vw', padding:'28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>Add New Entity</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div>
                <label style={lbl}>Entity / Company Name *</label>
                <input style={inp} value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="e.g. Finmo Technologies Pte Ltd"/>
              </div>
              <div>
                <label style={lbl}>Short Code * (3-6 letters, uppercase)</label>
                <input style={inp} value={form.code} onChange={e => setForm({...form, code:e.target.value.toUpperCase().replace(/[^A-Z]/g,'')})} placeholder="e.g. FINMO, FINSG, FININ" maxLength={6}/>
                <p style={{ fontSize:'11px', color:'#9ca3af', marginTop:'4px' }}>Used as a prefix for PO numbers and labels</p>
              </div>
              <div>
                <label style={lbl}>Currency</label>
                <select style={inp} value={form.currency} onChange={e => setForm({...form, currency:e.target.value})}>
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="SGD">SGD — Singapore Dollar</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Description (optional)</label>
                <input style={inp} value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="e.g. India operations entity"/>
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'24px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.code}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: (!form.name||!form.code) ? '#c4b5fd' : '#9B72F5' }}>
                {saving ? 'Saving...' : 'Create Entity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
