-- Read-only verification. Does not print phone, health answers or secrets.
select 'pro_real_cases' as object,count(*) as rows from public.pro_real_cases
union all select 'pro_real_intake_versions',count(*) from public.pro_real_intake_versions
union all select 'pro_real_plans',count(*) from public.pro_real_plans
union all select 'pro_workspace_licenses',count(*) from public.pro_workspace_licenses
union all select 'pro_license_audit',count(*) from public.pro_license_audit;
select n.nspname,c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'pro_%' and c.relkind='r' order by c.relname;
select has_function_privilege('authenticated','public.pro_save_real_plan(uuid,uuid,integer,jsonb,uuid)','execute') as unsafe_client_snapshot_write,
       has_function_privilege('authenticated','public.pro_service_cleanup(uuid)','execute') as unsafe_client_cleanup,
       has_function_privilege('authenticated','public.pro_service_status()','execute') as unsafe_client_service_probe;
-- All three booleans above must be false.
select c.conrelid::regclass as relation,c.conname,c.convalidated
from pg_constraint c join pg_class r on r.oid=c.conrelid
where c.connamespace='public'::regnamespace and r.relname like 'pro_%' and not c.convalidated;
-- The last result should be empty.
