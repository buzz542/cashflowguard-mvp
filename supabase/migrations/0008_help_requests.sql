-- Round 3: "Need help getting paid?" requests.
-- Saved for the owner to follow up by hand. Nothing is shared with a third party
-- automatically; `consent` records the user's agreement that it may be.

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  obligation_id uuid references public.obligations (id) on delete set null,
  review_id uuid references public.reviews (id) on delete set null,
  amount_pence bigint not null check (amount_pence > 0 and amount_pence <= 100000000000),
  debtor text not null check (char_length(debtor) between 1 and 200),
  days_overdue integer not null check (days_overdue between 0 and 3650),
  pay_less_notice text not null check (pay_less_notice in ('yes', 'no', 'unsure')),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_email text not null check (char_length(contact_email) between 3 and 254),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  notes text check (notes is null or char_length(notes) <= 2000),
  consent boolean not null check (consent),
  consent_text text not null,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index help_requests_user_idx on public.help_requests (user_id, created_at desc);

alter table public.help_requests enable row level security;
revoke all on public.help_requests from anon, authenticated;
grant select on public.help_requests to authenticated;
grant select, insert, update, delete on public.help_requests to service_role;

-- People can see what they sent. Writes go through /api/help only.
create policy help_requests_select_own on public.help_requests
  for select to authenticated using (user_id = auth.uid());
