-- Table tennis roster UI omits position picker when positions is empty (see organizer Athletes roster modal).
UPDATE sports_config
SET positions = '[]'::jsonb
WHERE slug = 'table-tennis';
