'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'

interface Notification {
  id: string
  message: string
  po_number?: string
  action: string
  created_at: string
  read: boolean
  href: string
}

const actionLabel: Record<string, string> = {
  APPROVE: '✅ Approved',
  REJECT: '❌ Rejected',
  SUBMIT: '📤 Submitted',
  CREATE: '📝 Created',
  RECALL: '↩ Recalled',
  MARK_PAID: '💰 Marked Paid',
  ESCALATE: '⬆ Escalated',
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const dropRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { loadNotifications() }, [])

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Poll every 30s for new notifications
  useEffect(() => {
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadNotifications() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: members } = await supabase
        .from('company_members').select('company_id').eq('user_id', user.id).eq('is_active', true)
      const companyIds = (members || []).map((m: any) => m.company_id)
      if (!companyIds.length) return

      // Pull recent audit log entries for PO events relevant to this user
      const { data: logs } = await supabase
        .from('audit_log')
        .select('id, action, entity_ref, new_values, created_at, company_id, user_id')
        .in('company_id', companyIds)
        .in('action', ['APPROVE','REJECT','SUBMIT','MARK_PAID','ESCALATE','RECALL'])
        .eq('entity_type', 'purchase_order')
        .order('created_at', { ascending: false })
        .limit(20)

      const readIds: string[] = JSON.parse(localStorage.getItem('notif_read') || '[]')

      const notifs: Notification[] = (logs || []).map((l: any) => ({
        id: l.id,
        message: `${actionLabel[l.action] || l.action}: ${l.new_values?.title || l.entity_ref || 'PO'}`,
        po_number: l.entity_ref,
        action: l.action,
        created_at: l.created_at,
        read: readIds.includes(l.id),
        href: '/requests',
      }))

      setNotifications(notifs)
      setUnread(notifs.filter(n => !n.read).length)
    } catch { /* silent */ }
  }

  function markAllRead() {
    const ids = notifications.map(n => n.id)
    try { localStorage.setItem('notif_read', JSON.stringify(ids)) } catch {}
    setNotifications(n => n.map(x => ({ ...x, read: true })))
    setUnread(0)
  }

  function handleClick(n: Notification) {
    // Mark this one read
    const ids = notifications.map(x => x.id)
    try { localStorage.setItem('notif_read', JSON.stringify(ids)) } catch {}
    setOpen(false)
    router.push(n.href)
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div ref={dropRef} style={{ position:'relative' }}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) markAllRead() }}
        title="Notifications"
        style={{ background:'none', border:'none', cursor:'pointer', padding:'6px 8px', borderRadius:'6px', color:'rgba(255,255,255,0.6)', fontSize:'18px', position:'relative', display:'flex', alignItems:'center' }}
        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.background='none')}>
        🔔
        {unread > 0 && (
          <span style={{ position:'absolute', top:'2px', right:'2px', background:'#ef4444', color:'#fff', borderRadius:'50%', fontSize:'9px', fontWeight:'700', minWidth:'16px', height:'16px', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position:'fixed', top:'56px', right:'12px', width:'340px', maxWidth:'94vw', background:'#fff', borderRadius:'12px', boxShadow:'0 8px 32px rgba(0,0,0,0.18)', zIndex:1500, overflow:'hidden', border:'1px solid #e5e7eb' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid #f3f4f6' }}>
            <span style={{ fontSize:'13px', fontWeight:'600', color:'#111' }}>Notifications</span>
            {notifications.length > 0 && (
              <button onClick={markAllRead} style={{ background:'none', border:'none', fontSize:'11px', color:'#9B72F5', cursor:'pointer', fontWeight:'500' }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight:'360px', overflowY:'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding:'32px', textAlign:'center', color:'#9ca3af', fontSize:'13px' }}>
                No recent notifications
              </div>
            ) : notifications.map(n => (
              <div key={n.id} onClick={() => handleClick(n)}
                style={{ display:'flex', gap:'10px', padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid #f9fafb', background: n.read ? '#fff' : '#faf8ff', alignItems:'flex-start' }}
                onMouseEnter={e => (e.currentTarget.style.background='#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background= n.read ? '#fff' : '#faf8ff')}>
                {!n.read && <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#9B72F5', flexShrink:0, marginTop:'5px' }}/>}
                {n.read && <span style={{ width:'6px', flexShrink:0 }}/>}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'13px', color:'#111', lineHeight:'1.3', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.message}</div>
                  <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'3px' }}>{timeAgo(n.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
