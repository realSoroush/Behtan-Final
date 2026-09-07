-- Run after 20260907_013_subscription_plans.sql.
-- Every issue_count must be zero; the final result set previews active plans.

select 'missing_seed_plans' as check_name, count(*) as issue_count
from (values ('silver'), ('gold')) expected(code)
where not exists (
  select 1 from public.subscription_plans plan where plan.code = expected.code
);

select 'invalid_prices' as check_name, count(*) as issue_count
from public.subscription_plans
where price_toman < 0 or price_toman > 100000000;

select 'invalid_active_plan_content' as check_name, count(*) as issue_count
from public.subscription_plans
where is_active = true
  and (
    btrim(name) = ''
    or not public.subscription_features_valid(features)
    or btrim(price_note) = ''
  );

select 'missing_profile_foreign_key' as check_name,
  case when exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_profiles'::regclass
      and conname = 'user_profiles_subscription_tier_fkey'
      and contype = 'f'
  ) then 0 else 1 end as issue_count;

select code, name, price_toman, price_note, duration_days, badge, theme, sort_order
from public.subscription_plans
where is_active = true
order by sort_order, code;

select 'catalog_rls_disabled' as check_name,
  case when relrowsecurity then 0 else 1 end as issue_count
from pg_class where oid = 'public.subscription_plans'::regclass;

select 'browser_write_privileges' as check_name, count(*) as issue_count
from (values ('anon'), ('authenticated')) roles(role_name)
cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privileges(privilege_name)
where has_table_privilege(role_name, 'public.subscription_plans', privilege_name);
