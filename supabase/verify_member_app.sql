-- Read-only checks after migrations 032 and 033. Every passed value must be true.
select '032 schedule table' as check_name,
 to_regclass('public.member_meal_schedule') is not null as passed
union all select '033 scan usage table',to_regclass('public.member_food_scan_usage') is not null
union all select '032 schedule RPC',to_regprocedure('public.save_member_meal_schedule(date,text,jsonb,boolean)') is not null
union all select '032 activity RPC',to_regprocedure('public.member_meal_activity(date,date)') is not null
union all select '033 scan quota RPC',to_regprocedure('public.reserve_food_scan()') is not null
union all select 'schedule RLS',coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='member_meal_schedule'),false)
union all select 'scan usage RLS',coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='member_food_scan_usage'),false);

-- Run this second query after the first reports true for all five objects.
select 'authenticated can save schedule' as check_name,
 has_function_privilege('authenticated','public.save_member_meal_schedule(date,text,jsonb,boolean)','EXECUTE') as passed
union all select 'anonymous cannot save schedule',not has_function_privilege('anon','public.save_member_meal_schedule(date,text,jsonb,boolean)','EXECUTE')
union all select 'anonymous cannot read activity',not has_function_privilege('anon','public.member_meal_activity(date,date)','EXECUTE')
union all select 'anonymous cannot reserve scan',not has_function_privilege('anon','public.reserve_food_scan()','EXECUTE')
union all select 'authenticated can read own schedule',has_table_privilege('authenticated','public.member_meal_schedule','SELECT')
union all select 'authenticated cannot insert schedule directly',not has_table_privilege('authenticated','public.member_meal_schedule','INSERT')
union all select 'authenticated cannot read scan usage directly',not has_table_privilege('authenticated','public.member_food_scan_usage','SELECT');
