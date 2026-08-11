-- Supports the Audit Logs screen's new action/entity-type filters and free-text
-- search (GET /api/admin/audit) — previously the only index was (actor_id, created_at).
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

NOTIFY pgrst, 'reload schema';
