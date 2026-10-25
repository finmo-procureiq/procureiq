import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Default approval matrix rules (same tiers for every entity)
// Under 10k  → L1 only
// 10k–50k    → L1 + L2
// 50k+       → L1 + L2 + L3
// Finance is always the final step (hardcoded in approval flow)
const DEFAULT_RULES = [
  { min_amount: 0,     max_amount: 10000,  required_levels: ['L1'],        escalation_hrs: 48 },
  { min_amount: 10000, max_amount: 50000,  required_levels: ['L1', 'L2'],  escalation_hrs: 48 },
  { min_amount: 50000, max_amount: null,   required_levels: ['L1', 'L2', 'L3'], escalation_hrs: 48 },
]

export async function POST() {
  const supabase = createServiceClient()

  // Get all active companies
  const { data: companies, error: ce } = await supabase
    .from('companies')
    .select('id, name, code')
    .eq('is_active', true)

  if (ce || !companies) {
    return NextResponse.json({ error: ce?.message || 'No companies found' }, { status: 500 })
  }

  const results: Record<string, any> = {}

  for (const company of companies) {
    // Check existing rules
    const { data: existing } = await supabase
      .from('approval_matrix')
      .select('id, min_amount, max_amount')
      .eq('company_id', company.id)
      .eq('is_active', true)

    if (existing && existing.length >= 3) {
      results[company.code] = { status: 'already_seeded', rules: existing.length }
      continue
    }

    // Delete any partial/stale rules first
    await supabase.from('approval_matrix').delete().eq('company_id', company.id)

    // Insert default rules
    const rows = DEFAULT_RULES.map(r => ({
      company_id: company.id,
      min_amount: r.min_amount,
      max_amount: r.max_amount,
      required_levels: r.required_levels,
      escalation_hrs: r.escalation_hrs,
      is_active: true,
    }))

    const { error: ie } = await supabase.from('approval_matrix').insert(rows)
    if (ie) {
      results[company.code] = { status: 'error', error: ie.message }
    } else {
      results[company.code] = { status: 'seeded', rules: rows.length }
    }
  }

  return NextResponse.json({ success: true, results })
}

export async function GET() {
  const supabase = createServiceClient()

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, code')
    .eq('is_active', true)

  if (!companies) return NextResponse.json({ error: 'No companies' }, { status: 500 })

  const status: Record<string, any> = {}
  for (const company of companies) {
    const { data: rules } = await supabase
      .from('approval_matrix')
      .select('min_amount, max_amount, required_levels, is_active')
      .eq('company_id', company.id)
      .order('min_amount')
    status[company.code] = rules || []
  }

  return NextResponse.json(status)
}
