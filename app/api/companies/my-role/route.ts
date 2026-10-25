import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ role: '' })

    const service = createServiceClient()
    const { data } = await service
      .from('company_members')
      .select('role:roles(code)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .single()

    const role = (data as any)?.role?.code || ''
    return NextResponse.json({ role })
  } catch {
    return NextResponse.json({ role: '' })
  }
}
