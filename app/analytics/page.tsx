'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { getActiveCompanyId } from '@/lib/company'

const COLORS = ['#2563eb','#16a34a','#f59e0b','#dc2626','#7c3aed','#ea580c','#0891b2','#be185d','#65a30d','#6b7280','#0f172a','#b45309']

export default function AnalyticsPage() {
  const [spendByDept, setSpendByDept] = useState<any[]>([])
  const [spendByMonth, setSpendByMonth] = useState<any[]>([])
  const [topSuppliers, setTopSuppliers] = useState<any[]>([])
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const cid = await getActiveCompanyId()
    setCompanyId(cid)
    const { data: co } = await supabase.from('companies')
      .select('name, currency').eq('id', cid).single()
    if (co) { setCompanyName(co.name); setCurrency(co.currency || 'INR') }
    await loadData(cid, '', '')
  }

  async function loadData(cid: string, from: string, to: string) {
    setLoading(true)
    const id = cid || companyId

    let query = supabase.from('purchase_orders')
      .select('*, supplier:suppliers(name)')
      .eq('company_id', id)
      .eq('status', 'approved')
      .order('final_action_at', { ascending: true })
    if (from) query = query.gte('final_action_at', from)
    if (to) query = query.lte('final_action_at', to + 'T23:59:59Z')
    const { data: pos } = await query

    // Spend by department (cost_center field)
    const deptMap: Record<string, number> = {}
    ;(pos || []).forEach(po => {
      const dept = po.cost_center || 'Unassigned'
      deptMap[dept] = (deptMap[dept] || 0) + Number(po.total_amount)
    })
    const departments = Object.entries(deptMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
    setSpendByDept(departments)

    // Spend by month
    const monthMap: Record<string, number> = {}
    ;(pos || []).forEach(po => {
      if (!po.final_action_at) return
      const month = new Date(po.final_action_at)
        .toLocaleString('default', { month:'short', year:'2-digit' })
      monthMap[month] = (monthMap[month] || 0) + Number(po.total_amount)
    })
    setSpendByMonth(Object.entries(monthMap).map(([month, amount]) => ({ month, amount })))

    // Top suppliers
    const supMap: Record<string, { name:string, amount:number, count:number }> = {}
    ;(pos || []).forEach(po => {
      const name = (po.supplier as any)?.name || 'Unknown'
      if (!supMap[name]) supMap[name] = { name, amount:0, count:0 }
      supMap[name].amount += Number(po.total_amount)
      supMap[name].count += 1
    })
    setTopSuppliers(Object.values(supMap).sort((a,b) => b.amount - a.amount).slice(0,10))

    setLoading(false)
  }

  const totalSpend = spendByDept.reduce((sum, d) => sum + d.amount, 0)
  const maxDept = Math.max(...spendByDept.map(d => d.amount), 1)
  const maxMonth = Math.max(...spendByMonth.map(m => m.amount), 1)

  function downloadCSV() {
    const headers = ['Department','Amount','% of Total']
    const rows = spendByDept.map(d => [
      d.name,
      d.amount.toFixed(2),
      `${totalSpend > 0 ? Math.round(d.amount/totalSpend*100) : 0}%`
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ProcureIQ_SpendByDept_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadPDF() {
    const w = window.open('', '_blank')
    if (!w) return
    const rows = spendByDept.map((d, i) => `
      <tr>
        <td><span style="display:inline-block;width:10px;height:10px;background:${COLORS[i%COLORS.length]};border-radius:2px;margin-right:6px;vertical-align:middle"></span>${d.name}</td>
        <td style="text-align:right;font-weight:600">${currency} ${d.amount.toLocaleString()}</td>
        <td style="text-align:right">${totalSpend > 0 ? Math.round(d.amount/totalSpend*100) : 0}%</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>Spend by Department</title>
    <style>
      body{font-family:sans-serif;padding:32px;color:#1c1917}
      h1{font-size:20px;margin-bottom:4px}
      .sub{color:#6b7280;font-size:12px;margin-bottom:8px}
      .total{font-size:28px;font-weight:700;color:#2563eb;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f9fafb;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb}
      td{padding:10px 12px;border-bottom:1px solid #f3f4f6}
      .footer{margin-top:24px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px}
    </style></head><body>
    <h1>ProcureIQ — Spend by Department</h1>
    <div class="sub">${companyName} · ${new Date().toLocaleString()}</div>
    <div class="total">Total: ${currency} ${totalSpend.toLocaleString()}</div>
    <table>
      <thead><tr><th>Department</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">ProcureIQ Enterprise · Confidential</div>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`)
    w.document.close()
  }

  const inp: React.CSSProperties = { padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none', fontFamily:'sans-serif' }

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1200px', margin:'0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>Spend Analytics</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>{companyName} — Spend by Department</p>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
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

      {/* Filters */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'16px', marginBottom:'24px', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
        <span style={{ fontSize:'13px', fontWeight:'500', color:'#374151' }}>Filter by date:</span>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <label style={{ fontSize:'12px', color:'#6b7280' }}>From</label>
          <input type="date" style={inp} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <label style={{ fontSize:'12px', color:'#6b7280' }}>To</label>
          <input type="date" style={inp} value={dateTo} onChange={e => setDateTo(e.target.value)}/>
        </div>
        <button onClick={() => loadData(companyId, dateFrom, dateTo)}
          style={{ padding:'7px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', cursor:'pointer', fontWeight:'500' }}>
          Apply
        </button>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); loadData(companyId, '', '') }}
            style={{ padding:'7px 12px', background:'#fff', color:'#6b7280', border:'1px solid #e5e7eb', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {/* Total Banner */}
      <div style={{ background:'linear-gradient(135deg, #1c1917, #374151)', borderRadius:'12px', padding:'24px', marginBottom:'24px', color:'#fff' }}>
        <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.6)', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px' }}>Total Approved Spend</div>
        <div style={{ fontSize:'36px', fontWeight:'700' }}>{currency} {loading ? '—' : totalSpend.toLocaleString()}</div>
        <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.5)', marginTop:'4px' }}>{spendByDept.length} departments · {companyName}</div>
      </div>

      {/* Spend by Department Bar Chart */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'24px', marginBottom:'24px' }}>
        <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'20px' }}>Spend by Department</h2>
        {loading ? (
          <div style={{ textAlign:'center', padding:'32px', color:'#9ca3af' }}>Loading...</div>
        ) : spendByDept.length === 0 ? (
          <div style={{ textAlign:'center', padding:'32px', color:'#9ca3af' }}>
            No approved POs found. Make sure to select a Department when creating requests.
          </div>
        ) : spendByDept.map((dept, i) => (
          <div key={dept.name} style={{ marginBottom:'16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'12px', height:'12px', borderRadius:'3px', background:COLORS[i%COLORS.length], flexShrink:0 }}></div>
                <span style={{ fontSize:'14px', fontWeight:'500' }}>{dept.name}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                <span style={{ fontSize:'12px', color:'#6b7280' }}>
                  {totalSpend > 0 ? Math.round(dept.amount/totalSpend*100) : 0}% of total
                </span>
                <span style={{ fontSize:'14px', fontWeight:'700', minWidth:'130px', textAlign:'right', color:COLORS[i%COLORS.length] }}>
                  {currency} {dept.amount.toLocaleString()}
                </span>
              </div>
            </div>
            <div style={{ height:'12px', background:'#f3f4f6', borderRadius:'6px', overflow:'hidden' }}>
              <div style={{
                height:'100%',
                width:`${Math.round(dept.amount/maxDept*100)}%`,
                background:COLORS[i%COLORS.length],
                borderRadius:'6px',
                transition:'width 0.6s ease'
              }}></div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px' }}>

        {/* Monthly Trend */}
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'24px' }}>
          <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'20px' }}>Monthly Spend Trend</h2>
          {spendByMonth.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px', color:'#9ca3af', fontSize:'14px' }}>No data for this period.</div>
          ) : (
            <div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'160px', marginBottom:'8px' }}>
                {spendByMonth.map((m, i) => (
                  <div key={m.month} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', height:'100%', justifyContent:'flex-end' }}>
                    <span style={{ fontSize:'10px', color:'#6b7280', fontWeight:'600', textAlign:'center' }}>
                      {m.amount >= 100000 ? `${(m.amount/100000).toFixed(1)}L` : `${(m.amount/1000).toFixed(0)}K`}
                    </span>
                    <div style={{
                      width:'100%',
                      height:`${Math.max(Math.round(m.amount/maxMonth*130), 4)}px`,
                      background:COLORS[i%COLORS.length],
                      borderRadius:'4px 4px 0 0',
                    }}></div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:'6px' }}>
                {spendByMonth.map(m => (
                  <div key={m.month} style={{ flex:1, textAlign:'center', fontSize:'10px', color:'#9ca3af' }}>{m.month}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top Suppliers */}
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'24px' }}>
          <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'20px' }}>Top Suppliers by Spend</h2>
          {topSuppliers.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px', color:'#9ca3af', fontSize:'14px' }}>No data for this period.</div>
          ) : topSuppliers.map((s, i) => (
            <div key={s.name} style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px' }}>
              <div style={{ width:'26px', height:'26px', borderRadius:'50%', background:COLORS[i%COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', color:'#fff', fontWeight:'700', flexShrink:0 }}>
                {i+1}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:'500' }}>{s.name}</div>
                <div style={{ fontSize:'11px', color:'#9ca3af' }}>{s.count} PO{s.count !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'13px', fontWeight:'600' }}>{currency} {s.amount.toLocaleString()}</div>
                <div style={{ fontSize:'11px', color:'#9ca3af' }}>
                  {totalSpend > 0 ? Math.round(s.amount/totalSpend*100) : 0}% of total
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}