begin;
-- Append-only for application roles. Not a signed clinical record: origin is
-- browser-reported, but edits no longer erase the previous report.
create table public.daily_plan_revisions (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  revision bigint not null,
  snapshot jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key(user_id,plan_date,revision)
);
alter table public.daily_plan_revisions enable row level security;
revoke all on public.daily_plan_revisions from public,anon,authenticated;
create function public.archive_plan_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
   insert into public.daily_plan_revisions(user_id,plan_date,revision,snapshot,recorded_at)
   values(old.user_id,old.plan_date,old.revision,old.snapshot,old.updated_at) on conflict do nothing;
 end if;
 insert into public.daily_plan_revisions(user_id,plan_date,revision,snapshot,recorded_at)
 values(new.user_id,new.plan_date,new.revision,new.snapshot,new.updated_at) on conflict do nothing;
 return new;
end $$;
revoke all on function public.archive_plan_revision() from public,anon,authenticated;
create trigger archive_daily_plan after insert or update on public.daily_plan_snapshots
for each row execute function public.archive_plan_revision();

create function public.admin_progress(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(t) order by entry_date desc),'[]'::jsonb)
   from (select entry_date,weight_kg,adherence,hunger,difficulty,updated_at
     from public.user_progress_entries where user_id=p_user order by entry_date desc limit 90) t);
end $$;
revoke all on function public.admin_progress(uuid) from public,anon;
grant execute on function public.admin_progress(uuid) to authenticated;
commit;
