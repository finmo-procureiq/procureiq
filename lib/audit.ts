import { createClient } from '@/lib/supabase/browser'

export async function logAction(params: {
  company_id: string
  user_id: string
  user_name: string
  user_email: string
  action: string
  entity_type: string
  entity_id?: string
  entity_ref?: string
  old_values?: object
  new_values?: object
  severity?: string
}) {
  const supabase = createClient()
  await supabase.from('audit_log').insert({
    company_id:  params.company_id,
    user_id:     params.user_id,
    user_name:   params.user_name,
    user_email:  params.user_email,
    action:      params.action,
    entity_type: params.entity_type,
    entity_id:   params.entity_id,
    entity_ref:  params.entity_ref,
    old_values:  params.old_values,
    new_values:  params.new_values,
    severity:    params.severity || 'info',
  })
}