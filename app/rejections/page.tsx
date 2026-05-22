'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { getActiveCompanyId } from '@/lib/company'

export default function RejectionsPage() {
  const [rejections, setRejections] = useState<any[]>([])
  const [companyId, setCompanyId] = useState('')

  const supabase = createClient()

  useEffect(() => { init() }, [])
  useEffect(() => { if (companyId) loadRejections() }, [companyId])

  async function init() {
    const cid = await getActiveCompanyId()
    setCompanyId(cid)
  }

  async function loadRejections() {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, supplier:suppliers(name), rejector:user_profiles!final_action_by(full_name)')
      .eq('company_id', companyId)
      .eq('status', 'rejected')
      .order('final_action_at', { ascending: false })
    setRejections(data || [])
  }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1200px', margin:'0 auto' }}>
      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Rejections</h1>
        <p style={{ color:'#666', fontSize:'14px' }}>Purchase orders that were rejected</p>
      </div>

      {rejections.length === 0 ? (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>🎉</div>
          <div style={{ fontWeight:'600', marginBottom:'4px' }}>No rejections!</div>
          <div style={{ color:'#9ca3af', fontSize:'14px' }}>All purchase orders have been approved.</div>
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
            <thead style={{ background:'#f9fafb' }}>
              <tr>
                {['PO Number','Supplier','Amount','Rejected By','Reason','Date','Action'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rejections.map(po => (
                <tr key={po.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                  <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:'12px' }}>{po.po_number}</td>
                  <td style={{ padding:'12px 16px', fontWeight:'500' }}>{(po.supplier as any)?.name}</td>
                  <td style={{ padding:'12px 16px', fontWeight:'600' }}>{po.currency} {Number(po.amount).toLocaleString()}</td>
                  <td style={{ padding:'12px 16px', color:'#6b7280' }}>{(po.rejector as any)?.full_name || '—'}</td>
                  <td style={{ padding:'12px 16px', maxWidth:'200px' }}>
                    <div style={{ background:'#fef2f2', padding:'6px 10px', borderRadius:'6px', fontSize:'12px', color:'#dc2626' }}>
                      {po.rejection_reason || '—'}
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'12px' }}>
                    {po.final_action_at ? new Date(po.final_action_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <a href="/requests" style={{ fontSize:'12px', padding:'4px 10px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'#fff', cursor:'pointer', textDecoration:'none', color:'#374151' }}>
                      New Request
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}