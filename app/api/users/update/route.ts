import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS, server-side only
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRIMARY_ROLE_ID: Record<string, string> = {
  MAKER:   '3439de3b-d891-4852-9ecb-9c143f4c2516',
  L1:      '36689185-99ec-4d70-8037-5797884e5e78',
  L2:      '097c907d-6e1c-433f-ab45-16d9be64a1ad',
  L3:      'ca9a3015-bd1a-44df-aaa1-bf822f6261a5',
  FINANCE: '0fafb943-5a6e-468f-a6da-0fded964c173',
  ADMIN:   'd4ca2a99-039e-4976-b7d1-a42ef2894477',
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, roles, department, manages_department } = await req.json()

    if (!user_id || !roles?.length) {
      return NextResponse.json({ error: 'user_id and roles are required' }, { status: 400 })
    }

    // Update company_members (bypasses RLS via service role)
    const { data, error } = await supabaseAdmin
      .from('company_members')
      .update({
        roles,
        role_id: PRIMARY_ROLE_ID[roles[0]] || PRIMARY_ROLE_ID.MAKER,
        department: department || null,
        manages_department: manages_department === true,
      })
      .eq('user_id', user_id)
      .eq('is_active', true)
      .select()

    if (error) throw error

    // Also update user_profiles department if provided
    if (department) {
      await supabaseAdmin
        .from('user_profiles')
        .update({ department })
        .eq('id', user_id)
    }

    return NextResponse.json({ success: true, updated: data?.length ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
