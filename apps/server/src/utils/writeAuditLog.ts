import supabase from './supabase'

function normalizeEntityId(id: string | string[] | null | undefined): string | null {
  if (id == null) return null
  if (Array.isArray(id)) return id[0] ?? null
  return id
}

export async function writeAuditLog(params: {
  actorId: string
  action: string
  entityType: string
  entityId?: string | string[] | null
  details?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: normalizeEntityId(params.entityId),
    details: params.details ?? {},
  })
  if (error) console.warn('[audit_logs]', params.action, error.message)
}
