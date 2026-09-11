-- athletes.year_level has three spellings in circulation:
--
--   '1st Year' .. '4th Year'   college rows from the seed and older imports
--   '1st' .. '4th', '11', '12' short codes written since the department rule
--                              (Grade 11-12 / 1st-4th) landed -- which every
--                              screen then printed raw, including the mobile app
--   '1st Year' / '2nd Year'    SHS rows under the old convention for Grade 11 /
--                              12 (seed + fixShsYearLevels.ts). The current rule
--                              rejects these, so editing ANY such athlete -- even
--                              just their name -- failed until the level was
--                              re-picked.
--
-- The canonical form is the text people read ('2nd Year', 'Grade 11'); see
-- apps/server/src/utils/yearLevel.ts. Values that cannot be mapped are left
-- exactly as they are -- the Edit form flags them rather than guessing.
-- Idempotent: every canonical value maps to itself.
UPDATE public.athletes
SET year_level = CASE
  WHEN department = 'SHS' THEN
    CASE substring(year_level FROM '[0-9]+')
      WHEN '11' THEN 'Grade 11'
      WHEN '12' THEN 'Grade 12'
      WHEN '1'  THEN 'Grade 11'  -- old SHS convention: "1st Year" = Grade 11
      WHEN '2'  THEN 'Grade 12'  -- old SHS convention: "2nd Year" = Grade 12
      ELSE year_level
    END
  ELSE
    CASE substring(year_level FROM '[0-9]+')
      WHEN '1' THEN '1st Year'
      WHEN '2' THEN '2nd Year'
      WHEN '3' THEN '3rd Year'
      WHEN '4' THEN '4th Year'
      ELSE year_level
    END
END
WHERE year_level ~ '[0-9]';
