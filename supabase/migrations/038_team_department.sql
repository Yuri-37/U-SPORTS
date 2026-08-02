-- Add department to teams so teams can be associated with a school department
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS department public.department;
