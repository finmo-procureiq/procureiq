// app/auth/login/page.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Chrome, Lock, Mail, Shield, Users, Building2, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [tab, setTab]         = useState<'sso' | 'password'>('sso')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const router    = useRouter()
  const params    = useSearchParams()
  const next      = params.get('next') || '/dashboard'
  const supabase  = createClient()

  async function handleGoogleSSO() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
          hd: '',  // set to your domain e.g. 'acmecorp.com' to restrict to G Workspace
        },
      },
    })
    if (error) { toast.error(error.message); setLoading(false) }
    // Redirect happens automatically via OAuth flow
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { toast.error(error.message); return }
    router.push(next)
    router.refresh()
  }

  async function handleMagicLink() {
    if (!email) { toast.error('Enter your email first'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` }
    })
    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success('Check your inbox — magic link sent!')
  }

  return (
    <div className="min-h-screen flex bg-stone-50">
      {/* Left — branding */}
      <div className="hidden lg:flex w-5/12 bg-stone-900 flex-col p-12 text-white relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative z-10 flex-1 flex flex-col">
          <div>
            <div className="text-2xl font-semibold tracking-tight">
              Procure<span className="text-sky-400">IQ</span>
              <span className="ml-2 text-[10px] font-mono bg-sky-400/20 text-sky-400 px-2 py-0.5 rounded tracking-wide">ENTERPRISE</span>
            </div>
            <div className="text-stone-400 text-xs uppercase tracking-widest mt-1">
              AI-Powered Procurement Suite
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <h2 className="text-3xl font-semibold leading-snug mb-3">
              Enterprise procurement.<br />Built for scale.
            </h2>
            <p className="text-stone-400 text-sm mb-10 leading-relaxed">
              Multi-entity management with maker-checker controls, role-based access, and complete audit trail.
            </p>

            <div className="space-y-5">
              {[
                { icon: Building2, title: 'Multi-entity', desc: 'Manage India, Singapore, UAE from one login' },
                { icon: Shield,    title: 'Maker-Checker', desc: 'Full conflict-of-interest enforcement at database level' },
                { icon: Users,     title: '50+ Users', desc: 'Role-based access with per-user spend limits' },
                { icon: Lock,      title: 'Audit-Grade', desc: 'Tamper-proof log of every action, exportable' },
              ].map(f => (
                <div key={f.title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-400/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <f.icon size={15} className="text-sky-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{f.title}</div>
                    <div className="text-stone-400 text-xs mt-0.5">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-stone-500 text-xs">
            © 2025 ProcureIQ Enterprise · All rights reserved
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <div className="text-xl font-semibold">Procure<span className="text-blue-600">IQ</span></div>
            <div className="text-xs text-stone-500 uppercase tracking-widest">Enterprise</div>
          </div>

          <h1 className="text-2xl font-semibold mb-1">Sign in</h1>
          <p className="text-stone-500 text-sm mb-7">
            Access your procurement workspace
          </p>

          {/* Tab switcher */}
          <div className="flex bg-stone-100 p-1 rounded-lg mb-6 gap-1">
            <button
              onClick={() => setTab('sso')}
              className={`flex-1 text-sm py-1.5 rounded-md font-medium transition ${tab === 'sso' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
              Google SSO
            </button>
            <button
              onClick={() => setTab('password')}
              className={`flex-1 text-sm py-1.5 rounded-md font-medium transition ${tab === 'password' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
              Password
            </button>
          </div>

          {/* Google SSO */}
          {tab === 'sso' && (
            <div>
              <button
                onClick={handleGoogleSSO}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-60 text-stone-700 font-medium py-3 rounded-xl text-sm transition shadow-sm">
                {loading ? (
                  <span className="w-4 h-4 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                )}
                Continue with Google
              </button>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                <strong>Recommended for teams.</strong> Sign in with your company Google Workspace account. Access is controlled by your administrator.
              </div>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-stone-200" />
                <span className="text-xs text-stone-400">or use magic link</span>
                <div className="flex-1 h-px bg-stone-200" />
              </div>

              <div className="flex gap-2">
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@company.com"
                  className="flex-1 px-3 py-2.5 border border-stone-300 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                />
                <button onClick={handleMagicLink} disabled={loading}
                  className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-sm rounded-lg transition disabled:opacity-50 font-medium">
                  Send link
                </button>
              </div>
            </div>
          )}

          {/* Password */}
          {tab === 'password' && (
            <form onSubmit={handlePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input type={showPw ? 'text' : 'password'} required value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 border border-stone-300 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2">
                {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</> : 'Sign in'}
              </button>
            </form>
          )}

          <p className="text-center text-xs text-stone-400 mt-8">
            Don't have access? Contact your system administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
