// lib/actions/shared.ts
// Shared utilities used by all server actions

type AuditParams = {
  company_id: string
  user: { id: string; name: string; email: string; role?: string }
  action: string
  entity_type: string
  entity_id?: string
  entity_ref?: string
  old_values?: object
  new_values?: object
  budget_status?: object
  severity?: 'info' | 'warning' | 'critical'
}

export async function writeAudit(supabase: any, params: AuditParams) {
  const diff = params.old_values && params.new_values
    ? computeDiff(params.old_values, params.new_values)
    : undefined

  await supabase.from('audit_log').insert({
    company_id:   params.company_id,
    user_id:      params.user.id,
    user_name:    params.user.name,
    user_email:   params.user.email,
    user_role:    params.user.role,
    action:       params.action,
    entity_type:  params.entity_type,
    entity_id:    params.entity_id,
    entity_ref:   params.entity_ref,
    old_values:   params.old_values,
    new_values:   params.new_values,
    diff,
    severity:     params.severity || 'info',
  })
}

export async function createNotification(supabase: any, params: {
  company_id: string
  user_id: string
  title: string
  body?: string
  type: 'info' | 'warning' | 'error' | 'success'
  action_url?: string
  action_label?: string
  entity_type?: string
  entity_id?: string
}) {
  await supabase.from('notifications').insert(params)
}

export async function queueEmail(supabase: any, params: {
  company_id: string
  to_email: string
  to_name?: string
  template: string
  subject: string
  variables: Record<string, string>
}) {
  await supabase.from('email_queue').insert({
    ...params,
    status: 'pending',
  })
}

function computeDiff(oldObj: object, newObj: object): object {
  const diff: Record<string, { from: unknown; to: unknown }> = {}
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  for (const key of allKeys) {
    const o = (oldObj as any)[key]
    const n = (newObj as any)[key]
    if (JSON.stringify(o) !== JSON.stringify(n)) {
      diff[key] = { from: o, to: n }
    }
  }
  return diff
}
