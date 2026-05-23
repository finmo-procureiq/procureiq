import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendEmail(to: string, subject: string, html: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer re_KRPN6946_4wbBcs6F5dDvHkrLAatXhh3x',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: 'onboarding@resend.dev', to: [to], subject, html }),
  })
}

async function getApproverEmails(companyId: string, roleCode: string, makerDepartment: string) {
  // First try to find approver who manages the maker's department
  const { data: deptApprovers } = await supabase
    .from('company_members')
    .select('user_id, manages_department, role:roles(code)')
    .eq('company_id', companyId)
    .eq('is_active', true)

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, email, full_name')

  const allApprovers = (deptApprovers || []).filter((m: any) => m.role?.code === roleCode)

  // Try department-specific match first
  if (makerDepartment) {
    const deptMatch = allApprovers.filter((m: any) => m.manages_department === makerDepartment)
    if (deptMatch.length > 0) {
      return deptMatch
        .map((m: any) => profiles?.find((p: any) => p.id === m.user_id)?.email)
        .filter(Boolean)
    }
  }

  // Fall back to approvers with no department restriction (manages all)
  const generalApprovers = allApprovers.filter((m: any) => !m.manages_department)
  if (generalApprovers.length > 0) {
    return generalApprovers
      .map((m: any) => profiles?.find((p: any) => p.id === m.user_id)?.email)
      .filter(Boolean)
  }

  // Last resort — all approvers with that role
  return allApprovers
    .map((m: any) => profiles?.find((p: any) => p.id === m.user_id)?.email)
    .filter(Boolean)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, data } = body

  try {
    if (type === 'po_submitted') {
      const { po, makerEmail } = data

      // Get maker's department
      const { data: maker } = await supabase
        .from('user_profiles').select('full_name, department').eq('email', makerEmail).single()

      const makerDept = maker?.department || ''

      // Get L1 approvers for maker's department
      const l1Emails = await getApproverEmails(po.company_id, 'L1_CHECKER', makerDept)

      // Also always notify SUPER_ADMIN
      const { data: admins } = await supabase
        .from('company_members')
        .select('user_id, role:roles(code)')
        .eq('company_id', po.company_id)
        .eq('is_active', true)

      const { data: profiles } = await supabase.from('user_profiles').select('id, email')
      const adminEmails = (admins || [])
        .filter((m: any) => m.role?.code === 'SUPER_ADMIN')
        .map((m: any) => profiles?.find((p: any) => p.id === m.user_id)?.email)
        .filter(Boolean)

      const allEmails = [...new Set([...l1Emails, ...adminEmails])] as string[]

      for (const email of allEmails) {
        await sendEmail(
          email,
          `[ProcureIQ] New PO Pending Approval - ${po.po_number}`,
          `<div style="font-family:sans-serif;padding:24px;max-width:600px">
            <h2 style="color:#3C2B5A">New PO Requires Your Approval</h2>
            <p><strong>PO Number:</strong> ${po.po_number}</p>
            <p><strong>Requested By:</strong> ${maker?.full_name || makerEmail}</p>
            <p><strong>Department:</strong> ${makerDept || '—'}</p>
            <p><strong>Supplier:</strong> ${po.supplier_name || '—'}</p>
            <p><strong>Amount:</strong> ${po.currency} ${Number(po.amount).toLocaleString()}</p>
            <p><strong>Category:</strong> ${po.category}</p>
            <p><strong>Description:</strong> ${po.description}</p>
            <br/>
            <a href="https://procureiq-gdja.onrender.com/approvals" style="background:#9B72F5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">Review & Approve</a>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">ProcureIQ Enterprise</p>
          </div>`
        )
      }
    }

    if (type === 'po_approved') {
      const { po, approverName, isFinal, makerEmail } = data
      await sendEmail(
        makerEmail,
        isFinal ? `[ProcureIQ] PO Fully Approved - ${po.po_number}` : `[ProcureIQ] PO Approved - Moving to Next Level - ${po.po_number}`,
        `<div style="font-family:sans-serif;padding:24px;max-width:600px">
          <h2 style="color:#16a34a">${isFinal ? 'Your PO has been Fully Approved' : 'Approved - Pending Next Level'}</h2>
          <p><strong>PO Number:</strong> ${po.po_number}</p>
          <p><strong>Approved By:</strong> ${approverName}</p>
          <p><strong>Total Amount:</strong> ${po.currency} ${Number(po.total_amount).toLocaleString()}</p>
          <p style="color:#9ca3af;font-size:12px">ProcureIQ Enterprise</p>
        </div>`
      )
    }

    if (type === 'po_rejected') {
      const { po, approverName, reason, makerEmail } = data
      await sendEmail(
        makerEmail,
        `[ProcureIQ] PO Rejected - ${po.po_number}`,
        `<div style="font-family:sans-serif;padding:24px;max-width:600px">
          <h2 style="color:#dc2626">Your PO has been Rejected</h2>
          <p><strong>PO Number:</strong> ${po.po_number}</p>
          <p><strong>Rejected By:</strong> ${approverName}</p>
          <p><strong>Reason:</strong> <span style="color:#dc2626">${reason}</span></p>
          <p style="color:#9ca3af;font-size:12px">ProcureIQ Enterprise</p>
        </div>`
      )
    }

    if (type === 'payment_completed') {
      const { payment, supplierName, notifyEmails } = data
      const emails = Array.isArray(notifyEmails) ? notifyEmails : [notifyEmails]
      for (const email of emails) {
        await sendEmail(
          email,
          `[ProcureIQ] Payment Processed - ${payment.invoice_number}`,
          `<div style="font-family:sans-serif;padding:24px;max-width:600px">
            <h2 style="color:#16a34a">Payment Successfully Processed</h2>
            <p><strong>Invoice:</strong> ${payment.invoice_number}</p>
            <p><strong>Supplier:</strong> ${supplierName}</p>
            <p><strong>Amount:</strong> ${payment.currency} ${Number(payment.invoice_amount).toLocaleString()}</p>
            <p><strong>Reference:</strong> ${payment.bank_ref}</p>
            <p style="color:#9ca3af;font-size:12px">ProcureIQ Enterprise</p>
          </div>`
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch(e: any) {
    console.error('Email API error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}