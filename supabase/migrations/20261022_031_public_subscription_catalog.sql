begin;

-- Public presentation of the existing admin-managed catalog. This does not
-- grant table access, checkout permissions or subscription entitlements.
create or replace function public.public_subscription_catalog()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', p.code,
    'name', p.name,
    'emoji', p.emoji,
    'price_toman', p.price_toman,
    'price_note', p.price_note,
    'duration_days', p.duration_days,
    'features', p.features,
    'badge', p.badge,
    'theme', p.theme,
    'sort_order', p.sort_order,
    'is_active', p.is_active
  ) order by p.sort_order, p.code), '[]'::jsonb)
  from public.subscription_plans as p
  where p.is_active = true;
$$;

revoke all on function public.public_subscription_catalog() from public;
grant execute on function public.public_subscription_catalog() to anon, authenticated;
comment on function public.public_subscription_catalog() is
  'Read-only public marketing catalog. Active offers only; pricing and eligibility are rechecked by the existing authenticated checkout.';

commit;
