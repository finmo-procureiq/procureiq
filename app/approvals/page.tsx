'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { logAction } from '@/lib/audit'
import { getActiveCompanyId } from '@/lib/company'

export default function ApprovalsPage() {
  const [pending, setPending] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [companyId, setCompanyId] = useState('')
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<any>(null)

  const supabase = createClient()

  useEffect(() => { init() }, [])
  useEffect(() => { if (companyId) loadPending() }, [companyId])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: prof } = await supabase
      .from('user_profiles').select('full_name, email').eq('id', user.id).single()
    setProfile(prof)
    const cid = await getActiveCompanyId()
    setCompanyId(cid)
  }

  async function loadPending() {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, supplier:suppliers(name, category), maker:user_profiles!created_by(full_name, email)')
      .eq('company_id', companyId)
      .in('status', ['pending_l1','pending_l2','pending_l3'])
      .order('submitted_at', { ascending: true })
    setPending(data || [])
  }

  async function approvePO() {
    if (!selected) return
    setLoading(true)
    const nextStatus: Record<string,string> = {
      pending_l1:'pending_l2', pending_l2:'approved', pending_l3:'approved'
    }
    const nextLevelCode: Record<string,string> = {
      pending_l1:'L2_CHECKER', pending_l2:'', pending_l3:''
    }
    const newStatus = nextStatus[selected.status] || 'approved'
    const isFinal = newStatus === 'approved'
    await supabase.from('purchase_orders').update({
      status: newStatus,
      current_level: isFinal ? null : newStatus.replace('pending_','').toUpperCase(),
      ...(isFinal ? { final_action:'approved', final_action_by:userId, final_action_at:new Date().toISOString() } : {})
    }).eq('id', selected.id)
    await logAction({
      company_id:companyId, user_id:userId,
      user_name:profile?.full_name||'', user_email:profile?.email||'',
      action:'APPROVE', entity_type:'purchase_order', entity_ref:selected.po_number,
      new_values:{ status:newStatus, final:isFinal, comments:comment }
    })
    const makerEmail = (selected.maker as any)?.email
    if (makerEmail) {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'po_approved',
          data: {
            po: selected,
            approverName: profile?.full_name || profile?.email,
            isFinal,
            makerEmail,
            nextLevelCode: nextLevelCode[selected.status]
          }
        })
      })
    }
    setLoading(false); setSelected(null); setComment(''); loadPending()
  }

  async function escalatePO() {
    if (!selected) return
    setLoading(true)
    await supabase.from('purchase_orders').update({
      status:'pending_l3', current_level:'L3'
    }).eq('id', selected.id)
    await logAction({
      company_id:companyId, user_id:userId,
      user_name:profile?.full_name||'', user_email:profile?.email||'',
      action:'ESCALATE', entity_type:'purchase_order', entity_ref:selected.po_number,
      new_values:{ from:'L2', to:'L3', reason:comment }, severity:'warning'
    })
    setLoading(false); setSelected(null); setComment(''); loadPending()
  }

  async function rejectPO() {
    if (!selected) return
    if (!comment.trim()) { alert('Please enter a rejection reason'); return }
    setLoading(true)
    await supabase.from('purchase_orders').update({
      status:'rejected', final_action:'rejected',
      final_action_by:userId, final_action_at:new Date().toISOString(),
      rejection_reason:comment
    }).eq('id', selected.id)
    await logAction({
      company_id:companyId, user_id:userId,
      user_name:profile?.full_name||'', user_email:profile?.email||'',
      action:'REJECT', entity_type:'purchase_order', entity_ref:selected.po_number,
      new_values:{ reason:comment, status:'rejected' }, severity:'warning'
    })
    const makerEmail = (selected.maker as any)?.email
    if (makerEmail) {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'po_rejected',
          data: {
            po: selected,
            approverName: profile?.full_name || profile?.email,
            reason: comment,
            makerEmail
          }
        })
      })
    }
    setLoading(false); setSelected(null); setComment(''); loadPending()
  }

  const levelLabel: Record<string,string> = {
    pending_l1:'Dept Head Approval',
    pending_l2:'Finance Manager Approval',
    pending_l3:'CFO / Finance Head Approval'
  }
  const priorityColor: Record<string,string> = {
    low:'#6b7280', normal:'#2563eb', high:'#f59e0b', urgent:'#ea580c', emergency:'#dc2626'
  }
  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1200px', margin:'0 auto' }}>
      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Approvals</h1>
        <p style={{ color:'#666', fontSize:'14px' }}>Purchase orders awaiting your approval</p>
      </div>

      {pending.length === 0 ? (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>✅</div>
          <div style={{ fontWeight:'600', marginBottom:'4px' }}>All caught up!</div>
          <div style={{ color:'#9ca3af', fontSize:'14px' }}>No purchase orders pending your approval.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          {pending.map(po => (
            <div key={po.id} style={{ background:'#fff', border:'1px solid #fbbf24', borderRadius:'12px', padding:'20px', display:'flex', alignItems:'center', gap:'16px' }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                  <span style={{ fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{po.po_number}</span>
                  <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:(priorityColor[po.priority]||'#6b7280')+'20', color:priorityColor[po.priority]||'#6b7280' }}>
                    {po.priority.toUpperCase()}
                  </span>
                  <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', background:'#fef3c7', color:'#b45309' }}>
                    {levelLabel[po.status]||po.status}
                  </span>
                </div>
                <div style={{ fontSize:'15px', fontWeight:'600', marginBottom:'2px' }}>{(po.supplier as any)?.name}</div>
                <div style={{ fontSize:'13px', color:'#6b7280' }}>
                  {po.category} · Requested by {(po.maker as any)?.full_name||(po.maker as any)?.email}
                  {po.submitted_at && ` · ${new Date(po.submitted_at).toLocaleDateString()}`}
                </div>
                {po.description && <div style={{ fontSize:'13px', color:'#374151', marginTop:'4px' }}>{po.description}</div>}
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:'20px', fontWeight:'700' }}>{po.currency} {Number(po.amount).toLocaleString()}</div>
                <div style={{ fontSize:'12px', color:'#6b7280' }}>+{po.currency} {Number(po.tax_amount).toLocaleString()} tax</div>
                <div style={{ fontSize:'14px', fontWeight:'600' }}>Total: {po.currency} {Number(po.total_amount).toLocaleString()}</div>
                {po.required_by && <div style={{ fontSize:'12px', color:'#6b7280', marginTop:'2px' }}>Required by {new Date(po.required_by).toLocaleDateString()}</div>}
              </div>
              <button onClick={() => { setSelected(po); setComment('') }}
                style={{ padding:'10px 20px', background:'#2563eb', color:'#fff', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', flexShrink:0 }}>
                Review
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'540px', maxWidth:'94vw', maxHeight:'90vh', overflowY:'auto', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600' }}>Review Purchase Order</h2>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>X</button>
            </div>
            <div style={{ padding:'10px 14px', background:'#fef3c7', borderRadius:'8px', marginBottom:'16px', fontSize:'13px', color:'#b45309', fontWeight:'500' }}>
              {levelLabel[selected.status]}
            </div>
            <div style={{ display:'grid', gap:'2px', fontSize:'14px', marginBottom:'20px' }}>
              {[
                ['PO Number', selected.po_number],
                ['Supplier', (selected.supplier as any)?.name],
                ['Category', selected.category],
                ['Amount', `${selected.currency} ${Number(selected.amount).toLocaleString()}`],
                ['GST Rate', `${selected.tax_rate}%`],
                ['Tax Amount', `${selected.currency} ${Number(selected.tax_amount).toLocaleString()}`],
                ['Total', `${selected.currency} ${Number(selected.total_amount).toLocaleString()}`],
                ['Priority', selected.priority],
                ['Description', selected.description],
                ['Requested By', (selected.maker as any)?.full_name||(selected.maker as any)?.email],
                ['Cost Center', selected.cost_center||'—'],
                ['Required By', selected.required_by ? new Date(selected.required_by).toLocaleDateString() : '—'],
                ['Notes', selected.notes||'—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
                  <span style={{ color:'#6b7280', flexShrink:0, marginRight:'16px' }}>{label}</span>
                  <span style={{ fontWeight:'500', textAlign:'right' }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }}>
                Comments (required for rejection)
              </label>
              <textarea style={{...inp, height:'70px', resize:'vertical'}}
                value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Add comments or rejection reason..."/>
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <button onClick={() => setSelected(null)}
                style={{ flex:1, padding:'10px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'13px', cursor:'pointer', minWidth:'80px' }}>
                Cancel
              </button>
              <button onClick={rejectPO} disabled={loading}
                style={{ flex:1, padding:'10px', border:'none', borderRadius:'8px', background:'#dc2626', color:'#fff', fontSize:'13px', fontWeight:'500', cursor:'pointer', minWidth:'80px' }}>
                Reject
              </button>
              {selected.status === 'pending_l2' && (
                <button onClick={escalatePO} disabled={loading}
                  style={{ flex:1, padding:'10px', border:'1px solid #f59e0b', borderRadius:'8px', background:'#fef3c7', color:'#b45309', fontSize:'13px', fontWeight:'500', cursor:'pointer', minWidth:'120px' }}>
                  Escalate to CFO
                </button>
              )}
              <button onClick={approvePO} disabled={loading}
                style={{ flex:1, padding:'10px', border:'none', borderRadius:'8px', background:'#16a34a', color:'#fff', fontSize:'13px', fontWeight:'500', cursor:'pointer', minWidth:'80px' }}>
                {loading ? 'Processing...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}