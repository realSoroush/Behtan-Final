begin;

-- Acknowledgements are immutable and idempotent for each account and review.
create table public.member_weekly_review_acknowledgements (
  user_id uuid not null references auth.users(id) on delete cascade,
  review_key text not null check (review_key ~ '^[0-9a-f]{8}$'),
  primary key (user_id, review_key)
);

alter table public.member_weekly_review_acknowledgements enable row level security;
revoke all on public.member_weekly_review_acknowledgements from public, anon, authenticated;
grant select, insert on public.member_weekly_review_acknowledgements to authenticated;

create policy weekly_review_acknowledgements_read_own
on public.member_weekly_review_acknowledgements for select to authenticated
using (user_id = (select auth.uid()));

create policy weekly_review_acknowledgements_insert_own
on public.member_weekly_review_acknowledgements for insert to authenticated
with check (user_id = (select auth.uid()));

-- Retain the existing privileges, rate limit and scalar-only event payload.
create or replace function public.record_product_event(p_id uuid,p_session uuid,p_event text,p_step integer default null,p_source text default 'app') returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,39));
 if p_event not in('app_open','onboarding_step','onboarding_complete','paywall_view','preflight_ok','preflight_failed','checkout_started','meal_recorded','meal_undone','meal_skipped','meal_changed','meal_change_unavailable','meal_change_save_failed','food_manual','food_scan','progress_saved','training_view','training_generated','pro_signup') or p_source not in('app','landing','pro') or(p_step is not null and p_step not between 1 and 11) or p_session is null then raise exception 'INVALID_EVENT';end if;
 if (select count(*) from public.product_events where user_id=auth.uid() and created_at>now()-interval '1 minute')>=60 then return;end if;
 insert into public.product_events values(p_id,auth.uid(),p_session,p_event,p_step,p_source,now()) on conflict(id) do nothing;end$$;

notify pgrst, 'reload schema';

commit;
