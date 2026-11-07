begin;
-- Stage 2 ONLY after 051 + compatible member API/UI are deployed and verified.
revoke execute on function public.save_member_meal_schedule(date,text,jsonb,boolean),
  public.save_member_meal_schedule_v2(date,text,jsonb,boolean),
  public.save_member_meal_schedule_v3(date,text,jsonb,jsonb,boolean,boolean)
  from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on
  public.daily_meal_checkins,public.member_skipped_meals,public.member_extra_foods,public.member_meal_schedule
  from public,anon,authenticated;
-- A table-level REVOKE does not remove independent column-level grants.
do $$
declare t text; cols text;
begin
  foreach t in array array['daily_meal_checkins','member_skipped_meals','member_extra_foods','member_meal_schedule'] loop
    select string_agg(quote_ident(attname),',') into cols from pg_attribute
      where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke insert (%s),update (%s),references (%s) on public.%I from public,anon,authenticated',cols,cols,cols,t);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
