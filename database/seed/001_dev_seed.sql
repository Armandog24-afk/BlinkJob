-- BlinkJob — Dev seed data (non-sensitive, fictional). Do NOT use in production.
-- Assumes corresponding auth.users rows already exist (create via Supabase Auth first,
-- then insert matching rows here with the same ids).

insert into skill_taxonomy (id, name, category) values
  ('00000000-0000-0000-0000-000000000101', 'Movimentazione merci', 'logistica'),
  ('00000000-0000-0000-0000-000000000102', 'Allestimento espositori', 'retail'),
  ('00000000-0000-0000-0000-000000000103', 'Cassa', 'retail'),
  ('00000000-0000-0000-0000-000000000104', 'Servizio di sala', 'hospitality'),
  ('00000000-0000-0000-0000-000000000105', 'Carrello elevatore (patentino)', 'logistica')
on conflict (id) do nothing;

-- NOTE: user rows below use placeholder uuids and must match real auth.users ids
-- when seeding a live Supabase project. Provided here to document expected shape only.
comment on table skill_taxonomy is 'Seed skills for dev/demo matching scenarios.';
