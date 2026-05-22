'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function signInWithGoogle() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg, #3C2B5A 0%, #4A3F6B 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ background:'#fff', borderRadius:'20px', padding:'40px', width:'100%', maxWidth:'420px', boxShadow:'0 20px 60px rgba(60,43,90,0.3)' }}>
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <div style={{ fontSize:'28px', fontWeight:'700', color:'#3C2B5A', marginBottom:'4px' }}>
            Procure<span style={{ color:'#9B72F5' }}>IQ</span>
          </div>
          <div style={{ fontSize:'12px', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'1.5px' }}>Enterprise</div>
          <p style={{ color:'#6b7280', fontSize:'14px', marginTop:'12px' }}>Sign in to your account</p>
        </div>
        <button onClick={signInWithGoogle} disabled={loading}
          style={{ width:'100%', padding:'12px', border:'2px solid #e5e7eb', borderRadius:'10px', background:'#fff', fontSize:'15px', fontWeight:'500', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', marginBottom:'16px', color:'#374151' }}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
          </svg>
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>
        <div style={{ textAlign:'center', fontSize:'12px', color:'#9ca3af', marginTop:'24px' }}>
          ProcureIQ Enterprise - Secure Login
        </div>
      </div>
    </div>
  )
}