import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, data } = body
  console.log('Email API called with type:', type)

  try {
    async function send(to: string, subject: string, html: string) {
      console.log('Sending to:', to)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer re_KRPN6946_4wbBcs6F5dDvHkrLAatXhh3x',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: [to],
          subject,
          html,
        }),
      })
      const result = await res.json()
      console.log('Resend result:', JSON.stringify(result))
    }

    if (type === 'po_submitted') {
      const { po } = data
      await send(
        'girish.agrahari@finmo.net',
        `[ProcureIQ] New PO Pending Approval - ${po.po_number}`,
        `<div style="font-family:sans-serif;padding:24px;max-width:600px">
          <h2 style="color:#3C2B5A">New PO Requires Your Approval</h2>
          <p><strong>PO Number:</strong> ${po.po_number}</p>
          <p><strong>Supplier:</strong> ${po.supplier_name || 'Unknown'}</p>
          <p><strong>Amount:</strong> ${po.currency} ${Number(po.amount).toLocaleString()}</p>
          <p><strong>Category:</strong> ${po.category}</p>
          <p><strong>Description:</strong> ${po.description}</p>
          <br/>
          <p style="color:#9ca3af;font-size:12px">ProcureIQ Enterprise</p>
        </div>`
      )
    }

    if (type === 'po_approved') {
      const { po, approverName, isFinal, makerEmail } = data
      await send(
        makerEmail,
        isFinal
          ? `[ProcureIQ] PO Fully Approved - ${po.po_number}`
          : `[ProcureIQ] PO Approved - Moving to Next Level - ${po.po_number}`,
        `<div style="font-family:sans-serif;padding:24px;max-width:600px">
          <h2 style="color:#16a34a">${isFinal ? 'Your PO has been Fully Approved' : 'Your PO has been Approved at this Level'}</h2>
          <p><strong>PO Number:</strong> ${po.po_number}</p>
          <p><strong>Approved By:</strong> ${approverName}</p>
          <p><strong>Total Amount:</strong> ${po.currency} ${Number(po.total_amount).toLocaleString()}</p>
          <p><strong>Status:</strong> ${isFinal ? 'Fully Approved' : 'Pending next level approval'}</p>
          <br/>
          <p style="color:#9ca3af;font-size:12px">ProcureIQ Enterprise</p>
        </div>`
      )
    }

    if (type === 'po_rejected') {
      const { po, approverName, reason, makerEmail } = data
      await send(
        makerEmail,
        `[ProcureIQ] PO Rejected - ${po.po_number}`,
        `<div style="font-family:sans-serif;padding:24px;max-width:600px">
          <h2 style="color:#dc2626">Your PO has been Rejected</h2>
          <p><strong>PO Number:</strong> ${po.po_number}</p>
          <p><strong>Rejected By:</strong> ${approverName}</p>
          <p><strong>Amount:</strong> ${po.currency} ${Number(po.total_amount).toLocaleString()}</p>
          <p><strong>Reason:</strong> <span style="color:#dc2626">${reason}</span></p>
          <br/>
          <p style="color:#9ca3af;font-size:12px">ProcureIQ Enterprise</p>
        </div>`
      )
    }

    if (type === 'payment_completed') {
      const { payment, supplierName, notifyEmails } = data
      for (const email of (Array.isArray(notifyEmails) ? notifyEmails : [notifyEmails])) {
        await send(
          email,
          `[ProcureIQ] Payment Processed - ${payment.invoice_number}`,
          `<div style="font-family:sans-serif;padding:24px;max-width:600px">
            <h2 style="color:#16a34a">Payment Successfully Processed</h2>
            <p><strong>Invoice:</strong> ${payment.invoice_number}</p>
            <p><strong>Supplier:</strong> ${supplierName}</p>
            <p><strong>Amount:</strong> ${payment.currency} ${Number(payment.invoice_amount).toLocaleString()}</p>
            <p><strong>Method:</strong> ${payment.payment_method}</p>
            <p><strong>Reference:</strong> ${payment.bank_ref}</p>
            <p><strong>Date:</strong> ${payment.paid_date}</p>
            <br/>
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