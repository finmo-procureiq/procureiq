export async function sendEmail({ to, subject, html }: {
  to: string | string[]
  subject: string
  html: string
}) {
  const recipients = Array.isArray(to) ? to : [to]
  console.log('Attempting to send email to:', recipients)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer re_KRPN6946_4wbBcs6F5dDvHkrLAatXhh3x',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: recipients,
        subject,
        html,
      }),
    })
    const result = await res.json()
    console.log('Resend response:', JSON.stringify(result))
  } catch(e) {
    console.error('Email error:', e)
  }
}

export function poSubmittedEmail(po: any, maker: any) {
  return {
    subject: `[ProcureIQ] New PO Pending Approval - ${po.po_number}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="background:#1c1917;padding:16px 24px;border-radius:8px 8px 0 0">
        <span style="color:#fff;font-size:18px;font-weight:600">ProcureIQ Enterprise</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 16px;font-size:18px;color:#1c1917">Purchase Order Pending Your Approval</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">PO Number</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb">${po.po_number}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Requested By</td><td style="padding:10px 14px;font-size:13px;border-bottom:1px solid #e5e7eb">${maker?.full_name || maker?.email || 'Unknown'}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Supplier</td><td style="padding:10px 14px;font-size:13px;border-bottom:1px solid #e5e7eb">${po.supplier_name || 'Unknown'}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Amount</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb">${po.currency} ${Number(po.amount).toLocaleString()}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280">Category</td><td style="padding:10px 14px;font-size:13px">${po.category}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">ProcureIQ Enterprise - Automated notification</p>
      </div>
    </div>`
  }
}

export function poApprovedEmail(po: any, approverName: string, isFinal: boolean) {
  return {
    subject: isFinal
      ? `[ProcureIQ] PO Fully Approved - ${po.po_number}`
      : `[ProcureIQ] PO Approved - Moving to Next Level - ${po.po_number}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="background:#1c1917;padding:16px 24px;border-radius:8px 8px 0 0">
        <span style="color:#fff;font-size:18px;font-weight:600">ProcureIQ Enterprise</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:12px 16px;border-radius:8px;margin-bottom:20px">
          <span style="color:#16a34a;font-weight:600">${isFinal ? 'PO Fully Approved' : 'Approved - Awaiting Next Level'}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">PO Number</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb">${po.po_number}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Approved By</td><td style="padding:10px 14px;font-size:13px;border-bottom:1px solid #e5e7eb">${approverName}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280">Total Amount</td><td style="padding:10px 14px;font-size:13px;font-weight:600">${po.currency} ${Number(po.total_amount).toLocaleString()}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">ProcureIQ Enterprise - Automated notification</p>
      </div>
    </div>`
  }
}

export function poRejectedEmail(po: any, approverName: string, reason: string) {
  return {
    subject: `[ProcureIQ] PO Rejected - ${po.po_number}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="background:#1c1917;padding:16px 24px;border-radius:8px 8px 0 0">
        <span style="color:#fff;font-size:18px;font-weight:600">ProcureIQ Enterprise</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <div style="background:#fef2f2;border:1px solid #fecaca;padding:12px 16px;border-radius:8px;margin-bottom:20px">
          <span style="color:#dc2626;font-weight:600">Purchase Order Rejected</span>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">PO Number</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb">${po.po_number}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Rejected By</td><td style="padding:10px 14px;font-size:13px;border-bottom:1px solid #e5e7eb">${approverName}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Amount</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb">${po.currency} ${Number(po.total_amount).toLocaleString()}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280">Reason</td><td style="padding:10px 14px;font-size:13px;color:#dc2626">${reason}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">ProcureIQ Enterprise - Automated notification</p>
      </div>
    </div>`
  }
}

export function paymentCompletedEmail(payment: any, supplierName: string) {
  return {
    subject: `[ProcureIQ] Payment Processed - ${payment.invoice_number}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="background:#1c1917;padding:16px 24px;border-radius:8px 8px 0 0">
        <span style="color:#fff;font-size:18px;font-weight:600">ProcureIQ Enterprise</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:12px 16px;border-radius:8px;margin-bottom:20px">
          <span style="color:#16a34a;font-weight:600">Payment Successfully Processed</span>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Invoice</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb">${payment.invoice_number}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Supplier</td><td style="padding:10px 14px;font-size:13px;border-bottom:1px solid #e5e7eb">${supplierName}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Amount</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb">${payment.currency} ${Number(payment.invoice_amount).toLocaleString()}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Method</td><td style="padding:10px 14px;font-size:13px;border-bottom:1px solid #e5e7eb">${payment.payment_method}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280">Ref</td><td style="padding:10px 14px;font-size:13px;font-family:monospace">${payment.bank_ref}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">ProcureIQ Enterprise - Automated notification</p>
      </div>
    </div>`
  }
}