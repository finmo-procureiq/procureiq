import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: 'onboarding@resend.dev', to: [to], subject, html }),
  })
  const result = await res.json()
  console.log('Resend response for', to, ':', JSON.stringify(result))
}

// Get emails of users with a specific role in a company
// roleValue matches entries in the company_members.roles text[] array
async function getEmailsByRole(companyId: string, roleValue: string): Promise<string[]> {
  const { data: members } = await supabase
    .from('company_members')
    .select('user_id, manages_department')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .contains('roles', [roleValue])

  if (!members || members.length === 0) return []

  const userIds = members.map((m: any) => m.user_id)
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, email')
    .in('id', userIds)

  return (profiles || []).map((p: any) => p.email).filter(Boolean)
}

// Map approval level codes to roles array values
function levelToRole(level: string): string {
  const map: Record<string, string> = {
    'L1': 'L1',
    'L1_CHECKER': 'L1',
    'L2': 'L2',
    'L2_CHECKER': 'L2',
    'L3': 'L3',
    'L3_CHECKER': 'L3',
    'L4': 'L4',
    'L4_CHECKER': 'L4',
    'FINANCE': 'FINANCE',
    'SUPER_ADMIN': 'ADMIN',
    'ADMIN': 'ADMIN',
  }
  return map[level] || level
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, data } = body

  console.log('Email API called:', type, JSON.stringify(data).slice(0, 200))

  try {
    if (type === 'po_submitted') {
      const { po, makerEmail } = data

      const { data: maker } = await supabase
        .from('user_profiles')
        .select('full_name, department')
        .eq('email', makerEmail)
        .single()

      const makerDept = maker?.department || ''

      // Notify L1 approvers + ADMIN for this company
      const l1Emails = await getEmailsByRole(po.company_id, 'L1')
      const adminEmails = await getEmailsByRole(po.company_id, 'ADMIN')
      const allEmails = [...new Set([...l1Emails, ...adminEmails])] as string[]

      console.log('po_submitted: notifying', allEmails)

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
            <p><strong>Category:</strong> ${po.category || '—'}</p>
            <p><strong>Description:</strong> ${po.description || '—'}</p>
            <br/>
            <a href="https://procureiq-gdja.onrender.com/approvals" style="background:#9B72F5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">Review &amp; Approve</a>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">ProcureIQ Enterprise</p>
          </div>`
        )
      }
    }

    if (type === 'po_approved') {
      const { po, approverName, isFinal, makerEmail, nextLevel } = data

      // Always notify the maker
      await sendEmail(
        makerEmail,
        isFinal
          ? `[ProcureIQ] PO Fully Approved - ${po.po_number}`
          : `[ProcureIQ] PO Approved - Moving to Next Level - ${po.po_number}`,
        `<div style="font-family:sans-serif;padding:24px;max-width:600px">
          <h2 style="color:#16a34a">${isFinal ? 'Your PO has been Fully Approved' : 'Approved — Pending Next Level'}</h2>
          <p><strong>PO Number:</strong> ${po.po_number}</p>
          <p><strong>Approved By:</strong> ${approverName}</p>
          <p><strong>Amount:</strong> ${po.currency} ${Number(po.amount).toLocaleString()}</p>
          ${!isFinal ? `<p style="color:#d97706">Awaiting next approval level</p>` : '<p style="color:#16a34a">All levels approved ✓</p>'}
          <p style="color:#9ca3af;font-size:12px">ProcureIQ Enterprise</p>
        </div>`
      )

      // If not final, also notify the next level approvers
      if (!isFinal && nextLevel && po.company_id) {
        const nextRole = levelToRole(nextLevel)
        const nextEmails = await getEmailsByRole(po.company_id, nextRole)
        console.log('po_approved: notifying next level', nextLevel, nextRole, nextEmails)
        for (const email of nextEmails) {
          await sendEmail(
            email,
            `[ProcureIQ] PO Awaiting Your Approval - ${po.po_number}`,
            `<div style="font-family:sans-serif;padding:24px;max-width:600px">
              <h2 style="color:#3C2B5A">PO Requires Your Approval</h2>
              <p>A purchase order has passed the previous approval level and now requires your review.</p>
              <p><strong>PO Number:</strong> ${po.po_number}</p>
              <p><strong>Amount:</strong> ${po.currency} ${Number(po.amount).toLocaleString()}</p>
              <p><strong>Previously Approved By:</strong> ${approverName}</p>
              <br/>
              <a href="https://procureiq-gdja.onrender.com/approvals" style="background:#9B72F5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">Review &amp; Approve</a>
              <p style="color:#9ca3af;font-size:12px;margin-top:24px">ProcureIQ Enterprise</p>
            </div>`
          )
        }
      }
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
          <p><strong>Reason:</strong> <span style="color:#dc2626">${reason || '—'}</span></p>
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
