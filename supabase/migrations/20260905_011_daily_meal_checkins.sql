begin;
create table if not exists public.daily_meal_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack')),
  template_id text not null,
  meal_snapshot jsonb not null,
  consumed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date, meal_slot),
  constraint daily_meal_checkins_snapshot_object_check check (jsonb_typeof(meal_snapshot) = 'object')
);
create index if not exists idx_daily_meal_checkins_user_date on public.daily_meal_checkins (user_id, plan_date);
alter table public.daily_meal_checkins enable row level security;
drop policy if exists "Users can view their own meal checkins" on public.daily_meal_checkins;
drop policy if exists "Users can insert their own meal checkins" on public.daily_meal_checkins;
drop policy if exists "Users can update their own meal checkins" on public.daily_meal_checkins;
drop policy if exists "Users can delete their own meal checkins" on public.daily_meal_checkins;
create policy "Users can view their own meal checkins" on public.daily_meal_checkins for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own meal checkins" on public.daily_meal_checkins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own meal checkins" on public.daily_meal_checkins for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own meal checkins" on public.daily_meal_checkins for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.daily_meal_checkins from anon;
grant select, insert, update, delete on public.daily_meal_checkins to authenticated;
drop trigger if exists trg_daily_meal_checkins_updated_at on public.daily_meal_checkins;
create trigger trg_daily_meal_checkins_updated_at before update on public.daily_meal_checkins for each row execute function public.set_updated_at();
commit;
