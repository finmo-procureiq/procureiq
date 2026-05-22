'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { getActiveCompanyId } from '@/lib/company'

export default function MatrixPage() {
  const [matrix, setMatrix] = useState<any[]>([])
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [editing, setEditing] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    min_amount:'0', max_amount:'', required_levels:['L1','L2'], escalation_hrs:'48'
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])
  useEffect(() => { if (companyId) loadMatrix() }, [companyId])

  async function init() {
    const cid = await getActiveCompanyId()
    setCompanyId(cid)
    const { data } = await supabase.from('companies').select('name').eq('id', cid).single()
    if (data) setCompanyName(data.name)
  }

  async function loadMatrix() {
    const { data } = await supabase.from('approval_matrix')
      .select('*').eq('company_id', companyId)
      .order('min_amount')
    setMatrix(data || [])
  }

  async function handleSave() {
    setLoading(true)
    const payload = {
      company_id: companyId,
      min_amount: parseFloat(form.min_amount) || 0,
      max_amount: form.max_amount ? parseFloat(form.max_amount) : null,
      required_levels: form.required_levels,
      escalation_hrs: parseInt(form.escalation_hrs) || 48,
      is_active: true,
    }
    if (editing) {
      await supabase.from('approval_matrix').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('approval_matrix').insert(payload)
    }
    setLoading(false)
    setEditing(null)
    setShowForm(false)
    setForm({ min_amount:'0', max_amount:'', required_levels:['L1','L2'], escalation_hrs:'48' })
    loadMatrix()
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this rule?')) return
    await supabase.from('approval_matrix').delete().eq('id', id)
    loadMatrix()
  }

  function toggleLevel(level: string) {
    const levels = form.required_levels.includes(level)
      ? form.required_levels.filter(l => l !== level)
      : [...form.required_levels, level].sort()
    setForm({...form, required_levels: levels})
  }

  function openEdit(rule: any) {
    setEditing(rule)
    setForm({
      min_amount: String(rule.min_amount),
      max_amount: rule.max_amount ? String(rule.max_amount) : '',
      required_levels: rule.required_levels,
      escalation_hrs: String(rule.escalation_hrs)
    })
    setShowForm(true)
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1000px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Approval Matrix</h1>
          <p style={{ color:'#666', fontSize:'14px' }}>Configure approval thresholds for {companyName}</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ min_amount:'0', max_amount:'', required_levels:['L1','L2'], escalation_hrs:'48' }); setShowForm(true) }}
          style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + Add Rule
        </button>
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden', marginBottom:'24px' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              {['Min Amount','Max Amount','Required Approvals','Escalation Hours','Actions'].map(h => (
                <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.length === 0 ? (
              <tr><td colSpan={5} style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>No rules yet. Click "+ Add Rule" to create one.</td></tr>
            ) : matrix.map(rule => (
              <tr key={rule.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                <td style={{ padding:'12px 16px', fontWeight:'600' }}>
                  {Number(rule.min_amount).toLocaleString()}
                </td>
                <td style={{ padding:'12px 16px', color:'#6b7280' }}>
                  {rule.max_amount ? Number(rule.max_amount).toLocaleString() : 'No limit'}
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                    {rule.required_levels.map((l: string) => (
                      <span key={l} style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:'#eff6ff', color:'#2563eb' }}>{l}</span>
                    ))}
                  </div>
                </td>
                <td style={{ padding:'12px 16px', color:'#6b7280' }}>{rule.escalation_hrs} hrs</td>
                <td style={{ padding:'12px 16px' }}>
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={() => openEdit(rule)}
                      style={{ fontSize:'12px', padding:'4px 10px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'#fff', cursor:'pointer' }}>
                      Edit
                    </button>
                    <button onClick={() => deleteRule(rule.id)}
                      style={{ fontSize:'12px', padding:'4px 10px', border:'1px solid #fecaca', borderRadius:'6px', background:'#fff', cursor:'pointer', color:'#dc2626' }}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'12px', padding:'16px', fontSize:'13px', color:'#92400e' }}>
        <strong>How it works:</strong> When a PO is submitted, the system matches the amount to a rule and requires all listed approval levels. L1 = Dept Head, L2 = Finance Manager, L3 = CFO.
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'480px', maxWidth:'94vw', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600' }}>{editing ? 'Edit Rule' : 'Add Approval Rule'}</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <div style={{ display:'grid', gap:'12px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div>
                  <label style={lbl}>Min Amount *</label>
                  <input style={inp} type="number" value={form.min_amount}
                    onChange={e => setForm({...form, min_amount:e.target.value})} placeholder="0"/>
                </div>
                <div>
                  <label style={lbl}>Max Amount (blank = no limit)</label>
                  <input style={inp} type="number" value={form.max_amount}
                    onChange={e => setForm({...form, max_amount:e.target.value})} placeholder="No limit"/>
                </div>
              </div>
              <div>
                <label style={lbl}>Required Approval Levels *</label>
                <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'4px' }}>
                  {['L1','L2','L3'].map(level => (
                    <button key={level} onClick={() => toggleLevel(level)}
                      style={{ padding:'8px 16px', borderRadius:'8px', border:`2px solid ${form.required_levels.includes(level)?'#2563eb':'#e5e7eb'}`, background:form.required_levels.includes(level)?'#eff6ff':'#fff', color:form.required_levels.includes(level)?'#2563eb':'#374151', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
                      {level} {level==='L1'?'(Dept Head)':level==='L2'?'(Finance Mgr)':'(CFO)'}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize:'11px', color:'#9ca3af', marginTop:'6px' }}>Selected: {form.required_levels.join(' + ') || 'None'}</p>
              </div>
              <div>
                <label style={lbl}>Escalation Hours (auto-escalate if no action)</label>
                <select style={inp} value={form.escalation_hrs} onChange={e => setForm({...form, escalation_hrs:e.target.value})}>
                  <option value="24">24 hours</option>
                  <option value="48">48 hours</option>
                  <option value="72">72 hours</option>
                  <option value="96">96 hours</option>
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'20px' }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex:1, padding:'10px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={loading || form.required_levels.length === 0}
                style={{ flex:1, padding:'10px', border:'none', borderRadius:'8px', background: form.required_levels.length===0?'#93c5fd':'#2563eb', color:'#fff', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
                {loading ? 'Saving...' : editing ? 'Update Rule' : 'Add Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}