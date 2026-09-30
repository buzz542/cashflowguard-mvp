-- Round 3: project tracking.
--   * Users add their own dated items to a project (no contract check needed).
--   * Items can be marked done. Monthly items record the cycle that was done instead.
--   * "Payment due" kind for manual items.
--   * Reminders at 7 days, 2 days, on the day, and once when overdue.
-- Additive only: no rows are changed or removed; constraints are only widened.

alter table public.obligations alter column review_id drop not null;
alter table public.obligations
  add column source text not null default 'contract' check (source in ('contract', 'manual')),
  add column completed_at timestamptz,
  -- Monthly items: the latest due date the user marked done. The next one is after it.
  add column done_through date,
  add constraint obligation_needs_review_or_job check (review_id is not null or job_id is not null);

alter table public.obligations drop constraint obligations_status_check;
alter table public.obligations add constraint obligations_status_check
  check (status in ('suggested', 'confirmed', 'dismissed', 'done'));

alter table public.obligations drop constraint obligations_kind_check;
alter table public.obligations add constraint obligations_kind_check
  check (kind in ('payment_application', 'payment_notice', 'pay_less_notice', 'variation_notice', 'eot_notice',
    'retention_release', 'final_account', 'payment_due', 'other'));

-- 'lead' (2 working days before) stays valid for rows created before this migration.
alter table public.reminders drop constraint reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check
  check (kind in ('lead', 'lead7', 'lead2', 'due', 'overdue'));

-- Same as 0002, except an 'overdue' reminder is sent after the due date has passed.
create or replace function public.claim_due_reminders(p_today date, p_limit integer)
returns table (
  reminder_id uuid,
  user_id uuid,
  email text,
  reminder_kind text,
  obligation_id uuid,
  obligation_kind text,
  title text,
  clause_ref text,
  due_date date,
  due_basis text,
  job_id uuid,
  job_name text,
  workspace_id uuid
)
language plpgsql security definer
set search_path = public
as $$
begin
  -- Anything due that no longer applies: not being tracked (incl. done), undated, past (except
  -- the overdue notice), or opted out.
  update public.reminders r
     set status = 'skipped'
    from public.obligations o, public.profiles p
   where r.obligation_id = o.id
     and p.id = r.user_id
     and r.status = 'pending'
     and r.send_on <= p_today
     and (o.status <> 'confirmed' or o.due_date is null
          or (o.due_date < p_today and r.kind <> 'overdue') or not p.reminder_emails);

  -- Sends that failed or died mid-run and can no longer usefully be retried.
  update public.reminders r
     set status = 'failed'
    from public.obligations o
   where r.obligation_id = o.id
     and r.status = 'sending'
     and r.claimed_at < now() - interval '30 minutes'
     and (r.attempts >= 3 or o.status <> 'confirmed' or o.due_date is null
          or (o.due_date < p_today and r.kind <> 'overdue'));

  return query
  with claimable as (
    select r.id
      from public.reminders r
      join public.obligations o on o.id = r.obligation_id
     where o.status = 'confirmed'
       and o.due_date is not null
       and (o.due_date >= p_today or r.kind = 'overdue')
       and (
         (r.status = 'pending' and r.send_on <= p_today)
         -- A send that failed or died mid-run: retry after 30 minutes, at most 3 attempts.
         or (r.status = 'sending' and r.claimed_at < now() - interval '30 minutes' and r.attempts < 3)
       )
     order by r.send_on
     limit p_limit
     for update of r skip locked
  ),
  claimed as (
    update public.reminders r
       set status = 'sending', claimed_at = now(), attempts = r.attempts + 1
      from claimable c
     where r.id = c.id
    returning r.id, r.user_id, r.kind, r.obligation_id
  )
  select c.id, c.user_id, p.email, c.kind, o.id, o.kind, o.title, o.clause_ref, o.due_date, o.due_basis,
         j.id, j.name, o.workspace_id
    from claimed c
    join public.obligations o on o.id = c.obligation_id
    join public.profiles p on p.id = c.user_id
    left join public.jobs j on j.id = o.job_id;
end;
$$;

revoke all on function public.claim_due_reminders(date, integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(date, integer) to service_role;
