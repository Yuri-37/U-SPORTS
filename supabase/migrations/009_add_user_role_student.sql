-- Must run in its own migration: PostgreSQL does not allow using a new enum label
-- in the same transaction as ALTER TYPE ... ADD VALUE (55P04).
-- IF NOT EXISTS requires PostgreSQL 15+ (Supabase default).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'student';
