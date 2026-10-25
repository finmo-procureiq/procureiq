'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

// Approver Delegation — out-of-office coverage
// Stores delegations in the `approver_delegations` table.
// If the table doesn't exist yet, shows a setup banner with the SQL to run.

interface Delegation {
  id: string
  delegator_id: string
  delegator_name: string
  delegator_email: string
  delegate_id: string
  delegate_name: string
  delegate_email: string
  from_date: string
  to_date: string
  reason: string
  is_active: boolean
  created_at: string
  company_id: string
}

const lbl: React.CSSProperties = { fontSize:'12px', fontWeight:'500', color:'#374151', marginBottom:'4px', display:'block' }
const inp: React.CSSProperties = { width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:'7px', fontSize:'13px', outline:'none', boxSizing:'border-box' }

export default function DelegationPage() {
  const [delegations, setDelegations] = useState<Delegation[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState('')
  const [user, setUser] = useState<any>(null)

  const [form, setForm] = useState({
    delegator_id: '',
    delegate_id: '',
    from_date: new Date().toISOString().slice(0, 10),
    to_date: '',
    reason: '',
  })

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    setUser(u)

    // Get company
    const { data: membs } = await supabase
      .from('company_members').select('company_id').eq('user_id', u.id).eq('is_active', true)
    const cid = membs?.[0]?.company_id || ''
    setCompanyId(cid)

    // Load team members for the dropdowns
    if (cid) {
      const { data: teamMembers } = await supabase
        .from('company_members')
        .select('user_id, user_profiles(full_name, email), roles')
        .eq('company_id', cid)
        .eq('is_active', true)
      setMembers(teamMembers || [])
    }

    // Try to load delegations
    await loadDelegations(cid)
    setLoading(false)
  }

  async function loadDelegations(cid?: string) {
    const id = cid || companyId
    if (!id) return
    try {
      const { data, error } = await supabase
        .from('approver_delegations')
        .select('*')
        .eq('company_id', id)
        .order('created_at', { ascending: false })

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setTableExists(false)
        } else {
          console.error('Delegation load error:', error)
        }
        return
      }
      setTableExists(true)
      setDelegations(data || [])
    } catch {
      setTableExists(false)
    }
  }

  function getMember(userId: string) {
    const m = members.find((m: any) => m.user_id === userId)
    const profile = (m?.user_profiles as any)
    return {
      name: profile?.full_name || profile?.email || userId,
      email: profile?.email || '',
      roles: m?.roles || [],
    }
  }

  async function saveDelegation() {
    if (!form.delegator_id || !form.delegate_id || !form.from_date || !form.to_date) {
      alert('Please fill in all required fields.')
      return
    }
    if (form.delegator_id === form.delegate_id) {
      alert('Delegator and delegate must be different people.')
      return
    }
    setSaving(true)
    try {
      const delegator = getMember(form.delegator_id)
      const delegate = getMember(form.delegate_id)

      const { error } = await supabase.from('approver_delegations').insert({
        company_id: companyId,
        delegator_id: form.delegator_id,
        delegator_name: delegator.name,
        delegator_email: delegator.email,
        delegate_id: form.delegate_id,
        delegate_name: delegate.name,
        delegate_email: delegate.email,
        from_date: form.from_date,
        to_date: form.to_date,
        reason: form.reason,
        is_active: true,
      })

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setTableExists(false)
        } else {
          alert('Error saving: ' + error.message)
        }
        setSaving(false)
        return
      }

      setShowForm(false)
      setForm({ delegator_id:'', delegate_id:'', from_date: new Date().toISOString().slice(0,10), to_date:'', reason:'' })
      await loadDelegations()
    } catch(e: any) {
      alert('Error: ' + e.message)
    }
    setSaving(false)
  }

  async function toggleActive(d: Delegation) {
    await supabase.from('approver_delegations').update({ is_active: !d.is_active }).eq('id', d.id)
    await loadDelegations()
  }

  async function deleteDelegation(id: string) {
    if (!confirm('Delete this delegation?')) return
    await supabase.from('approver_delegations').delete().eq('id', id)
    await loadDelegations()
  }

  const today = new Date().toISOString().slice(0, 10)
  const activeDelegations = delegations.filter(d => d.is_active && d.from_date <= today && d.to_date >= today)
  const upcomingDelegations = delegations.filter(d => d.is_active && d.from_date > today)
  const expiredDelegations = delegations.filter(d => !d.is_active || d.to_date < today)

  const createTableSQL = `-- Run this in your Supabase SQL editor to enable Approver Delegation
CREATE TABLE IF NOT EXISTS approver_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  delegator_id UUID NOT NULL REFERENCES auth.users(id),
  delegator_name TEXT,
  delegator_email TEXT,
  delegate_id UUID NOT NULL REFERENCES auth.users(id),
  delegate_name TEXT,
  delegate_email TEXT,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Enable RLS
ALTER TABLE approver_delegations ENABLE ROW LEVEL SECURITY;
-- Policy: company members can read
CREATE POLICY "company read" ON approver_delegations
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND is_active = true
    )
  );
-- Policy: company members can insert/update/delete
CREATE POLICY "company write" ON approver_delegations
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid() AND is_active = true
    )
  );`

  if (loading) return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', color:'#9ca3af' }}>Loading...</div>
  )

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1000px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Approver Delegation</h1>
          <p style={{ color:'#666', fontSize:'14px' }}>Assign out-of-office coverage — delegate approval authority to another user for a date range</p>
        </div>
        {tableExists && (
          <button onClick={() => setShowForm(true)}
            style={{ padding:'9px 18px', border:'none', borderRadius:'8px', background:'#9B72F5', color:'#fff', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
            + New Delegation
          </button>
        )}
      </div>

      {/* Setup banner if table doesn't exist */}
      {!tableExists && (
        <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'12px', padding:'20px', marginBottom:'24px' }}>
          <div style={{ fontWeight:'600', color:'#92400e', marginBottom:'8px' }}>⚠️ One-time setup required</div>
          <p style={{ color:'#78350f', fontSize:'13px', marginBottom:'12px' }}>
            The <code>approver_delegations</code> table doesn't exist yet. Run the SQL below in your Supabase SQL editor to enable this feature.
          </p>
          <pre style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'14px', fontSize:'11px', overflowX:'auto', color:'#374151', lineHeight:'1.6' }}>
            {createTableSQL}
          </pre>
          <button onClick={() => { navigator.clipboard.writeText(createTableSQL); alert('SQL copied to clipboard!') }}
            style={{ marginTop:'10px', padding:'7px 14px', border:'1px solid #d97706', borderRadius:'7px', background:'#fff', color:'#d97706', fontSize:'13px', cursor:'pointer' }}>
            📋 Copy SQL
          </button>
        </div>
      )}

      {/* Active now */}
      {activeDelegations.length > 0 && (
        <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'12px', padding:'16px', marginBottom:'20px' }}>
          <div style={{ fontSize:'13px', fontWeight:'600', color:'#16a34a', marginBottom:'10px' }}>✓ CURRENTLY ACTIVE</div>
          {activeDelegations.map(d => (
            <div key={d.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #bbf7d0' }}>
              <div>
                <span style={{ fontWeight:'500', fontSize:'13px' }}>{d.delegator_name}</span>
                <span style={{ color:'#6b7280', fontSize:'13px' }}> → </span>
                <span style={{ fontWeight:'500', fontSize:'13px', color:'#16a34a' }}>{d.delegate_name}</span>
                <span style={{ color:'#9ca3af', fontSize:'12px', marginLeft:'10px' }}>{d.from_date} to {d.to_date}</span>
              </div>
              {d.reason && <span style={{ fontSize:'12px', color:'#6b7280', fontStyle:'italic', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.reason}</span>}
            </div>
          ))}
        </div>
      )}

      {/* All delegations table */}
      {tableExists && delegations.length > 0 ? (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead style={{ background:'#f9fafb' }}>
              <tr>
                {['Delegator (Out of Office)','Delegate (Covering)','Period','Reason','Status',''].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {delegations.map(d => {
                const isNow = d.is_active && d.from_date <= today && d.to_date >= today
                const isUpcoming = d.is_active && d.from_date > today
                const isExpired = !d.is_active || d.to_date < today
                const statusLabel = isNow ? 'Active' : isUpcoming ? 'Upcoming' : 'Expired'
                const statusColor = isNow ? '#16a34a' : isUpcoming ? '#2563eb' : '#9ca3af'
                const statusBg = isNow ? '#f0fdf4' : isUpcoming ? '#eff6ff' : '#f9fafb'
                return (
                  <tr key={d.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ fontWeight:'500' }}>{d.delegator_name}</div>
                      <div style={{ fontSize:'11px', color:'#9ca3af' }}>{d.delegator_email}</div>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ fontWeight:'500', color:'#374151' }}>{d.delegate_name}</div>
                      <div style={{ fontSize:'11px', color:'#9ca3af' }}>{d.delegate_email}</div>
                    </td>
                    <td style={{ padding:'12px 14px', color:'#6b7280', fontSize:'12px', whiteSpace:'nowrap' }}>
                      {d.from_date} → {d.to_date}
                    </td>
                    <td style={{ padding:'12px 14px', color:'#6b7280', fontSize:'12px', maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {d.reason || '—'}
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:statusBg, color:statusColor }}>
                        {statusLabel}
                      </span>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex', gap:'6px' }}>
                        {!isExpired && (
                          <button onClick={() => toggleActive(d)}
                            style={{ padding:'4px 10px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'#fff', fontSize:'11px', cursor:'pointer', color:'#6b7280' }}>
                            {d.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                        <button onClick={() => deleteDelegation(d.id)}
                          style={{ padding:'4px 10px', border:'1px solid #fecaca', borderRadius:'6px', background:'#fff', fontSize:'11px', cursor:'pointer', color:'#dc2626' }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : tableExists ? (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'48px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>
          No delegations set up yet. Use "+ New Delegation" to add out-of-office coverage.
        </div>
      ) : null}

      {/* New Delegation Form */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'520px', maxWidth:'94vw', padding:'28px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>New Delegation</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>✕</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div>
                <label style={lbl}>Delegator (person going out of office) *</label>
                <select style={inp} value={form.delegator_id} onChange={e => setForm({...form, delegator_id: e.target.value})}>
                  <option value="">— Select approver —</option>
                  {members
                    .filter((m: any) => (m.roles || []).some((r: string) => ['L1_CHECKER','L2_CHECKER','L3_CHECKER','ADMIN','SUPER_ADMIN'].includes(r)))
                    .map((m: any) => {
                      const p = m.user_profiles as any
                      return <option key={m.user_id} value={m.user_id}>{p?.full_name || p?.email} ({(m.roles || []).join(', ')})</option>
                    })}
                </select>
              </div>

              <div>
                <label style={lbl}>Delegate (person who will cover) *</label>
                <select style={inp} value={form.delegate_id} onChange={e => setForm({...form, delegate_id: e.target.value})}>
                  <option value="">— Select delegate —</option>
                  {members
                    .filter((m: any) => m.user_id !== form.delegator_id)
                    .map((m: any) => {
                      const p = m.user_profiles as any
                      return <option key={m.user_id} value={m.user_id}>{p?.full_name || p?.email} ({(m.roles || []).join(', ')})</option>
                    })}
                </select>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div>
                  <label style={lbl}>From Date *</label>
                  <input type="date" style={inp} value={form.from_date} onChange={e => setForm({...form, from_date: e.target.value})} />
                </div>
                <div>
                  <label style={lbl}>To Date *</label>
                  <input type="date" style={inp} value={form.to_date} min={form.from_date} onChange={e => setForm({...form, to_date: e.target.value})} />
                </div>
              </div>

              <div>
                <label style={lbl}>Reason / Notes</label>
                <input style={inp} value={form.reason} placeholder="e.g. Annual leave, Medical leave..." onChange={e => setForm({...form, reason: e.target.value})} />
              </div>

              <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:'8px', padding:'12px', fontSize:'12px', color:'#0369a1' }}>
                <strong>How it works:</strong> During the delegation period, the delegate will receive approval notifications on behalf of the delegator and can action any POs that require the delegator's level of approval.
              </div>
            </div>

            <div style={{ display:'flex', gap:'8px', marginTop:'20px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding:'8px 16px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'13px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={saveDelegation} disabled={saving || !form.delegator_id || !form.delegate_id || !form.to_date}
                style={{ padding:'8px 18px', border:'none', borderRadius:'8px', background: saving ? '#d1d5db' : '#9B72F5', color:'#fff', fontSize:'13px', fontWeight:'500', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving...' : 'Save Delegation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
