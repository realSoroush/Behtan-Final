-- Read-only deployment checks. Run in the Iran project's SQL Editor after migration 040.
do $$
begin
 if to_regclass('public.pro_specialist_profiles') is null then raise exception 'PROFILE_TABLE_MISSING';end if;
 if not (select relrowsecurity from pg_class where oid='public.pro_specialist_profiles'::regclass) then raise exception 'PROFILE_RLS_MISSING';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='pro_specialist_profiles' and policyname='pro_specialist_self_read') then raise exception 'PROFILE_POLICY_MISSING';end if;
 if has_table_privilege('anon','public.pro_specialist_profiles','SELECT')
 or has_table_privilege('authenticated','public.pro_specialist_profiles','INSERT')
 or has_table_privilege('authenticated','public.pro_specialist_profiles','UPDATE')
 or has_table_privilege('authenticated','public.pro_specialist_profiles','DELETE') then raise exception 'PROFILE_GRANTS_UNSAFE';end if;
 if not has_function_privilege('authenticated','public.pro_specialist_profile()','EXECUTE')
 or not has_function_privilege('authenticated','public.pro_save_specialist_profile(text,text,text,text,text,text)','EXECUTE')
 or not has_function_privilege('authenticated','public.pro_plan_specialist(uuid,text,uuid)','EXECUTE') then raise exception 'PROFILE_RPC_GRANT_MISSING';end if;
 if has_function_privilege('anon','public.pro_specialist_profile()','EXECUTE')
 or has_function_privilege('anon','public.pro_save_specialist_profile(text,text,text,text,text,text)','EXECUTE')
 or has_function_privilege('anon','public.pro_plan_specialist(uuid,text,uuid)','EXECUTE') then raise exception 'PROFILE_RPC_PUBLIC';end if;
end $$;
select 'SPECIALIST_PROFILE_READY' as result;
