-- BlinkJob — 019: M8 (recensioni bilaterali e metriche di affidabilità).
-- Real gap found by inspection this time (not by trial and error): `reviews_insert` (006) only
-- checks `author_id = auth.uid()` — it never verifies the author actually participated in that
-- assignment, that the assignment is completed, or that `recipient_id` is the correct other
-- party. As written, any authenticated user could POST a 5-star (or 1-star) review against any
-- assignment for any recipient, manipulating anyone's reputation. Tightened below.
--
-- MVP simplifications (documented, not hidden): reviews publish immediately on submission (no
-- double-blind/simultaneous-reveal window — the PRD's fuller anti-retaliation design is deferred
-- past this MVP); worker reliability_score is the simple average of "overall" ratings received
-- from published reviews (no-show/cancellation weighting is deferred — that needs scheduled
-- no-show detection, which doesn't exist in this MVP).

drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from assignments a
      join jobs j on j.id = a.job_id
      where a.id = assignment_id
        and a.status = 'completed'
        and (
          (a.worker_id = auth.uid() and recipient_id = j.created_by)
          or (is_company_member(j.company_id) and recipient_id = a.worker_id)
        )
    )
  );

create or replace function public.recompute_worker_reliability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from worker_profiles where user_id = new.recipient_id) then
    update worker_profiles
    set reliability_score = coalesce((
      select round(avg((rating_dimensions->>'overall')::numeric), 1)
      from reviews
      where recipient_id = new.recipient_id and moderation_status = 'published'
    ), 0)
    where user_id = new.recipient_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recompute_worker_reliability on reviews;
create trigger trg_recompute_worker_reliability
  after insert on reviews
  for each row execute function recompute_worker_reliability();
