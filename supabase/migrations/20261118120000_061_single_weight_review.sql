-- A single measurement can preview a reference update; no sampling or feedback gate.
create or replace function public.member_weight_review_state(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('today',(statement_timestamp() at time zone 'Asia/Tehran')::date,
 'profile',to_jsonb(p),'entries',coalesce((select jsonb_agg(jsonb_build_object('entry_date',e.entry_date,
 'weight_kg',e.weight_kg,'adherence',e.adherence,'hunger',e.hunger,'difficulty',e.difficulty) order by e.entry_date)
 from (select * from public.user_progress_entries where user_id=p_user and weight_kg is not null
 and entry_date <= (statement_timestamp() at time zone 'Asia/Tehran')::date
 order by entry_date desc limit 1) e),'[]'::jsonb))
 from public.user_profiles p where p.id=p_user and p.onboarding_completed;
$$;

