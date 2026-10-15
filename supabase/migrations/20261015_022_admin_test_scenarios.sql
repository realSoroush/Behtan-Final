-- Isolated test personas. These rows never become auth users, profiles, orders or subscriptions.
create table if not exists public.admin_test_scenarios (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 80),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) < 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_test_scenarios_owner_date on public.admin_test_scenarios(created_by, updated_at desc);
alter table public.admin_test_scenarios enable row level security;
revoke all on public.admin_test_scenarios from public, anon;
grant select, insert, update, delete on public.admin_test_scenarios to authenticated;
create policy admin_test_scenarios_owner on public.admin_test_scenarios
  for all to authenticated
  using (created_by = auth.uid() and public.admin_allowed())
  with check (created_by = auth.uid() and public.admin_allowed());
