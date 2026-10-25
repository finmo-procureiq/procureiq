'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

const colors = ['#9B72F5', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']

export default function EntitiesPage() {
  const [entities, setEntities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', currency: 'SGD', country: '' })
  const supabase = createClient()

  useEffect(() => {
    loadEntities()
  }, [])

  async function loadEntities() {
    setLoading(true)
    const res = await fetch('/api/companies')
    const data = await res.json()
    if (Array.isArray(data)) setEntities(data)
    setLoading(false)
  }

  async function handleSave() {
    if (!form.name || !form.code) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('companies').insert({
        name: form.name,
        code: form.code.toUpperCase(),
        currency: form.currency,
        country: form.country || null,
        is_active: true,
      }).select().single()

      if (error) {
        alert('Error creating entity: ' + error.message)
      } else {
        setEntities(prev => [...prev, data])
        setShowForm(false)
        setForm({ name: '', code: '', currency: 'SGD', country: '' })
      }
    } catch (e: any) {
      alert('Error: ' + e.message)
    }
    setSaving(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Manage Entities</h1>
          <p style={{ color: '#666', fontSize: 14, margin: '4px 0 0' }}>
            {loading ? 'Loading...' : `${entities.length} entities configured`}
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background: '#9B72F5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          + Add Entity
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading entities…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {entities.map((e, i) => (
            <div key={e.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: colors[i % colors.length] }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: colors[i % colors.length] + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: colors[i % colors.length] }}>
                  {(e.code || e.name)?.substring(0, 2).toUpperCase()}
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: e.is_active !== false ? '#f0fdf4' : '#fef2f2',
                  color: e.is_active !== false ? '#16a34a' : '#dc2626' }}>
                  {e.is_active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px', color: '#111827' }}>{e.name}</h3>
              {e.country && (
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>{e.country}</p>
              )}
              <div style={{ display: 'flex', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
                {e.code && (
                  <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f3f4f6', color: '#374151', fontWeight: 600, fontFamily: 'monospace' }}>{e.code}</span>
                )}
                {e.currency && (
                  <span style={{ padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}>{e.currency}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 440, maxWidth: '94vw', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Add New Entity</h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Entity / Company Name *</label>
                <input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Finmo Technologies Pte Ltd" />
              </div>
              <div>
                <label style={lbl}>Short Code * (3–6 letters)</label>
                <input style={inp} value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
                  placeholder="e.g. FINSG" maxLength={6} />
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Used as prefix for PO numbers</p>
              </div>
              <div>
                <label style={lbl}>Country</label>
                <input style={inp} value={form.country} onChange={e => setForm({ ...form, country: e.target.value })}
                  placeholder="e.g. Singapore" />
              </div>
              <div>
                <label style={lbl}>Currency</label>
                <select style={inp} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                  <option value="SGD">SGD — Singapore Dollar</option>
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="AUD">AUD — Australian Dollar</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding: '9px 18px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.code}
                style={{ padding: '9px 18px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#fff',
                  background: (!form.name || !form.code) ? '#c4b5fd' : '#9B72F5' }}>
                {saving ? 'Saving...' : 'Create Entity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
