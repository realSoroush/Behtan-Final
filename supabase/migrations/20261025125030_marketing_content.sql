begin;
-- Presentation content only: no changes to pricing, checkout, sessions or health data.
create table public.marketing_settings (
 id boolean primary key default true check(id),
 video_url text not null default '' check(length(video_url)<=2048 and (video_url='' or video_url ~ '^https://[^[:space:]]+$')),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
insert into public.marketing_settings(id) values(true);
create table public.marketing_testimonials (
 id uuid primary key default gen_random_uuid(),
 author_name text not null check(length(btrim(author_name)) between 1 and 100),
 author_role text not null default '' check(length(author_role)<=150),
 quote text not null check(length(btrim(quote)) between 1 and 2000),
 is_published boolean not null default false,
 consent_confirmed boolean not null default false,
 sort_order integer not null default 0 check(sort_order between 0 and 10000),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 check(not is_published or consent_confirmed)
);
create table public.marketing_content_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id),
 table_name text not null,
 row_id text not null,
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);
alter table public.marketing_settings enable row level security;
alter table public.marketing_testimonials enable row level security;
alter table public.marketing_content_audit enable row level security;
revoke all on public.marketing_settings,public.marketing_testimonials,public.marketing_content_audit from public,anon,authenticated;
grant select on public.marketing_settings,public.marketing_testimonials to anon,authenticated;
grant update on public.marketing_settings to authenticated;
grant insert,update on public.marketing_testimonials to authenticated;
grant select on public.marketing_content_audit to authenticated;
create policy marketing_settings_read on public.marketing_settings for select to anon,authenticated using(true);
create policy marketing_settings_admin on public.marketing_settings for update to authenticated
 using((select public.admin_allowed())) with check((select public.admin_allowed()));
create policy marketing_reviews_read on public.marketing_testimonials for select to anon,authenticated
 using(is_published and consent_confirmed);
create policy marketing_reviews_admin_read on public.marketing_testimonials for select to authenticated
 using((select public.admin_allowed()));
create policy marketing_reviews_admin_insert on public.marketing_testimonials for insert to authenticated
 with check((select public.admin_allowed()));
create policy marketing_reviews_admin_update on public.marketing_testimonials for update to authenticated
 using((select public.admin_allowed())) with check((select public.admin_allowed()));
create policy marketing_audit_admin_read on public.marketing_content_audit for select to authenticated
 using((select public.admin_allowed()));
create function public.marketing_content_revision() returns trigger language plpgsql set search_path='' as $$
begin
 new.revision:=old.revision+1;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function public.marketing_content_revision() from public,anon,authenticated;
create trigger marketing_settings_revision before update on public.marketing_settings for each row execute function public.marketing_content_revision();
create trigger marketing_reviews_revision before update on public.marketing_testimonials for each row execute function public.marketing_content_revision();
-- Trigger-only privileged audit insertion. Not callable as a public RPC.
create function public.marketing_content_audit_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.marketing_content_audit(actor_id,table_name,row_id,before_data,after_data)
 values(auth.uid(),tg_table_name,new.id::text,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function public.marketing_content_audit_trigger() from public,anon,authenticated;
create trigger marketing_settings_audit after update on public.marketing_settings for each row execute function public.marketing_content_audit_trigger();
create trigger marketing_reviews_audit after insert or update on public.marketing_testimonials for each row execute function public.marketing_content_audit_trigger();
-- Realtime invalidation contains only public revision counters, never price rows or drafts.
create table public.marketing_revisions (
 key text primary key check(key in ('catalog','content')),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
insert into public.marketing_revisions(key) values('catalog'),('content');
alter table public.marketing_revisions enable row level security;
revoke all on public.marketing_revisions from public,anon,authenticated;
grant select on public.marketing_revisions to anon,authenticated;
create policy marketing_revisions_read on public.marketing_revisions for select to anon,authenticated using(true);
create function public.marketing_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.marketing_revisions set revision=revision+1,updated_at=now() where key=tg_argv[0];
 return null;
end $$;
revoke all on function public.marketing_invalidate() from public,anon,authenticated;
create trigger marketing_pro_prices_changed after insert or update or delete on public.pro_offers for each statement execute function public.marketing_invalidate('catalog');
create trigger marketing_member_prices_changed after insert or update or delete on public.subscription_plans for each statement execute function public.marketing_invalidate('catalog');
create trigger marketing_video_changed after update on public.marketing_settings for each statement execute function public.marketing_invalidate('content');
create trigger marketing_reviews_changed after insert or update on public.marketing_testimonials for each statement execute function public.marketing_invalidate('content');
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
 select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='marketing_revisions') then
 alter publication supabase_realtime add table public.marketing_revisions;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
