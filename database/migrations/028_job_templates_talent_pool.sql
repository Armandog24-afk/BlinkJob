-- BlinkJob — 028: M18 (template incarichi + talent pool/preferiti — PRD sez. 21.2 "should have").
-- Due funzionalità indipendenti, stesso schema di riferimento di `jobs`/`job_requirements` (003)
-- per coerenza — un template è "gli stessi campi di un incarico, meno luogo/orari/scadenza",
-- il talent pool è un elenco aziendale di lavoratori con cui si è già lavorato davvero.

create table if not exists job_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid not null references users(id),
  title text not null,
  category text not null,
  description text not null,
  positions_count int not null check (positions_count > 0),
  pay_amount_cents int not null check (pay_amount_cents >= 0),
  pay_currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

create table if not exists job_template_requirements (
  template_id uuid not null references job_templates(id) on delete cascade,
  skill_id uuid not null references skill_taxonomy(id) on delete restrict,
  mandatory boolean not null default false,
  primary key (template_id, skill_id)
);

alter table job_templates enable row level security;
alter table job_template_requirements enable row level security;

-- Stesso schema di company_locations_manage (006): solo i membri della propria azienda.
drop policy if exists job_templates_manage on job_templates;
create policy job_templates_manage on job_templates for all
  using (is_company_member(company_id)) with check (is_company_member(company_id));

drop policy if exists job_template_requirements_manage on job_template_requirements;
create policy job_template_requirements_manage on job_template_requirements for all
  using (exists (select 1 from job_templates t where t.id = template_id and is_company_member(t.company_id)));

-- Talent pool: solo lavoratori con cui l'azienda ha già completato almeno un incarico — non un
-- elenco/directory libera di tutti i lavoratori (stesso principio di privacy-by-design già
-- applicato a worker_badges_company_read_via_candidate, 026, solo più stringente: qui serve un
-- rapporto di lavoro reale già concluso, non solo idoneità geografica).
create table if not exists company_worker_favorites (
  company_id uuid not null references companies(id) on delete cascade,
  worker_id uuid not null references worker_profiles(user_id) on delete cascade,
  added_by uuid not null references users(id),
  note text,
  created_at timestamptz not null default now(),
  primary key (company_id, worker_id)
);

alter table company_worker_favorites enable row level security;

drop policy if exists company_worker_favorites_read on company_worker_favorites;
create policy company_worker_favorites_read on company_worker_favorites for select
  using (is_company_member(company_id));

create or replace function public.add_worker_to_talent_pool(p_worker_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from company_members
  where user_id = auth.uid()
  limit 1;

  if v_company_id is null then
    raise exception 'Devi far parte di un''azienda';
  end if;

  if not exists (
    select 1
    from assignments a
    join jobs j on j.id = a.job_id
    where a.worker_id = p_worker_id and j.company_id = v_company_id and a.status = 'completed'
  ) then
    raise exception 'Puoi aggiungere al talent pool solo lavoratori con cui hai già completato un incarico';
  end if;

  insert into company_worker_favorites (company_id, worker_id, added_by, note)
  values (v_company_id, p_worker_id, auth.uid(), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (company_id, worker_id) do update set note = excluded.note;
end;
$$;

create or replace function public.remove_worker_from_talent_pool(p_worker_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from company_members
  where user_id = auth.uid()
  limit 1;

  if v_company_id is null then
    raise exception 'Devi far parte di un''azienda';
  end if;

  delete from company_worker_favorites
  where company_id = v_company_id and worker_id = p_worker_id;
end;
$$;

revoke all on function public.add_worker_to_talent_pool(uuid, text) from public;
revoke all on function public.remove_worker_from_talent_pool(uuid) from public;
grant execute on function public.add_worker_to_talent_pool(uuid, text) to authenticated;
grant execute on function public.remove_worker_from_talent_pool(uuid) to authenticated;
