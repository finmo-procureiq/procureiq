'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

// approval_requests real columns:
// id, entity_id, document_type, document_id, status, submitted_by,
// submitted_at, approved_by, approved_at, rejected_by, rejected_at,
// reject_reason, created_at, level, notes, amount_usd, responded_at

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [userRoles, setUserRoles] = useState<string[]>([])
  const [entityId, setEntityId] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [allHistory, setAllHistory] = useState<any[]>([])
  const [acting, setActing] = useState(false)
  const [notes, setNotes] = useState('')
  const [showActionModal, setShowActionModal] = useState<{ request: any; action: 'approve' | 'reject' } | null>(null)
  const [historyAll, setHistoryAll] = useState<any[]>([])
  const [sameLevel, setSameLevel] = useState<any[]>([])
  const [companiesMap, setCompaniesMap] = useState<Record<string, { code: string; currency: string; name: string }>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)

  const supabase = createClient()
  useEffect(() => { init() }, [])

  async function init() {
    try {
      // Load companies from API (bypasses RLS)
      const cosRes = await fetch('/api/companies')
      const cosData = await cosRes.json()
      if (Array.isArray(cosData)) {
        const map: Record<string, { code: string; currency: string; name: string }> = {}
        cosData.forEach((c: any) => { map[c.id] = { code: c.code, currency: c.currency, name: c.name } })
        setCompaniesMap(map)
      }

      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return
      setUser(u)

      // Load roles across ALL entities the user belongs to
      const { data: members } = await supabase
        .from('company_members')
        .select('company_id, roles')
        .eq('user_id', u.id)
        .eq('is_active', true)

      if (members && members.length > 0) {
        // Collect all unique roles across all entities
        const allRoles = Array.from(new Set(members.flatMap((m: any) => m.roles || [])))
        setUserRoles(allRoles)
        setEntityId(members[0].company_id)
        await loadAll(u.id)
      }
    } catch (e) {
      console.error('init error:', e)
    }
    setLoading(false)
  }

  async function loadAll(userId: string) {
    // Pending: approval_requests where submitted_by = this user (approver) AND status = 'submitted'
    // Note: in this schema, submitted_by stores the APPROVER's user_id (the person who needs to act)
    const { data: pendingRaw, error: pendingErr } = await supabase
      .from('approval_requests')
      .select('*')
      .eq('submitted_by', userId)
      .eq('document_type', 'purchase_order')
      .in('status', ['submitted', 'pending'])
      .order('created_at', { ascending: false })

    if (pendingErr) console.error('pending query error:', pendingErr)

    // Fetch related POs separately to avoid FK join issues
    const pending = []
    for (const ar of (pendingRaw || [])) {
      const { data: po } = await supabase
        .from('purchase_orders')
        .select('id, po_number, title, amount, currency, department, description, justification, invoice_ref, status, current_level, required_levels, created_at, company_id, created_by')
        .eq('id', ar.document_id)
        .single()
      pending.push({ ...ar, purchase_order: po })
    }

    setRequests(pending)

    // History: acted on (approved or rejected) by this user
    const { data: historyRaw } = await supabase
      .from('approval_requests')
      .select('*')
      .eq('submitted_by', userId)
      .eq('document_type', 'purchase_order')
      .in('status', ['approved', 'rejected'])
      .order('responded_at', { ascending: false })
      .limit(50)

    const history = []
    for (const ar of (historyRaw || [])) {
      const { data: po } = await supabase
        .from('purchase_orders')
        .select('id, po_number, title, amount, currency, department, status, required_levels')
        .eq('id', ar.document_id)
        .single()
      history.push({ ...ar, purchase_order: po })
    }

    setHistoryAll(history)
  }

  async function loadSameLevelHistory(poId: string, level: string) {
    const { data } = await supabase
      .from('approval_requests')
      .select('*, approver:user_profiles!approval_requests_submitted_by_fkey(full_name, email)')
      .eq('document_id', poId)
      .eq('document_type', 'purchase_order')
      .eq('level', level)
      .neq('status', 'submitted')
    setSameLevel(data || [])

    const { data: all } = await supabase
      .from('approval_requests')
      .select('*, approver:user_profiles!approval_requests_submitted_by_fkey(full_name, email)')
      .eq('document_id', poId)
      .eq('document_type', 'purchase_order')
      .order('created_at', { ascending: true })
    setAllHistory(all || [])
  }

  async function handleAction(approvalRequest: any, action: 'approve' | 'reject') {
    if (!user) return
    setActing(true)

    try {
      const now = new Date().toISOString()
      const po = approvalRequest.purchase_order
      const poCompanyId = po.company_id

      // 1. Mark ALL submitted rows at this level as approved/rejected (clears stale duplicates too)
      const updateData: any = {
        status: action === 'approve' ? 'approved' : 'rejected',
        notes: notes || null,
        responded_at: now,
        approved_by: action === 'approve' ? user.id : null,
        approved_at: action === 'approve' ? now : null,
        rejected_by: action === 'reject' ? user.id : null,
        rejected_at: action === 'reject' ? now : null,
        reject_reason: action === 'reject' ? (notes || null) : null,
      }

      await supabase
        .from('approval_requests')
        .update(updateData)
        .eq('document_id', po.id)
        .eq('document_type', 'purchase_order')
        .eq('level', approvalRequest.level)
        .eq('status', 'submitted')

      if (action === 'reject') {
        // Reject the PO entirely
        await supabase.from('purchase_orders').update({ status: 'rejected' }).eq('id', po.id)
      } else if (approvalRequest.level === 'FINANCE') {
        // Finance is always the final step — mark PO as fully approved
        await supabase.from('purchase_orders').update({ status: 'approved', final_action_at: now }).eq('id', po.id)
      } else {
        // Advance to next level
        const requiredLevels: string[] = po.required_levels || [approvalRequest.level]
        const currentLevelIndex = requiredLevels.indexOf(approvalRequest.level)
        const nextLevelIndex = currentLevelIndex + 1

        if (nextLevelIndex >= requiredLevels.length) {
          // All approval levels done — move to Finance
          await supabase.from('purchase_orders').update({
            status: 'pending_finance',
            current_level: String(nextLevelIndex + 1),
          }).eq('id', po.id)

          const { data: financeMembers } = await supabase
            .from('company_members')
            .select('user_id, roles')
            .eq('company_id', poCompanyId)
            .eq('is_active', true)

          const financeUsers = (financeMembers || [])
            .filter((m: any) => Array.isArray(m.roles) && (m.roles.includes('FINANCE') || m.roles.includes('ADMIN')))
            .map((m: any) => m.user_id)

          if (financeUsers.length > 0) {
            await supabase.from('approval_requests').insert(
              financeUsers.map((uid: string) => ({
                document_id: po.id,
                document_type: 'purchase_order',
                submitted_by: uid,
                status: 'submitted',
                level: 'FINANCE',
              }))
            )
          } else {
            // No finance approvers — auto-approve
            await supabase.from('purchase_orders').update({ status: 'approved' }).eq('id', po.id)
          }
        } else {
          // Move to next approval level
          const nextLevel = requiredLevels[nextLevelIndex]
          const nextStatus = `pending_${nextLevel.toLowerCase()}`

          await supabase.from('purchase_orders').update({
            status: nextStatus,
            current_level: String(nextLevelIndex + 1),
          }).eq('id', po.id)

          const { data: nextMembers } = await supabase
            .from('company_members')
            .select('user_id, roles')
            .eq('company_id', poCompanyId)
            .eq('is_active', true)

          const nextApprovers = (nextMembers || [])
            .filter((m: any) => Array.isArray(m.roles) && (m.roles.includes(nextLevel) || m.roles.includes('ADMIN')))
            .map((m: any) => m.user_id)

          if (nextApprovers.length > 0) {
            await supabase.from('approval_requests').insert(
              nextApprovers.map((uid: string) => ({
                document_id: po.id,
                document_type: 'purchase_order',
                submitted_by: uid,
                status: 'submitted',
                level: nextLevel,
              }))
            )
          }
        }
      }

      setShowActionModal(null)
      setNotes('')
      setSameLevel([])
      setAllHistory([])
      await loadAll(user.id)

      // Fire email notification (non-blocking)
      try {
        // Get maker email from user_profiles
        const { data: makerProfile } = await supabase
          .from('user_profiles')
          .select('email, full_name')
          .eq('id', po.created_by)
          .single()

        const { data: approverProfile } = await supabase
          .from('user_profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()

        if (makerProfile?.email) {
          const isFinalApproval = action === 'approve' &&
            (approvalRequest.level === 'FINANCE' ||
              (po.required_levels || []).indexOf(approvalRequest.level) >= (po.required_levels || []).length - 1)

          fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: action === 'approve' ? 'po_approved' : 'po_rejected',
              data: {
                po: {
                  id: po.id,
                  po_number: po.po_number,
                  amount: po.amount,
                  currency: po.currency,
                  company_id: po.company_id,
                },
                approverName: approverProfile?.full_name || user.email,
                makerEmail: makerProfile.email,
                isFinal: isFinalApproval,
                reason: notes || '—',
              }
            })
          }).catch(() => {})
        }
      } catch (_) { /* email errors are non-fatal */ }

    } catch (e: any) {
      alert('Error: ' + e.message)
    }
    setActing(false)
  }

  async function handleBulkApprove() {
    if (!user || selectedIds.size === 0) return
    if (!confirm(`Approve ${selectedIds.size} PO${selectedIds.size > 1 ? 's' : ''}?`)) return
    setBulkActing(true)
    const toApprove = requests.filter(r => selectedIds.has(r.id))
    for (const req of toApprove) {
      await handleAction(req, 'approve')
    }
    setSelectedIds(new Set())
    setBulkActing(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const fmtAmt = (amount: number, cur: string) => {
    try {
      return new Intl.NumberFormat('en-US', { style:'currency', currency: cur || 'INR', maximumFractionDigits: 2 }).format(amount)
    } catch { return `${cur} ${amount?.toLocaleString()}` }
  }

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pending_l1:      { label: 'Pending L1',      color: '#d97706', bg: '#fef3c7' },
    pending_l2:      { label: 'Pending L2',      color: '#ea580c', bg: '#ffedd5' },
    pending_l3:      { label: 'Pending L3',      color: '#9333ea', bg: '#f3e8ff' },
    pending_finance: { label: 'Pending Finance', color: '#0891b2', bg: '#ecfeff' },
    approved:        { label: 'Approved',        color: '#16a34a', bg: '#f0fdf4' },
    rejected:        { label: 'Rejected',        color: '#dc2626', bg: '#fef2f2' },
    submitted:       { label: 'Submitted',       color: '#d97706', bg: '#fef3c7' },
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading approvals...</div>

  const pendingCount = requests.length

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ marginBottom:'28px' }}>
        <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Approvals</h1>
        <p style={{ color:'#666', fontSize:'14px', margin:0 }}>
          Your roles: {userRoles.length > 0 ? userRoles.join(', ') : 'None assigned'}
          {pendingCount > 0 && <span style={{ marginLeft:'12px', background:'#fef3c7', color:'#d97706', padding:'2px 8px', borderRadius:'20px', fontSize:'12px', fontWeight:'600' }}>{pendingCount} pending</span>}
        </p>
      </div>

      <div style={{ display:'flex', marginBottom:'24px', borderBottom:'1px solid #e5e7eb' }}>
        {(['pending', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'10px 20px', border:'none', background:'none', fontSize:'14px', fontWeight:'500', cursor:'pointer', textTransform:'capitalize',
              borderBottom: tab === t ? '2px solid #9B72F5' : '2px solid transparent',
              color: tab === t ? '#9B72F5' : '#6b7280' }}>
            {t === 'pending' ? `Pending (${pendingCount})` : 'History'}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        requests.length === 0 ? (
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'64px', textAlign:'center' }}>
            <div style={{ fontSize:'48px', marginBottom:'16px' }}>✅</div>
            <h3 style={{ fontSize:'18px', fontWeight:'600', marginBottom:'8px', color:'#374151' }}>All caught up!</h3>
            <p style={{ color:'#9ca3af' }}>No pending approvals for you right now.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {/* Bulk action bar */}
            <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'10px' }}>
              <input type="checkbox"
                checked={selectedIds.size === requests.length && requests.length > 0}
                onChange={e => setSelectedIds(e.target.checked ? new Set(requests.map(r => r.id)) : new Set())}
                style={{ width:'16px', height:'16px', cursor:'pointer', accentColor:'#9B72F5' }}/>
              <span style={{ fontSize:'13px', color:'#6b7280' }}>
                {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} selected`}
              </span>
              {selectedIds.size > 0 && (
                <button onClick={handleBulkApprove} disabled={bulkActing}
                  style={{ marginLeft:'auto', padding:'7px 18px', border:'none', borderRadius:'8px', background:'#16a34a', color:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer', opacity: bulkActing ? 0.7 : 1 }}>
                  {bulkActing ? 'Approving...' : `✓ Approve ${selectedIds.size} Selected`}
                </button>
              )}
            </div>

            {requests.map((req: any) => {
              const po = req.purchase_order
              if (!po) return null
              return (
                <div key={req.id} style={{ background: selectedIds.has(req.id) ? '#faf8ff' : '#fff', border: selectedIds.has(req.id) ? '1px solid #c4b5fd' : '1px solid #e5e7eb', borderRadius:'12px', padding:'20px' }}
                  onMouseEnter={e => { if (!selectedIds.has(req.id)) e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)' }}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow='')}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'16px' }}>
                  <input type="checkbox" checked={selectedIds.has(req.id)} onChange={() => toggleSelect(req.id)}
                    style={{ marginTop:'3px', width:'16px', height:'16px', cursor:'pointer', flexShrink:0, accentColor:'#9B72F5' }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'4px' }}>
                        <span style={{ fontFamily:'monospace', fontSize:'12px', color:'#9ca3af' }}>{po.po_number}</span>
                        <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:'#ede9fe', color:'#7c3aed' }}>
                          Awaiting your {req.level} approval
                        </span>
                      </div>
                      <h3 style={{ fontSize:'16px', fontWeight:'600', margin:'0 0 6px 0', color:'#111827' }}>{po.title}</h3>
                      <div style={{ display:'flex', gap:'16px', fontSize:'13px', color:'#6b7280', flexWrap:'wrap' }}>
                        <span>💰 <strong style={{ color:'#111827' }}>{fmtAmt(po.amount, po.currency)}</strong></span>
                        <span>🏢 {po.department || '—'}</span>
                        {po.supplier?.name && <span>🏭 {po.supplier.name}</span>}
                        <span>👤 {po.creator?.full_name || po.creator?.email || '—'}</span>
                        <span>📅 {new Date(po.created_at).toLocaleDateString('en-IN')}</span>
                      </div>

                      {po.required_levels?.length > 0 && (
                        <div style={{ marginTop:'10px', display:'flex', gap:'4px', alignItems:'center', flexWrap:'wrap' }}>
                          <span style={{ fontSize:'11px', color:'#9ca3af' }}>Chain:</span>
                          {po.required_levels.map((lvl: string, i: number) => (
                            <span key={lvl} style={{ display:'inline-flex', alignItems:'center', gap:'3px' }}>
                              <span style={{
                                padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:'600',
                                background: lvl === req.level ? '#ede9fe' : '#f3f4f6',
                                color: lvl === req.level ? '#7c3aed' : '#9ca3af',
                                border: lvl === req.level ? '1px solid #c4b5fd' : '1px solid #e5e7eb'
                              }}>{lvl}</span>
                              {i < po.required_levels.length - 1 && <span style={{ color:'#d1d5db', fontSize:'10px' }}>→</span>}
                            </span>
                          ))}
                          <span style={{ fontSize:'10px', color:'#d1d5db' }}>→</span>
                          <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', background:'#f3f4f6', color:'#9ca3af', border:'1px solid #e5e7eb' }}>Finance</span>
                        </div>
                      )}

                      {po.description && <p style={{ margin:'8px 0 0', fontSize:'13px', color:'#6b7280' }}>{po.description}</p>}
                      {po.justification && (
                        <div style={{ marginTop:'8px', padding:'8px 12px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'6px', fontSize:'12px', color:'#92400e' }}>
                          <strong>Justification:</strong> {po.justification}
                        </div>
                      )}
                    </div>

                    <div style={{ display:'flex', gap:'8px', flexShrink:0, alignItems:'flex-start' }}>
                      <button
                        onClick={async () => { await loadSameLevelHistory(po.id, req.level); setShowActionModal({ request: req, action: 'reject' }) }}
                        style={{ padding:'8px 16px', border:'1px solid #fecaca', borderRadius:'8px', background:'#fff', color:'#dc2626', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>
                        ✗ Reject
                      </button>
                      <button
                        onClick={async () => { await loadSameLevelHistory(po.id, req.level); setShowActionModal({ request: req, action: 'approve' }) }}
                        style={{ padding:'8px 16px', border:'none', borderRadius:'8px', background:'#16a34a', color:'#fff', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>
                        ✓ Approve
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {tab === 'history' && (
        historyAll.length === 0 ? (
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'64px', textAlign:'center' }}>
            <div style={{ fontSize:'48px', marginBottom:'16px' }}>📋</div>
            <p style={{ color:'#9ca3af' }}>No approval history yet.</p>
          </div>
        ) : (
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
              <thead style={{ background:'#f9fafb' }}>
                <tr>
                  {['PO Number','Title','Amount','Your Decision','Level','Date'].map(h => (
                    <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyAll.map((h: any) => {
                  const po = h.purchase_order
                  if (!po) return null
                  const isApproved = h.status === 'approved'
                  return (
                    <tr key={h.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                      <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{po.po_number}</td>
                      <td style={{ padding:'12px 16px', fontWeight:'500' }}>{po.title}</td>
                      <td style={{ padding:'12px 16px', fontWeight:'600' }}>{fmtAmt(po.amount, po.currency)}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600',
                          background: isApproved ? '#f0fdf4' : '#fef2f2', color: isApproved ? '#16a34a' : '#dc2626' }}>
                          {isApproved ? '✓ Approved' : '✗ Rejected'}
                        </span>
                      </td>
                      <td style={{ padding:'12px 16px', color:'#6b7280' }}>{h.level}</td>
                      <td style={{ padding:'12px 16px', color:'#9ca3af', fontSize:'12px' }}>
                        {h.responded_at ? new Date(h.responded_at).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Approve / Reject Modal */}
      {showActionModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'480px', maxWidth:'94vw', padding:'28px' }}>
            <h2 style={{ fontSize:'18px', fontWeight:'600', margin:'0 0 8px 0',
              color: showActionModal.action === 'approve' ? '#16a34a' : '#dc2626' }}>
              {showActionModal.action === 'approve' ? '✓ Approve Request' : '✗ Reject Request'}
            </h2>
            <p style={{ fontSize:'14px', color:'#6b7280', margin:'0 0 16px 0' }}>
              <strong>{showActionModal.request.purchase_order?.title}</strong><br/>
              {fmtAmt(showActionModal.request.purchase_order?.amount, showActionModal.request.purchase_order?.currency)} · {showActionModal.request.level}
            </p>

            {sameLevel.length > 0 && (
              <div style={{ marginBottom:'16px', padding:'10px 12px', background:'#f9fafb', borderRadius:'8px', fontSize:'13px' }}>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'6px' }}>OTHER APPROVERS AT THIS LEVEL</div>
                {sameLevel.map((a: any) => (
                  <div key={a.id} style={{ color: a.status === 'approved' ? '#16a34a' : '#dc2626' }}>
                    {a.status === 'approved' ? '✓' : '✗'} {a.approver?.full_name || a.approver?.email}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom:'20px' }}>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }}>
                Notes {showActionModal.action === 'reject' ? '(required)' : '(optional)'}
              </label>
              <textarea style={{...inp, height:'80px', resize:'vertical' as any}} value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={showActionModal.action === 'reject' ? 'State the reason for rejection...' : 'Add any comments...'}/>
            </div>

            <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
              <button onClick={() => { setShowActionModal(null); setNotes('') }}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button
                disabled={acting || (showActionModal.action === 'reject' && !notes.trim())}
                onClick={() => handleAction(showActionModal.request, showActionModal.action)}
                style={{ padding:'9px 20px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: showActionModal.action === 'approve' ? '#16a34a' : '#dc2626',
                  opacity: acting || (showActionModal.action === 'reject' && !notes.trim()) ? 0.6 : 1 }}>
                {acting ? 'Processing...' : showActionModal.action === 'approve' ? '✓ Confirm Approve' : '✗ Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
