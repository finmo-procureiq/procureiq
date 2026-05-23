'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<any[]>([])
  const [activeCompany, setActiveCompany] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('')
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles').select('full_name, email').eq('id', user.id).single()
      setUserProfile(profile)
      const { data: memberships } = await supabase
        .from('company_members')
        .select('company_id, role:roles(code), company:companies(id, name, code, country, currency)')
        .eq('user_id', user.id).eq('is_active', true)
      if (memberships?.length) {
        const cos = memberships.map((m: any) => m.company).filter(Boolean)
        setCompanies(cos)
        const saved = localStorage.getItem('activeCompanyId')
        const active = cos.find((c: any) => c.id === saved) || cos[0]
        setActiveCompany(active)
        if (!saved && active) localStorage.setItem('activeCompanyId', active.id)
        const activeMembership = memberships.find((m: any) => m.company_id === active?.id)
        setUserRole((activeMembership as any)?.role?.code || '')
      }
    } catch(e) { console.error(e) }
  }

  function switchCompany(companyId: string) {
    const company = companies.find(c => c.id === companyId)
    if (company) {
      setActiveCompany(company)
      localStorage.setItem('activeCompanyId', companyId)
      window.location.reload()
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(userRole)
  const isApprover = ['SUPER_ADMIN', 'ADMIN', 'L1_CHECKER', 'L2_CHECKER', 'L3_CHECKER'].includes(userRole)
  const isMaker = userRole === 'MAKER'
  const canSeeFinance = isAdmin || isApprover

  if (pathname?.startsWith('/auth')) {
    return (
      <html lang="en">
        <body style={{ margin:0, padding:0, fontFamily:'sans-serif' }}>{children}</body>
      </html>
    )
  }

  return (
    <html lang="en">
      <body style={{ margin:0, padding:0, fontFamily:'sans-serif', background:'#F3EFFE' }}>
        <div style={{ display:'flex', minHeight:'100vh' }}>
          <aside style={{
            width:'230px', flexShrink:0, position:'fixed', top:0, left:0, bottom:0,
            display:'flex', flexDirection:'column', zIndex:100,
            background:'linear-gradient(180deg, #3C2B5A 0%, #4A3F6B 100%)',
            boxShadow:'4px 0 20px rgba(60,43,90,0.3)'
          }}>
            <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize:'20px', fontWeight:'700', color:'#fff' }}>
                Procure<span style={{ color:'#C4B0F0' }}>IQ</span>
              </div>
              <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'1.5px', marginTop:'3px' }}>Enterprise</div>
            </div>

            {companies.length > 0 && (
              <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)', background:'rgba(0,0,0,0.15)' }}>
                <div style={{ fontSize:'9px', color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px' }}>Active Entity</div>
                <select value={activeCompany?.id || ''} onChange={e => switchCompany(e.target.value)}
                  style={{ width:'100%', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(196,176,240,0.3)', borderRadius:'8px', color:'#fff', padding:'7px 10px', fontSize:'12px', fontFamily:'sans-serif', cursor:'pointer', outline:'none', appearance:'auto' }}>
                  {companies.map(c => (
                    <option key={c.id} value={c.id} style={{ background:'#3C2B5A', color:'#fff' }}>
                      {c.name} ({c.currency})
                    </option>
                  ))}
                </select>
                {activeCompany && (
                  <div style={{ marginTop:'6px', display:'flex', gap:'5px' }}>
                    <span style={{ fontSize:'10px', background:'rgba(155,114,245,0.25)', color:'#C4B0F0', padding:'2px 7px', borderRadius:'20px', fontWeight:'600' }}>
                      {activeCompany.code}
                    </span>
                  </div>
                )}
              </div>
            )}

            <nav style={{ flex:1, padding:'8px 0', overflowY:'auto' }}>
              {/* Dashboard */}
              <NavLink href="/dashboard" label="Dashboard" pathname={pathname} />

              {/* Procurement */}
              <SectionLabel label="PROCUREMENT" />
              <NavLink href="/suppliers" label="Suppliers" pathname={pathname} />
              {(isMaker || isAdmin) && <NavLink href="/requests" label="My Requests" pathname={pathname} />}
              {isApprover && <NavLink href="/approvals" label="Approvals" pathname={pathname} />}
              {(isApprover || isMaker || isAdmin) && <NavLink href="/rejections" label="Rejections" pathname={pathname} />}

              {/* Finance */}
              {canSeeFinance && <SectionLabel label="FINANCE" />}
              {canSeeFinance && <NavLink href="/payments" label="Payments" pathname={pathname} />}
              {canSeeFinance && <NavLink href="/reports" label="Reports" pathname={pathname} />}
              {canSeeFinance && <NavLink href="/analytics" label="Analytics" pathname={pathname} />}

              {/* Compliance */}
              <SectionLabel label="COMPLIANCE" />
              <NavLink href="/audit" label="Audit Trail" pathname={pathname} />

              {/* Admin */}
              {isAdmin && <SectionLabel label="ADMIN" />}
              {isAdmin && <NavLink href="/admin/users" label="Users & Roles" pathname={pathname} />}
              {isAdmin && <NavLink href="/admin/matrix" label="Approval Matrix" pathname={pathname} />}
              {isAdmin && <NavLink href="/admin/entities" label="Manage Entities" pathname={pathname} />}
              {isAdmin && <NavLink href="/admin/departments" label="Manage Departments" pathname={pathname} />}
            </nav>

            <div style={{ padding:'14px 20px', borderTop:'1px solid rgba(255,255,255,0.08)', background:'rgba(0,0,0,0.1)' }}>
              {userProfile && (
                <div style={{ marginBottom:'10px' }}>
                  <div style={{ fontSize:'13px', fontWeight:'600', color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userProfile.full_name}</div>
                  <div style={{ fontSize:'11px', color:'rgba(196,176,240,0.6)', marginTop:'1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userProfile.email}</div>
                  {userRole && (
                    <div style={{ fontSize:'10px', marginTop:'4px', padding:'2px 8px', background:'rgba(155,114,245,0.2)', color:'#C4B0F0', borderRadius:'20px', display:'inline-block' }}>
                      {userRole.replace(/_/g,' ')}
                    </div>
                  )}
                </div>
              )}
              <button onClick={signOut}
                style={{ background:'rgba(155,114,245,0.15)', border:'1px solid rgba(155,114,245,0.3)', color:'rgba(255,255,255,0.6)', fontSize:'12px', cursor:'pointer', padding:'6px 12px', borderRadius:'6px', width:'100%', textAlign:'left' }}>
                Sign out
              </button>
            </div>
          </aside>

          <main style={{ marginLeft:'230px', flex:1, minHeight:'100vh', background:'#F3EFFE' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}

function NavLink({ href, label, pathname }: { href: string, label: string, pathname: string | null }) {
  const active = pathname === href
  return (
    <Link href={href} style={{
      display:'flex', alignItems:'center', padding:'9px 20px',
      fontSize:'13px', fontWeight: active ? '600' : '400',
      color: active ? '#fff' : 'rgba(255,255,255,0.6)',
      textDecoration:'none',
      borderLeft: active ? '3px solid #9B72F5' : '3px solid transparent',
      background: active ? 'rgba(155,114,245,0.15)' : 'transparent',
    }}>
      {label}
    </Link>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ padding:'16px 20px 5px', fontSize:'9px', letterSpacing:'1.2px', textTransform:'uppercase', color:'rgba(196,176,240,0.5)', fontWeight:'600' }}>
      {label}
    </div>
  )
}