'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

const DEPARTMENTS = ['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin']
const CURRENCIES = ['INR','SGD','AED','USD','EUR','GBP','MYR','HKD']

export default function RequestsPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [entityId, setEntityId] = useState<string | null>(null)
  const [entityCode, setEntityCode] = useState<string>('')
  const [companies, setCompanies] = useState<any[]>([])
  const [companiesMap, setCompaniesMap] = useState<Record<string, { code: string; currency: string; name: string }>>({})
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [formEntityId, setFormEntityId] = useState<string | null>(null)
  const [formSuppliers, setFormSuppliers] = useState<any[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [approvalHistory, setApprovalHistory] = useState<any[]>([])
  const [poAttachments, setPoAttachments] = useState<{ name: string; url: string }[]>([])
  const [poComments, setPoComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<any>(null)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierDropOpen, setSupplierDropOpen] = useState(false)
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [supplierForm, setSupplierForm] = useState({ name:'', contact_email:'', category:'', status:'approved' })
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', amount: '', currency: 'INR',
    supplier_id: '', department: '', justification: '', invoice_ref: ''
  })

  const supabase = createClient()
  useEffect(() => { init() }, [])

  async function init() {
    try {
      // Load companies from API (bypasses RLS)
      const cosRes = await fetch('/api/companies')
      const cosData = await cosRes.json()
      const cosMap: Record<string, { code: string; currency: string; name: string }> = {}
      if (Array.isArray(cosData)) {
        setCompanies(cosData)
        cosData.forEach((c: any) => { cosMap[c.id] = { code: c.code, currency: c.currency, name: c.name } })
        setCompaniesMap(cosMap)
      }

      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return
      setUser(u)

      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', u.id)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (member?.company_id) {
        const eid = member.company_id
        setEntityId(eid)
        setFormEntityId(eid)
        const co = cosMap[eid]
        setEntityCode(co?.code || 'PO')
        // Default form currency to entity currency
        setForm(f => ({ ...f, currency: co?.currency || 'INR' }))
        await loadAll(eid)
        await loadFormSuppliers(eid)
      }
    } catch (e) {
      console.error('init error:', e)
    }
    setLoading(false)
  }

  async function loadAll(eid: string) {
    try {
      // Load ALL POs created by this user across all entities
      const { data: ordersData } = await supabase
        .from('purchase_orders')
        .select('*, supplier:suppliers(id, name)')
        .order('created_at', { ascending: false })
      setOrders(ordersData || [])

      const { data: suppData } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('status', 'approved')
        .order('name')
      setSuppliers(suppData || [])
    } catch (e) {
      console.error('loadAll error:', e)
    }
  }

  async function loadFormSuppliers(eid: string) {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('status', 'approved')
      .order('name')
    setFormSuppliers(data || [])
  }

  async function createSupplierInline() {
    if (!supplierForm.name || !formEntityId) return
    setSavingSupplier(true)
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('suppliers').insert({
      company_id: formEntityId,
      name: supplierForm.name,
      contact_email: supplierForm.contact_email || null,
      category: supplierForm.category || null,
      status: supplierForm.status,
      payment_terms: 30,
      created_by: currentUser?.id || null,
    }).select('id, name').single()
    if (error) { alert('Error: ' + error.message); setSavingSupplier(false); return }
    await loadFormSuppliers(formEntityId)
    setForm(f => ({ ...f, supplier_id: data.id }))
    setSupplierSearch('')
    setShowSupplierModal(false)
    setSupplierForm({ name:'', contact_email:'', category:'', status:'approved' })
    setSavingSupplier(false)
  }

  async function handleFormEntityChange(eid: string) {
    setFormEntityId(eid)
    const co = companiesMap[eid]
    setForm(f => ({ ...f, currency: co?.currency || 'INR', supplier_id: '' }))
    await loadFormSuppliers(eid)
  }

  async function loadApprovalHistory(poId: string) {
    const { data } = await supabase
      .from('approval_requests')
      .select(`
        *,
        approver:user_profiles(full_name, email)
      `)
      .eq('purchase_order_id', poId)
      .order('created_at', { ascending: true })
    setApprovalHistory(data || [])
  }

  async function loadAttachments(poId: string) {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .list(`purchase_orders/${poId}`, { limit: 50 })
      if (error || !data) { setPoAttachments([]); return }
      const files = data.filter(f => f.name !== '.emptyFolderPlaceholder')
      const withUrls = files.map(f => {
        const { data: urlData } = supabase.storage
          .from('attachments')
          .getPublicUrl(`purchase_orders/${poId}/${f.name}`)
        // Strip timestamp prefix for display
        const displayName = f.name.replace(/^\d+_/, '')
        return { name: displayName, url: urlData.publicUrl }
      })
      setPoAttachments(withUrls)
    } catch { setPoAttachments([]) }
  }

  async function loadComments(poId: string) {
    try {
      const { data } = await supabase
        .from('po_comments')
        .select('*')
        .eq('po_id', poId)
        .order('created_at', { ascending: true })
      setPoComments(data || [])
    } catch { setPoComments([]) }
  }

  async function postComment(poId: string) {
    if (!commentText.trim() || !user) return
    setPostingComment(true)
    try {
      const { data: profile } = await supabase
        .from('user_profiles').select('full_name, email').eq('id', user.id).single()
      const companyId = companies.find((c: any) => c.id === selectedOrder?.company_id)?.id || companies[0]?.id
      await supabase.from('po_comments').insert({
        po_id: poId,
        company_id: companyId,
        user_id: user.id,
        user_name: (profile as any)?.full_name || (profile as any)?.email || 'Unknown',
        user_email: (profile as any)?.email || '',
        message: commentText.trim(),
      })
      setCommentText('')
      await loadComments(poId)
    } catch(e: any) { console.error('Comment error:', e) }
    setPostingComment(false)
  }

  async function handleRecall(po: any) {
    if (!confirm(`Recall "${po.title}"? It will be moved back to Draft so you can edit and resubmit.`)) return
    setActioning(true)
    try {
      // Cancel all pending approval_requests for this PO
      await supabase.from('approval_requests')
        .update({ status: 'cancelled' })
        .eq('document_id', po.id)
        .eq('document_type', 'purchase_order')
        .eq('status', 'submitted')
      // Move PO back to draft
      await supabase.from('purchase_orders')
        .update({ status: 'draft', current_level: '0' })
        .eq('id', po.id)
      setSelectedOrder(null)
      setApprovalHistory([])
      if (entityId) await loadAll(entityId)
    } catch (e: any) { alert('Error: ' + e.message) }
    setActioning(false)
  }

  async function handleVoid(po: any) {
    if (!confirm(`Void "${po.title}"? This cannot be undone.`)) return
    setActioning(true)
    try {
      await supabase.from('approval_requests')
        .update({ status: 'cancelled' })
        .eq('document_id', po.id)
        .eq('document_type', 'purchase_order')
        .eq('status', 'submitted')
      await supabase.from('purchase_orders')
        .update({ status: 'cancelled' })
        .eq('id', po.id)
      setSelectedOrder(null)
      setApprovalHistory([])
      if (entityId) await loadAll(entityId)
    } catch (e: any) { alert('Error: ' + e.message) }
    setActioning(false)
  }

  async function handleEditSubmit(po: any) {
    if (!editForm) return
    setActioning(true)
    try {
      await supabase.from('purchase_orders')
        .update({
          title: editForm.title,
          description: editForm.description || null,
          amount: parseFloat(editForm.amount),
          currency: editForm.currency,
          department: editForm.department,
          justification: editForm.justification || null,
          invoice_ref: editForm.invoice_ref || null,
          supplier_id: editForm.supplier_id || null,
        })
        .eq('id', po.id)
      setEditMode(false)
      setEditForm(null)
      setSelectedOrder(null)
      setApprovalHistory([])
      if (entityId) await loadAll(entityId)
    } catch (e: any) { alert('Error: ' + e.message) }
    setActioning(false)
  }

  async function handleResubmit(po: any) {
    if (!confirm(`Resubmit "${po.title}" for approval?`)) return
    setActioning(true)
    try {
      const amount = po.amount
      const submitEntityId = po.company_id
      const requiredLevels = await getRequiredLevels(submitEntityId, amount)
      const firstLevel = requiredLevels[0]
      const approvers = await getApproversForLevel(submitEntityId, firstLevel)

      await supabase.from('purchase_orders')
        .update({
          status: 'pending_l1',
          current_level: '1',
          required_levels: requiredLevels,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', po.id)

      if (approvers.length > 0) {
        await supabase.from('approval_requests').insert(
          approvers.map((uid: string) => ({
            document_id: po.id,
            document_type: 'purchase_order',
            submitted_by: uid,
            status: 'submitted',
            level: firstLevel,
          }))
        )
      }
      setSelectedOrder(null)
      setApprovalHistory([])
      if (entityId) await loadAll(entityId)
      alert(`Resubmitted! Approval chain: ${requiredLevels.join(' → ')}`)
    } catch (e: any) { alert('Error: ' + e.message) }
    setActioning(false)
  }

  async function getRequiredLevels(companyId: string, amount: number): Promise<string[]> {
    const { data: matrix } = await supabase
      .from('approval_matrix')
      .select('min_amount, max_amount, required_levels')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('min_amount', { ascending: true })

    if (!matrix?.length) return ['L1']

    for (const row of matrix) {
      const aboveMin = amount >= row.min_amount
      const belowMax = row.max_amount === null || amount <= row.max_amount
      if (aboveMin && belowMax) return row.required_levels
    }
    return ['L1']
  }

  async function getApproversForLevel(companyId: string, level: string): Promise<string[]> {
    const { data: members } = await supabase
      .from('company_members')
      .select('user_id, roles')
      .eq('company_id', companyId)
      .eq('is_active', true)

    return (members || [])
      .filter((m: any) => Array.isArray(m.roles) && (m.roles.includes(level) || m.roles.includes('ADMIN')))
      .map((m: any) => m.user_id)
  }

  async function handleSubmit() {
    const submitEntityId = formEntityId || entityId
    if (!form.title || !form.amount || !form.department || !submitEntityId || !user) return
    setSaving(true)

    try {
      const amount = parseFloat(form.amount)
      const co = companiesMap[submitEntityId]
      const code = co?.code || entityCode || 'PO'
      const poNumber = `${code}-${Date.now().toString().slice(-6)}`

      // 1. Determine required approval levels BEFORE inserting
      const requiredLevels = await getRequiredLevels(submitEntityId, amount)

      // 2. Insert the PO with required_levels stored
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          company_id: submitEntityId,
          po_number: poNumber,
          title: form.title,
          description: form.description || null,
          amount,
          currency: form.currency,
          supplier_id: form.supplier_id || null,
          department: form.department,
          justification: form.justification || null,
          invoice_ref: form.invoice_ref || null,
          created_by: user.id,
          requested_by: user.id,
          submitted_at: new Date().toISOString(),
          status: 'pending_l1',
          current_level: '1',
          required_levels: requiredLevels,
        })
        .select()
        .single()

      if (poError) throw poError

      // 3. Create approval_requests for the FIRST level only
      const firstLevel = requiredLevels[0]
      const approvers = await getApproversForLevel(submitEntityId, firstLevel)

      if (approvers.length > 0) {
        const approvalRows = approvers.map((approverId: string) => ({
          document_id: po.id,
          document_type: 'purchase_order',
          submitted_by: approverId,
          status: 'submitted',
          level: firstLevel,
        }))
        const { error: arErr } = await supabase.from('approval_requests').insert(approvalRows)
        if (arErr) throw new Error('approval_requests insert failed: ' + arErr.message + ' | code: ' + arErr.code + ' | details: ' + arErr.details)
      }

      // 4. Upload attachments to Supabase storage if any
      if (attachments.length > 0) {
        for (const file of attachments) {
          const filePath = `purchase_orders/${po.id}/${Date.now()}_${file.name}`
          await supabase.storage.from('attachments').upload(filePath, file, { upsert: true })
        }
      }

      setShowForm(false)
      setAttachments([])
      setForm(f => ({ ...f, title:'', description:'', amount:'', supplier_id:'', justification:'', invoice_ref:'' }))
      // Reload the user's primary entity view
      if (entityId) await loadAll(entityId)

      // Fire email notification (non-blocking — don't await, don't fail on error)
      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'po_submitted',
          data: {
            po: {
              id: po.id,
              po_number: po.po_number,
              company_id: submitEntityId,
              amount,
              currency: form.currency,
              description: form.description,
              category: form.department,
              supplier_name: formSuppliers.find((s: any) => s.id === form.supplier_id)?.name || null,
            },
            makerEmail: user.email,
          }
        })
      }).catch(() => {}) // silently ignore email failures

      const chain = requiredLevels.join(' → ')
      alert(`Request submitted!\nApproval chain: ${chain}\n\nSent to ${firstLevel} approver${approvers.length !== 1 ? 's' : ''} for review.`)
    } catch (e: any) {
      alert('Error submitting request: ' + e.message)
    }
    setSaving(false)
  }

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pending_l1:      { label: 'Pending L1',      color: '#d97706', bg: '#fef3c7' },
    pending_l2:      { label: 'Pending L2',      color: '#ea580c', bg: '#ffedd5' },
    pending_l3:      { label: 'Pending L3',      color: '#9333ea', bg: '#f3e8ff' },
    pending_finance: { label: 'Pending Finance', color: '#0891b2', bg: '#ecfeff' },
    approved:        { label: 'Approved',        color: '#16a34a', bg: '#f0fdf4' },
    rejected:        { label: 'Rejected',        color: '#dc2626', bg: '#fef2f2' },
    recalled:        { label: 'Recalled',        color: '#6b7280', bg: '#f3f4f6' },
    cancelled:       { label: 'Void',            color: '#6b7280', bg: '#f3f4f6' },
    draft:           { label: 'Draft',           color: '#6b7280', bg: '#f3f4f6' },
    on_hold:         { label: 'On Hold',         color: '#d97706', bg: '#fef3c7' },
  }

  const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontFamily:'sans-serif', fontSize:'13px', outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }

  const fmtAmt = (amount: number, cur: string) => {
    try {
      return new Intl.NumberFormat('en-US', { style:'currency', currency: cur, maximumFractionDigits: 2 }).format(amount)
    } catch { return `${cur} ${amount.toLocaleString()}` }
  }

  function generatePDF(order: any, history: any[]) {
    const co = companiesMap[order.company_id]
    const entityName = co?.name || ''
    const entityCode = co?.code || ''
    const sc = statusConfig[order.status] || { label: order.status, color: '#6b7280', bg: '#f3f4f6' }

    const approvalRows = history.map((a: any) => {
      const name = a.approver?.full_name || a.approver?.email || 'Approver'
      const statusLabel = a.status === 'approved' ? '✓ Approved' : a.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'
      const statusColor = a.status === 'approved' ? '#16a34a' : a.status === 'rejected' ? '#dc2626' : '#d97706'
      const date = a.responded_at ? new Date(a.responded_at).toLocaleString('en-IN') : '—'
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:13px">${a.level}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:13px">${name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:13px;color:${statusColor};font-weight:600">${statusLabel}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#9ca3af">${date}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;font-style:italic">${a.notes || '—'}</td>
        </tr>`
    }).join('')

    const chainHtml = (order.required_levels || []).map((lvl: string) => {
      const done = history.some(a => a.level === lvl && a.status === 'approved')
      const rejected = history.some(a => a.level === lvl && a.status === 'rejected')
      const bg = done ? '#f0fdf4' : rejected ? '#fef2f2' : '#fef3c7'
      const color = done ? '#16a34a' : rejected ? '#dc2626' : '#d97706'
      return `<span style="padding:4px 12px;border-radius:20px;background:${bg};color:${color};font-size:12px;font-weight:600;margin:2px">${done?'✓ ':rejected?'✗ ':''}${lvl}</span>`
    }).join('<span style="color:#9ca3af;margin:0 4px">→</span>')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PO ${order.po_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Arial, sans-serif; color: #111827; background: #fff; padding: 40px; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #9B72F5; }
    .brand { font-size: 22px; font-weight: 700; color: #9B72F5; }
    .brand span { font-size: 12px; color: #9ca3af; font-weight: 400; display: block; margin-top: 2px; }
    .status-badge { padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    h2 { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
    .po-number { font-family: monospace; font-size: 13px; color: #6b7280; margin-bottom: 4px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .field label { font-size: 11px; color: #9ca3af; display: block; margin-bottom: 3px; }
    .field value { font-size: 14px; font-weight: 500; color: #374151; }
    .amount { font-size: 24px; font-weight: 700; color: #111827; }
    .box { background: #f9fafb; border-radius: 8px; padding: 14px; font-size: 13px; color: #6b7280; line-height: 1.5; }
    .justification { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; font-size: 13px; color: #92400e; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
    .print-btn { position: fixed; top: 20px; right: 20px; background: #9B72F5; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; }
  </style>
</head>
<body>
  <button class="no-print print-btn" onclick="window.print()">🖨 Print / Save PDF</button>

  <div class="header">
    <div class="brand">ProcureIQ<span>${entityName} · ${entityCode}</span></div>
    <div>
      <div class="po-number">${order.po_number}</div>
      <span class="status-badge" style="background:${sc.bg||'#f3f4f6'};color:${sc.color}">${sc.label}</span>
    </div>
  </div>

  <div class="section">
    <h2>${order.title}</h2>
    <div style="margin-top:4px;font-size:13px;color:#6b7280">Submitted ${new Date(order.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</div>
  </div>

  <div class="section">
    <div class="section-title">Summary</div>
    <div class="grid">
      <div class="field"><label>Amount</label><div class="amount">${fmtAmt(order.amount, order.currency || 'INR')}</div></div>
      <div class="field"><label>Department</label><div style="font-size:14px;font-weight:500">${order.department || '—'}</div></div>
      <div class="field"><label>Supplier</label><div style="font-size:14px;font-weight:500">${order.supplier?.name || '—'}</div></div>
      <div class="field"><label>Currency</label><div style="font-size:14px;font-weight:500">${order.currency || 'INR'}</div></div>
      <div class="field"><label>Entity</label><div style="font-size:14px;font-weight:500">${entityName}</div></div>
      <div class="field"><label>Invoice Ref</label><div style="font-size:14px;font-weight:500">${order.invoice_ref || '—'}</div></div>
    </div>
  </div>

  ${order.description ? `
  <div class="section">
    <div class="section-title">Description</div>
    <div class="box">${order.description}</div>
  </div>` : ''}

  ${order.justification ? `
  <div class="section">
    <div class="section-title">Business Justification</div>
    <div class="justification">${order.justification}</div>
  </div>` : ''}

  ${(order.required_levels?.length > 0) ? `
  <div class="section">
    <div class="section-title">Approval Chain</div>
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;padding:10px 0">${chainHtml}</div>
  </div>` : ''}

  ${history.length > 0 ? `
  <div class="section">
    <div class="section-title">Approval Trail</div>
    <table>
      <thead><tr>
        <th>Level</th><th>Approver</th><th>Decision</th><th>Date</th><th>Notes</th>
      </tr></thead>
      <tbody>${approvalRows}</tbody>
    </table>
  </div>` : ''}

  <div class="footer">
    <span>Generated by ProcureIQ Enterprise · ${new Date().toLocaleString('en-IN')}</span>
    <span>${order.po_number}</span>
  </div>
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
  }

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af', fontFamily:'sans-serif' }}>Loading requests...</div>

  return (
    <div style={{ fontFamily:'sans-serif', padding:'32px', maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', marginBottom:'4px' }}>My Requests</h1>
          <p style={{ color:'#666', fontSize:'14px', margin:0 }}>{orders.length} purchase request{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 18px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
          + New Request
        </button>
      </div>

      {orders.length === 0 ? (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'64px', textAlign:'center' }}>
          <div style={{ fontSize:'48px', marginBottom:'16px' }}>📋</div>
          <h3 style={{ fontSize:'18px', fontWeight:'600', marginBottom:'8px', color:'#374151' }}>No requests yet</h3>
          <p style={{ color:'#9ca3af', marginBottom:'24px' }}>Create your first purchase request to get started</p>
          <button onClick={() => setShowForm(true)}
            style={{ background:'#9B72F5', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 20px', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
            + New Request
          </button>
        </div>
      ) : (
        <div className="table-scroll-wrapper" style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
            <thead style={{ background:'#f9fafb' }}>
              <tr>
                {['PO Number','Title','Entity','Department','Supplier','Amount','Approval Progress','Date'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', fontWeight:'600', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const sc = statusConfig[o.status] || { label: o.status, color:'#6b7280', bg:'#f3f4f6' }
                return (
                  <tr key={o.id}
                    onClick={async () => { setSelectedOrder(o); await loadApprovalHistory(o.id); await loadAttachments(o.id); await loadComments(o.id) }}
                    style={{ borderBottom:'1px solid #f3f4f6', cursor:'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background='#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{o.po_number}</td>
                    <td style={{ padding:'12px 16px', fontWeight:'500' }}>{o.title}</td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{companiesMap[o.company_id]?.code || '—'}</td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{o.department || '—'}</td>
                    <td style={{ padding:'12px 16px', color:'#6b7280', fontSize:'13px' }}>{o.supplier?.name || '—'}</td>
                    <td style={{ padding:'12px 16px', fontWeight:'600', color:'#111827' }}>{fmtAmt(o.amount, o.currency || 'INR')}</td>
                    <td style={{ padding:'12px 16px' }}>
                      {/* Mini approval chain — show steps for POs in flight, otherwise status badge */}
                      {o.required_levels?.length > 0 && !['draft','void','paid'].includes(o.status) ? (
                        <div style={{ display:'flex', alignItems:'center', gap:'3px', flexWrap:'nowrap' }}>
                          {/* Submitted dot */}
                          <span title="Submitted" style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#16a34a', display:'inline-block', flexShrink:0 }}/>
                          {(o.required_levels as string[]).map((lvl: string, i: number) => {
                            const lvlKey = lvl.toLowerCase()
                            const isDone = o.status !== `pending_${lvlKey}` && o.status !== 'submitted' &&
                              (o.required_levels.indexOf(lvl) < o.required_levels.indexOf(o.current_level || '') ||
                               ['pending_finance','approved','rejected'].includes(o.status))
                            const isCurrent = o.status === `pending_${lvlKey}` || (i === 0 && o.status === 'submitted')
                            const isRejected = o.status === 'rejected'
                            const dotColor = isRejected ? '#dc2626' : isDone ? '#16a34a' : isCurrent ? '#9B72F5' : '#d1d5db'
                            return (
                              <span key={lvl} style={{ display:'inline-flex', alignItems:'center', gap:'3px' }}>
                                <span style={{ width:'1px', height:'6px', background:'#e5e7eb', display:'inline-block' }}/>
                                <span title={lvl} style={{ width:'8px', height:'8px', borderRadius:'50%', background:dotColor, display:'inline-block', flexShrink:0 }}/>
                                <span style={{ fontSize:'9px', color: isDone ? '#16a34a' : isCurrent ? '#9B72F5' : '#9ca3af', fontWeight:'600', letterSpacing:'0px' }}>{lvl.replace('L','L')}</span>
                              </span>
                            )
                          })}
                          {/* Finance dot */}
                          <span style={{ display:'inline-flex', alignItems:'center', gap:'3px' }}>
                            <span style={{ width:'1px', height:'6px', background:'#e5e7eb', display:'inline-block' }}/>
                            <span title="Finance" style={{ width:'8px', height:'8px', borderRadius:'50%', background: o.status === 'approved' ? '#16a34a' : o.status === 'pending_finance' ? '#9B72F5' : '#d1d5db', display:'inline-block', flexShrink:0 }}/>
                            <span style={{ fontSize:'9px', color: o.status === 'approved' ? '#16a34a' : o.status === 'pending_finance' ? '#9B72F5' : '#9ca3af', fontWeight:'600' }}>FIN</span>
                          </span>
                        </div>
                      ) : (
                        <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:sc.bg, color:sc.color }}>{sc.label}</span>
                      )}
                    </td>
                    <td style={{ padding:'12px 16px', color:'#9ca3af', fontSize:'12px' }}>{new Date(o.created_at).toLocaleDateString('en-IN')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail / History Modal */}
      {selectedOrder && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'580px', maxWidth:'94vw', padding:'28px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <div>
                <div style={{ fontSize:'12px', color:'#9ca3af', fontFamily:'monospace', marginBottom:'4px' }}>{selectedOrder.po_number}</div>
                <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>{selectedOrder.title}</h2>
              </div>
              <button onClick={() => { setSelectedOrder(null); setApprovalHistory([]); setPoAttachments([]); setPoComments([]); setCommentText('') }}
                style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
              {[
                ['Amount', fmtAmt(selectedOrder.amount, selectedOrder.currency || 'INR')],
                ['Currency', selectedOrder.currency || 'INR'],
                ['Department', selectedOrder.department || '—'],
                ['Supplier', selectedOrder.supplier?.name || '—'],
                ['Status', (statusConfig[selectedOrder.status]||{label:selectedOrder.status}).label],
                ['Invoice Ref', selectedOrder.invoice_ref || '—'],
              ].map(([k,v]) => (
                <div key={k}>
                  <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'2px' }}>{k}</div>
                  <div style={{ fontSize:'14px', fontWeight:'500', color:'#374151' }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Approval chain */}
            {selectedOrder.required_levels?.length > 0 && (
              <div style={{ marginBottom:'16px', padding:'12px', background:'#f8f9fa', borderRadius:'8px' }}>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'8px', fontWeight:'600' }}>APPROVAL CHAIN</div>
                <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
                  {selectedOrder.required_levels.map((lvl: string, i: number) => {
                    const history = approvalHistory.filter(a => a.level === lvl)
                    const anyApproved = history.some(a => a.status === 'approved')
                    const anyRejected = history.some(a => a.status === 'rejected')
                    const color = anyApproved ? '#16a34a' : anyRejected ? '#dc2626' : '#d97706'
                    const bg = anyApproved ? '#f0fdf4' : anyRejected ? '#fef2f2' : '#fef3c7'
                    return (
                      <span key={lvl} style={{ display:'inline-flex', alignItems:'center', gap:'4px' }}>
                        <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:bg, color }}>
                          {anyApproved ? '✓ ' : anyRejected ? '✗ ' : ''}{lvl}
                        </span>
                        {i < selectedOrder.required_levels.length - 1 && <span style={{ color:'#9ca3af' }}>→</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {selectedOrder.description && (
              <div style={{ padding:'12px', background:'#f9fafb', borderRadius:'8px', fontSize:'13px', color:'#6b7280', marginBottom:'12px' }}>
                {selectedOrder.description}
              </div>
            )}
            {selectedOrder.justification && (
              <div style={{ marginBottom:'12px' }}>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'4px' }}>Business Justification</div>
                <div style={{ padding:'12px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'8px', fontSize:'13px', color:'#92400e' }}>
                  {selectedOrder.justification}
                </div>
              </div>
            )}

            {/* PO Status Timeline */}
            <div style={{ marginBottom:'12px' }}>
              <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'12px', fontWeight:'600', letterSpacing:'0.5px' }}>STATUS TIMELINE</div>
              <div style={{ position:'relative' }}>
                {/* Build timeline steps */}
                {(() => {
                  const steps: { label: string; sublabel?: string; status: 'done'|'current'|'pending'|'rejected'; time?: string; note?: string }[] = []

                  // Step 1: Submitted
                  steps.push({
                    label: 'Submitted',
                    sublabel: selectedOrder.creator?.full_name || selectedOrder.creator?.email || 'You',
                    status: 'done',
                    time: selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : undefined
                  })

                  // Approval levels
                  const levels = selectedOrder.required_levels || []
                  for (const lvl of levels) {
                    const history = approvalHistory.filter((a: any) => a.level === lvl)
                    const approved = history.find((a: any) => a.status === 'approved')
                    const rejected = history.find((a: any) => a.status === 'rejected')
                    const isPO_rejected = selectedOrder.status === 'rejected'
                    const currentLevelPending = selectedOrder.status === `pending_${lvl.toLowerCase()}` || selectedOrder.status === 'submitted'

                    steps.push({
                      label: lvl + ' Approval',
                      sublabel: approved ? (approved.approver?.full_name || approved.approver?.email || 'Approved') : rejected ? (rejected.approver?.full_name || 'Rejected') : 'Awaiting approver',
                      status: approved ? 'done' : rejected ? 'rejected' : currentLevelPending ? 'current' : 'pending',
                      time: approved?.responded_at ? new Date(approved.responded_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : rejected?.responded_at ? new Date(rejected.responded_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : undefined,
                      note: rejected?.reject_reason || rejected?.notes || approved?.notes || undefined
                    })
                  }

                  // Finance step
                  const financeHistory = approvalHistory.filter((a: any) => a.level === 'FINANCE')
                  const financeApproved = financeHistory.find((a: any) => a.status === 'approved')
                  const financeRejected = financeHistory.find((a: any) => a.status === 'rejected')
                  steps.push({
                    label: 'Finance Approval',
                    sublabel: financeApproved ? (financeApproved.approver?.full_name || 'Approved') : financeRejected ? (financeRejected.approver?.full_name || 'Rejected') : 'Awaiting finance',
                    status: financeApproved ? 'done' : financeRejected ? 'rejected' : selectedOrder.status === 'pending_finance' ? 'current' : selectedOrder.status === 'approved' ? 'done' : 'pending',
                    time: financeApproved?.responded_at ? new Date(financeApproved.responded_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : undefined,
                  })

                  // Payment step
                  steps.push({
                    label: 'Payment',
                    sublabel: selectedOrder.status === 'approved' ? 'Awaiting payment' : 'Pending',
                    status: 'pending',
                    time: undefined
                  })

                  return steps.map((step, i) => {
                    const isLast = i === steps.length - 1
                    const dotColor = step.status === 'done' ? '#16a34a' : step.status === 'rejected' ? '#dc2626' : step.status === 'current' ? '#9B72F5' : '#d1d5db'
                    const dotBg = step.status === 'done' ? '#f0fdf4' : step.status === 'rejected' ? '#fef2f2' : step.status === 'current' ? '#ede9fe' : '#f9fafb'
                    return (
                      <div key={i} style={{ display:'flex', gap:'12px', position:'relative' }}>
                        {/* Connector line */}
                        {!isLast && <div style={{ position:'absolute', left:'15px', top:'30px', width:'2px', height:'calc(100% - 6px)', background: step.status === 'done' ? '#bbf7d0' : '#e5e7eb' }}/>}
                        {/* Dot */}
                        <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:dotBg, border:`2px solid ${dotColor}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, zIndex:1 }}>
                          <span style={{ fontSize:'13px' }}>{step.status === 'done' ? '✓' : step.status === 'rejected' ? '✗' : step.status === 'current' ? '●' : '○'}</span>
                        </div>
                        {/* Content */}
                        <div style={{ paddingBottom: isLast ? 0 : '16px', flex:1 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div>
                              <div style={{ fontSize:'13px', fontWeight:'600', color: step.status === 'pending' ? '#9ca3af' : '#111827' }}>{step.label}</div>
                              <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'1px' }}>{step.sublabel}</div>
                              {step.note && <div style={{ fontSize:'11px', color: step.status === 'rejected' ? '#dc2626' : '#6b7280', marginTop:'3px', fontStyle:'italic' }}>"{step.note}"</div>}
                            </div>
                            {step.time && <div style={{ fontSize:'11px', color:'#9ca3af', textAlign:'right', flexShrink:0, marginLeft:'8px' }}>{step.time}</div>}
                          </div>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>

            {/* Attachments */}
            {poAttachments.length > 0 && (
              <div style={{ marginBottom:'16px' }}>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'8px', fontWeight:'600', letterSpacing:'0.5px' }}>ATTACHMENTS</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  {poAttachments.map((att, i) => (
                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:'8px', textDecoration:'none', color:'#374151', fontSize:'13px' }}
                      onMouseEnter={e => (e.currentTarget.style.background='#f0f4ff')}
                      onMouseLeave={e => (e.currentTarget.style.background='#f8fafc')}>
                      <span style={{ fontSize:'16px' }}>📎</span>
                      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{att.name}</span>
                      <span style={{ fontSize:'11px', color:'#9B72F5', fontWeight:'500', flexShrink:0 }}>↗ Open</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Comments thread */}
            <div style={{ marginBottom:'16px' }}>
              <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'10px', fontWeight:'600', letterSpacing:'0.5px' }}>
                COMMENTS {poComments.length > 0 && <span style={{ background:'#ede9fe', color:'#7c3aed', borderRadius:'20px', padding:'1px 6px', marginLeft:'4px' }}>{poComments.length}</span>}
              </div>

              {/* Thread */}
              {poComments.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'10px', maxHeight:'200px', overflowY:'auto' }}>
                  {poComments.map((c: any) => {
                    const isMe = c.user_id === user?.id
                    return (
                      <div key={c.id} style={{ display:'flex', gap:'8px', alignItems:'flex-start', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                        <div style={{ width:'28px', height:'28px', borderRadius:'50%', background: isMe ? '#9B72F5' : '#e5e7eb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color: isMe ? '#fff' : '#6b7280', flexShrink:0 }}>
                          {(c.user_name || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ maxWidth:'75%' }}>
                          <div style={{ fontSize:'10px', color:'#9ca3af', marginBottom:'3px', textAlign: isMe ? 'right' : 'left' }}>
                            {isMe ? 'You' : c.user_name} · {new Date(c.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                          </div>
                          <div style={{ padding:'8px 12px', borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px', background: isMe ? '#ede9fe' : '#f3f4f6', fontSize:'13px', color:'#374151', lineHeight:'1.4' }}>
                            {c.message}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Compose */}
              <div style={{ display:'flex', gap:'8px', alignItems:'flex-end' }}>
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(selectedOrder.id) } }}
                  placeholder="Add a comment… (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  style={{ flex:1, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none', resize:'none', fontFamily:'sans-serif', lineHeight:'1.4' }}
                />
                <button onClick={() => postComment(selectedOrder.id)} disabled={postingComment || !commentText.trim()}
                  style={{ padding:'8px 14px', border:'none', borderRadius:'8px', background: postingComment || !commentText.trim() ? '#d1d5db' : '#9B72F5', color:'#fff', fontSize:'13px', fontWeight:'500', cursor: postingComment || !commentText.trim() ? 'not-allowed' : 'pointer', flexShrink:0 }}>
                  {postingComment ? '…' : 'Send'}
                </button>
              </div>
            </div>

            {/* Edit mode */}
            {editMode && editForm && (
              <div style={{ marginTop:'16px', padding:'16px', background:'#f9fafb', borderRadius:'10px', border:'1px solid #e5e7eb' }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'12px' }}>Edit Request</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  <div><label style={lbl}>Title</label><input style={inp} value={editForm.title} onChange={e => setEditForm({...editForm, title:e.target.value})}/></div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                    <div><label style={lbl}>Amount</label><input style={inp} type="number" value={editForm.amount} onChange={e => setEditForm({...editForm, amount:e.target.value})}/></div>
                    <div><label style={lbl}>Currency</label>
                      <select style={inp} value={editForm.currency} onChange={e => setEditForm({...editForm, currency:e.target.value})}>
                        {['INR','SGD','AED','USD','EUR','GBP','MYR','HKD'].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div><label style={lbl}>Department</label>
                    <select style={inp} value={editForm.department} onChange={e => setEditForm({...editForm, department:e.target.value})}>
                      {['IT','Finance','HR','GatewayOps','Compliance','FinOps','RevOps','Customer Success','Legal','Marketing','Sales','Admin'].map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Invoice Ref</label><input style={inp} value={editForm.invoice_ref||''} onChange={e => setEditForm({...editForm, invoice_ref:e.target.value})}/></div>
                  <div><label style={lbl}>Description</label><textarea style={{...inp,height:'60px',resize:'vertical' as any}} value={editForm.description||''} onChange={e => setEditForm({...editForm, description:e.target.value})}/></div>
                  <div><label style={lbl}>Justification</label><textarea style={{...inp,height:'60px',resize:'vertical' as any}} value={editForm.justification||''} onChange={e => setEditForm({...editForm, justification:e.target.value})}/></div>
                </div>
                <div style={{ display:'flex', gap:'8px', marginTop:'12px', justifyContent:'flex-end' }}>
                  <button onClick={() => { setEditMode(false); setEditForm(null) }}
                    style={{ padding:'7px 14px', border:'1px solid #e5e7eb', borderRadius:'7px', background:'#fff', fontSize:'13px', cursor:'pointer' }}>Cancel</button>
                  <button onClick={() => handleEditSubmit(selectedOrder)} disabled={actioning}
                    style={{ padding:'7px 14px', border:'none', borderRadius:'7px', background:'#9B72F5', color:'#fff', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>Save Changes</button>
                </div>
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'20px' }}>
              {/* Action buttons — only show for non-terminal statuses */}
              {['pending_l1','pending_l2','pending_l3','pending_finance','draft'].includes(selectedOrder.status) && !editMode && (
                <div style={{ display:'flex', gap:'8px' }}>
                  {selectedOrder.status === 'draft' ? (
                    <button onClick={() => handleResubmit(selectedOrder)} disabled={actioning}
                      style={{ padding:'7px 14px', border:'none', borderRadius:'7px', background:'#16a34a', color:'#fff', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>
                      ↑ Resubmit
                    </button>
                  ) : (
                    <button onClick={async () => {
                      // Recall first (cancel pending approvals, set to draft), then open edit
                      setActioning(true)
                      try {
                        await supabase.from('approval_requests')
                          .update({ status: 'cancelled' })
                          .eq('document_id', selectedOrder.id)
                          .eq('document_type', 'purchase_order')
                          .eq('status', 'submitted')
                        await supabase.from('purchase_orders')
                          .update({ status: 'draft', current_level: '0' })
                          .eq('id', selectedOrder.id)
                        setSelectedOrder((o: any) => ({ ...o, status: 'draft' }))
                        setEditMode(true)
                        setEditForm({ title:selectedOrder.title, description:selectedOrder.description||'', amount:String(selectedOrder.amount), currency:selectedOrder.currency||'INR', department:selectedOrder.department||'', justification:selectedOrder.justification||'', invoice_ref:selectedOrder.invoice_ref||'', supplier_id:selectedOrder.supplier_id||'' })
                      } catch(e: any) { alert('Error: ' + e.message) }
                      setActioning(false)
                    }} disabled={actioning}
                      style={{ padding:'7px 14px', border:'1px solid #9B72F5', borderRadius:'7px', background:'#fff', color:'#9B72F5', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>
                      ✏ Edit & Recall
                    </button>
                  )}
                  <button onClick={() => handleVoid(selectedOrder)} disabled={actioning}
                    style={{ padding:'7px 14px', border:'1px solid #fecaca', borderRadius:'7px', background:'#fff', color:'#dc2626', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>
                    ✕ Void
                  </button>
                </div>
              )}
              <div style={{ marginLeft:'auto', display:'flex', gap:'8px' }}>
                <button onClick={() => generatePDF(selectedOrder, approvalHistory)}
                  style={{ padding:'9px 16px', border:'1px solid #9B72F5', borderRadius:'8px', background:'#fff', color:'#9B72F5', fontSize:'14px', fontWeight:'500', cursor:'pointer' }}>
                  ⬇ PDF
                </button>
                <button onClick={() => { setSelectedOrder(null); setApprovalHistory([]); setPoAttachments([]); setPoComments([]); setCommentText(''); setEditMode(false); setEditForm(null) }}
                  style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Request Form */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'580px', maxWidth:'94vw', padding:'28px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>New Purchase Request</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>✕</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div>
                <label style={lbl}>Entity (Legal Entity) *</label>
                <select style={inp} value={formEntityId || ''} onChange={e => handleFormEntityChange(e.target.value)}>
                  {companies.map((co: any) => (
                    <option key={co.id} value={co.id}>{co.name} ({co.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={lbl}>Request Title *</label>
                <input style={inp} value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="e.g. AWS Cloud Services Q2"/>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
                <div>
                  <label style={lbl}>Amount *</label>
                  <input style={inp} type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} placeholder="0.00"/>
                </div>
                <div>
                  <label style={lbl}>Invoice Currency *</label>
                  <select style={inp} value={form.currency} onChange={e => setForm({...form, currency:e.target.value})}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Threshold hint */}
              {form.amount && (
                <div style={{ padding:'8px 12px', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:'8px', fontSize:'12px', color:'#0369a1' }}>
                  {parseFloat(form.amount) < 10000 ? '→ L1 approval only' :
                   parseFloat(form.amount) < 25000 ? '→ L1 then L2 approval' :
                   '→ L1 → L2 → L3 approval chain'}
                  {' '}(based on {form.currency} amount)
                </div>
              )}

              <div>
                <label style={lbl}>Department *</label>
                <select style={inp} value={form.department} onChange={e => setForm({...form, department:e.target.value})}>
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ position:'relative' }}>
                <label style={lbl}>Supplier (optional)</label>
                <input
                  style={inp}
                  placeholder={formSuppliers.length === 0 ? 'No suppliers yet — create one first' : 'Search supplier...'}
                  value={supplierSearch || (form.supplier_id ? formSuppliers.find(s => s.id === form.supplier_id)?.name || '' : '')}
                  onChange={e => { setSupplierSearch(e.target.value); setForm({...form, supplier_id:''}); setSupplierDropOpen(true) }}
                  onFocus={() => setSupplierDropOpen(true)}
                  onBlur={() => setTimeout(() => setSupplierDropOpen(false), 150)}
                  autoComplete="off"
                />
                {supplierDropOpen && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #d1d5db', borderRadius:'8px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', zIndex:100, maxHeight:'200px', overflowY:'auto', marginTop:'2px' }}>
                    {formSuppliers
                      .filter(s => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                      .map(s => (
                        <div key={s.id}
                          onMouseDown={() => { setForm({...form, supplier_id:s.id}); setSupplierSearch(''); setSupplierDropOpen(false) }}
                          style={{ padding:'10px 12px', cursor:'pointer', fontSize:'13px', borderBottom:'1px solid #f3f4f6' }}
                          onMouseEnter={e => (e.currentTarget.style.background='#f9fafb')}
                          onMouseLeave={e => (e.currentTarget.style.background='#fff')}>
                          {s.name}
                        </div>
                      ))}
                    <div
                      onMouseDown={() => { setShowSupplierModal(true); setSupplierDropOpen(false) }}
                      style={{ padding:'10px 12px', cursor:'pointer', fontSize:'13px', color:'#9B72F5', fontWeight:'500', borderTop:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:'6px' }}>
                      + Create new supplier
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>Invoice / Reference Number</label>
                <input style={inp} value={form.invoice_ref} onChange={e => setForm({...form, invoice_ref:e.target.value})} placeholder="INV-2024-001"/>
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea style={{...inp, height:'72px', resize:'vertical' as any}} value={form.description}
                  onChange={e => setForm({...form, description:e.target.value})} placeholder="What is this purchase for?"/>
              </div>
              <div>
                <label style={lbl}>Business Justification</label>
                <textarea style={{...inp, height:'72px', resize:'vertical' as any}} value={form.justification}
                  onChange={e => setForm({...form, justification:e.target.value})} placeholder="Why is this purchase needed?"/>
              </div>

              <div>
                <label style={lbl}>Attachments (Invoice, Contract, etc.)</label>
                <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={e => setAttachments(Array.from(e.target.files || []))}
                  style={{ width:'100%', padding:'8px', border:'1px dashed #d1d5db', borderRadius:'8px', fontSize:'13px', cursor:'pointer', boxSizing:'border-box' }}/>
                {attachments.length > 0 && (
                  <div style={{ marginTop:'6px', display:'flex', flexDirection:'column', gap:'4px' }}>
                    {attachments.map((f, i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 8px', background:'#f9fafb', borderRadius:'6px', fontSize:'12px', color:'#6b7280' }}>
                        <span>📎 {f.name}</span>
                        <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))}
                          style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:'14px', padding:'0 4px' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'24px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={saving || !form.title || !form.amount || !form.department}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: (!form.title||!form.amount||!form.department) ? '#c4b5fd' : '#9B72F5',
                  opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Create Supplier Modal */}
      {showSupplierModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'480px', maxWidth:'94vw', padding:'28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ fontSize:'18px', fontWeight:'600', margin:0 }}>Add New Supplier</h2>
              <button onClick={() => setShowSupplierModal(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280' }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <div>
                <label style={{ display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }}>Supplier Name *</label>
                <input style={{ width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none', boxSizing:'border-box' as any }}
                  value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm, name:e.target.value})} placeholder="Company name" autoFocus/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }}>Category</label>
                <input style={{ width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none', boxSizing:'border-box' as any }}
                  value={supplierForm.category} onChange={e => setSupplierForm({...supplierForm, category:e.target.value})} placeholder="e.g. IT Services, Logistics"/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }}>Contact Email</label>
                <input style={{ width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none', boxSizing:'border-box' as any }}
                  type="email" value={supplierForm.contact_email} onChange={e => setSupplierForm({...supplierForm, contact_email:e.target.value})} placeholder="supplier@company.com"/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:'12px', fontWeight:'500', color:'#6b7280', marginBottom:'4px' }}>Status</label>
                <select style={{ width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'13px', outline:'none', boxSizing:'border-box' as any }}
                  value={supplierForm.status} onChange={e => setSupplierForm({...supplierForm, status:e.target.value})}>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending Review</option>
                </select>
              </div>
            </div>
            <p style={{ fontSize:'12px', color:'#9ca3af', marginTop:'12px', marginBottom:'0' }}>
              Supplier will be added to <strong>{formEntityId ? (companiesMap[formEntityId]?.name || 'selected entity') : 'selected entity'}</strong>. You can add full bank details from the Suppliers page.
            </p>
            <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowSupplierModal(false)}
                style={{ padding:'9px 18px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'#fff', fontSize:'14px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={createSupplierInline} disabled={savingSupplier || !supplierForm.name}
                style={{ padding:'9px 18px', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'500', cursor:'pointer', color:'#fff',
                  background: !supplierForm.name ? '#c4b5fd' : '#9B72F5', opacity: savingSupplier ? 0.7 : 1 }}>
                {savingSupplier ? 'Saving...' : 'Save & Select'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
