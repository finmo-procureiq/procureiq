'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    if (!open) { setQuery(''); setResults([]) }
  }, [open])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(() => doSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  async function doSearch(q: string) {
    setSearching(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSearching(false); return }

    const { data: members } = await supabase
      .from('company_members').select('company_id').eq('user_id', user.id).eq('is_active', true)
    const companyIds = (members || []).map((m: any) => m.company_id)
    if (!companyIds.length) { setSearching(false); return }

    // Search POs
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('id, po_number, title, amount, currency, status, company_id')
      .in('company_id', companyIds)
      .or(`po_number.ilike.%${q}%,title.ilike.%${q}%`)
      .limit(8)

    // Search suppliers
    const { data: sups } = await supabase
      .from('suppliers')
      .select('id, name, category, status, company_id')
      .in('company_id', companyIds)
      .ilike('name', `%${q}%`)
      .limit(5)

    const poResults = (pos || []).map(p => ({
      type: 'PO',
      id: p.id,
      title: p.title,
      sub: `${p.po_number} · ${p.currency} ${Number(p.amount).toLocaleString()} · ${p.status}`,
      href: '/requests',
      icon: '📄',
    }))
    const supResults = (sups || []).map(s => ({
      type: 'Supplier',
      id: s.id,
      title: s.name,
      sub: `${s.category || 'No category'} · ${s.status}`,
      href: '/suppliers',
      icon: '🏭',
    }))

    setResults([...poResults, ...supResults])
    setSearching(false)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      title="Search (Ctrl+K)"
      style={{ background:'none', border:'none', cursor:'pointer', padding:'6px 8px', borderRadius:'6px', color:'rgba(255,255,255,0.5)', fontSize:'16px', display:'flex', alignItems:'center', gap:'6px', width:'100%', textAlign:'left' }}
      onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.background='none')}>
      <span>🔍</span>
      <span style={{ fontSize:'12px' }}>Search</span>
      <span style={{ marginLeft:'auto', fontSize:'10px', background:'rgba(255,255,255,0.1)', padding:'1px 6px', borderRadius:'4px', color:'rgba(255,255,255,0.3)' }}>⌘K</span>
    </button>
  )

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'80px' }}
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div style={{ background:'#fff', borderRadius:'16px', width:'560px', maxWidth:'94vw', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', overflow:'hidden' }}>
        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'14px 16px', borderBottom:'1px solid #f3f4f6' }}>
          <span style={{ fontSize:'18px', flexShrink:0 }}>🔍</span>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search POs, suppliers, amounts..."
            style={{ flex:1, border:'none', outline:'none', fontSize:'16px', fontFamily:'sans-serif', color:'#111' }}/>
          {searching && <span style={{ fontSize:'12px', color:'#9ca3af' }}>Searching...</span>}
          <kbd onClick={() => setOpen(false)}
            style={{ padding:'2px 8px', border:'1px solid #e5e7eb', borderRadius:'5px', fontSize:'11px', color:'#9ca3af', cursor:'pointer' }}>Esc</kbd>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <div style={{ maxHeight:'400px', overflowY:'auto' }}>
            {results.map((r, i) => (
              <div key={r.id + r.type} onClick={() => { router.push(r.href); setOpen(false) }}
                style={{ display:'flex', gap:'12px', padding:'12px 16px', cursor:'pointer', borderBottom: i < results.length - 1 ? '1px solid #f9fafb' : 'none', alignItems:'center' }}
                onMouseEnter={e => (e.currentTarget.style.background='#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background='#fff')}>
                <span style={{ fontSize:'20px', flexShrink:0 }}>{r.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'14px', fontWeight:'500', color:'#111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.title}</div>
                  <div style={{ fontSize:'12px', color:'#9ca3af', marginTop:'1px' }}>{r.sub}</div>
                </div>
                <span style={{ fontSize:'11px', padding:'2px 8px', background:'#f3f4f6', borderRadius:'20px', color:'#6b7280', flexShrink:0 }}>{r.type}</span>
              </div>
            ))}
          </div>
        ) : query && !searching ? (
          <div style={{ padding:'32px', textAlign:'center', color:'#9ca3af', fontSize:'14px' }}>
            No results for "{query}"
          </div>
        ) : !query ? (
          <div style={{ padding:'20px 16px' }}>
            <div style={{ fontSize:'11px', color:'#9ca3af', fontWeight:'600', marginBottom:'8px' }}>QUICK LINKS</div>
            {[['📄','My Requests','/requests'],['✅','Approvals','/approvals'],['🏭','Suppliers','/suppliers'],['📊','Analytics','/analytics']].map(([icon,label,href]) => (
              <div key={href} onClick={() => { router.push(href); setOpen(false) }}
                style={{ display:'flex', gap:'10px', alignItems:'center', padding:'8px', borderRadius:'8px', cursor:'pointer', fontSize:'14px', color:'#374151' }}
                onMouseEnter={e => (e.currentTarget.style.background='#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background='')}>
                <span>{icon}</span><span>{label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
