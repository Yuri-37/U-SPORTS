-- Reload PostgREST schema cache so new/changed columns are visible to the API client.
-- Run if you see: "Could not find the 'participant_id' column ... in the schema cache"
-- while the columns already exist in PostgreSQL.
SELECT pg_notify('pgrst', 'reload schema');
