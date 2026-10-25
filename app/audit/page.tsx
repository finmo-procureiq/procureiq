'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [companyId, setCompanyId] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loaded, setLoaded] = useState(false)

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: members } = await supabase
      .from('company_members').select('company_id').eq('user_id', user.id).eq('is_active', true)
    const cid = members?.[0]?.company_id || ''
    setCompanyId(cid)
    await loadLogs(cid)
  }

  async function loadLogs(cid?: string) {
    const id = cid || companyId
    if (!id) return
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('company_id', id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) { console.error('Audit error:', error); return }
    setLogs(data || [])
    setLoaded(true)
  }

  const filtered = logs.filter(l =>
    filter === 'all' || l.action === filter
  ).filter(l =>
    !search ||
    l.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.entity_ref?.toLowerCase().includes(search.toLowerCase()) ||
    l.action?.toLowerCase().includes(search.toLowerCase())
  )

  const severityColor: Record<string,string> = {
    info:'#2563eb', warning:'#f59e0b', critical:'#dc2626'
  }
  const actionColor: Record<string,string> = {
    CREATE:'#16a34a', SUBMIT:'#2563eb', APPROVE:'#16a34a',
    REJECT:'#dc2626', RECALL:'#f59e0b', ESCALATE:'#f59e0b',
    UPDATE:'#7c3aed', LOGIN:'#6b7280', EXPORT:'#f59e0b',
    MARK_PAID:'#16a34a', PARTIAL_PAYMENT:'#7c3aed'
  }

  function downloadCSV() {
    const headers = ['Timestamp','User','Email','Action','Entity Type','Reference','Severity']
    const rows = filtered.map(l => [
      new Date(l.created_at).toLocaleString(),
      l.user_name || '',
      l.user_email || '',
      l.action || '',
      l.entity_type || '',
      l.entity_ref || '',
      l.severity || 'info',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`AuditTrail_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  function downloadPDF() {
    const w = window.open('','_blank'); if (!w) return
    const rows = filtered.map(l => `<tr>
      <td style="white-space:nowrap;font-family:monospace;font-size:10px">${new Date(l.created_at).toLocaleString()}</td>
      <td><b>${l.user_name||'—'}</b><br/><span style="color:#9ca3af;font-size:10px">${l.user_email||''}</span></td>
      <td><span style="padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600;background:${(actionColor[l.action]||'#6b7280')}22;color:${actionColor[l.action]||'#6b7280'}">${l.action}</span></td>
      <td style="font-size:11px;color:#6b7280">${(l.entity_type||'').replace(/_/g,' ')}</td>
      <td style="font-family:monospace;font-size:10px">${l.entity_ref||'—'}</td>
      <td style="padding:2px 6px;border-radius:10px;font-size:10px;background:${(severityColor[l.severity||'info'])}22;color:${severityColor[l.severity||'info']}">${l.severity||'info'}</td>
    </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>Audit Trail</title>
    <style>body{font-family:sans-serif;padding:24px;font-size:12px}h1{font-size:18px}table{width:100%;border-collapse:collapse}th{background:#f9fafb;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb}td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top}.footer{margin-top:20px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px}</style>
    </head><body>
    <h1>ProcureIQ — Audit Trail</h1>
    <p style="color:#6b7280;font-size:12px">Exported ${new Date().toLocaleString()} · ${filtered.length} entries</p>
    <table><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Reference</th><th>Severity</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="footer">ProcureIQ Enterprise · Confidential</div>
    <script>window.onload=function(){window.print()}</script></body></html>`)
    w.document.close()
  }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1400px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Audit Trail</h1>
          <p style={{ color:'#666', fontSize:'14px' }}>Complete tamper-proof log of all system actions</p>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <input type="text" placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none', width:'180px' }}/>
          <button onClick={() => loadLogs()}
            style={{ padding:'8px 14px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'13px', cursor:'pointer' }}>
            Refresh
          </button>
          <button onClick={downloadCSV}
            style={{ padding:'8px 14px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'13px', cursor:'pointer' }}>
            ⬇ CSV
          </button>
          <button onClick={downloadPDF}
            style={{ padding:'8px 14px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'13px', cursor:'pointer' }}>
            ⬇ PDF
          </button>
        </div>
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
        {[['all','All'],['CREATE','Created'],['SUBMIT','Submitted'],['APPROVE','Approved'],['REJECT','Rejected'],['ESCALATE','Escalated'],['MARK_PAID','Payments']].map(([val,label]) => (
          <button key={val} onClick={() => setFilter(val)}
            style={{ padding:'5px 12px', borderRadius:'20px', border:'1px solid #e5e7eb', background:filter===val?'#1c1917':'#fff', color:filter===val?'#fff':'#374151', fontSize:'12px', cursor:'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              {['Timestamp','User','Action','Entity','Reference','Details','Severity'].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loaded ? (
              <tr><td colSpan={7} style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>
                No audit entries found. {logs.length > 0 ? `(${logs.length} total, filtered out)` : 'Actions will appear here as your team uses the system.'}
              </td></tr>
            ) : filtered.map(log => (
              <tr key={log.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                <td style={{ padding:'10px 14px', color:'#6b7280', fontSize:'11px', fontFamily:'monospace', whiteSpace:'nowrap' }}>
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ fontWeight:'500', fontSize:'12px' }}>{log.user_name || '—'}</div>
                  <div style={{ color:'#9ca3af', fontSize:'11px' }}>{log.user_email}</div>
                </td>
                <td style={{ padding:'10px 14px' }}>
                  <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:(actionColor[log.action]||'#6b7280')+'15', color:actionColor[log.action]||'#6b7280' }}>
                    {log.action}
                  </span>
                </td>
                <td style={{ padding:'10px 14px', color:'#6b7280', fontSize:'12px', textTransform:'capitalize' }}>
                  {log.entity_type?.replace(/_/g,' ')}
                </td>
                <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:'11px', color:'#374151' }}>
                  {log.entity_ref || '—'}
                </td>
                <td style={{ padding:'10px 14px', fontSize:'11px', color:'#6b7280', maxWidth:'200px' }}>
                  {log.new_values ? (
                    <div style={{ background:'#f9fafb', padding:'4px 8px', borderRadius:'4px', fontFamily:'monospace', fontSize:'10px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'180px' }}>
                      {JSON.stringify(log.new_values)}
                    </div>
                  ) : '—'}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'10px', fontWeight:'500', background:(severityColor[log.severity||'info'])+'15', color:severityColor[log.severity||'info'] }}>
                    {log.severity || 'info'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <div style={{ marginTop:'12px', fontSize:'12px', color:'#9ca3af', textAlign:'right' }}>
          Showing {filtered.length} of {logs.length} entries
        </div>
      )}
    </div>
  )
}