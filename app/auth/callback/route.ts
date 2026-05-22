// app/auth/callback/route.ts
// Handles Google OAuth callback from Supabase
import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code     = searchParams.get('code')
  const next     = searchParams.get('next') ?? '/dashboard'
  const errorParam = searchParams.get('error')

  if (errorParam) {
    return NextResponse.redirect(`${origin}/auth/error?message=${errorParam}`)
  }

  if (code) {
    const supabase = createServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Update last login info
      await supabase.from('user_profiles').update({
        last_login_at: new Date().toISOString(),
        avatar_url: data.user.user_metadata?.avatar_url,
      }).eq('id', data.user.id)

      // Check if user has any company membership
      const { data: memberships } = await supabase
        .from('company_members')
        .select('id')
        .eq('user_id', data.user.id)
        .eq('is_active', true)
        .limit(1)

      // New user with no company — redirect to a "pending access" page
      if (!memberships?.length) {
        return NextResponse.redirect(`${origin}/auth/pending`)
      }

      // Audit the login
      await supabase.from('audit_log').insert({
        user_id:    data.user.id,
        user_name:  data.user.user_metadata?.full_name || data.user.email,
        user_email: data.user.email!,
        action:     'LOGIN',
        entity_type: 'session',
        severity:   'info',
        new_values: { provider: 'google', email: data.user.email },
      })

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error?message=Could not authenticate`)
}
