import { createClient } from '@/lib/supabase/browser'

export async function getActiveCompanyId(): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ''
  const savedId = localStorage.getItem('activeCompanyId')
  const { data: memberships } = await supabase
    .from('company_members').select('company_id')
    .eq('user_id', user.id).eq('is_active', true)
  if (!memberships?.length) return ''
  const ids = memberships.map((m: any) => m.company_id)
  return (savedId && ids.includes(savedId)) ? savedId : ids[0]
}