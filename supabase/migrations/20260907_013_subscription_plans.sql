begin;

create or replace function public.subscription_features_valid(items text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    array_ndims(items) = 1
    and cardinality(items) between 1 and 20
    and not exists (
      select 1 from unnest(items) as feature(value)
      where value is null or char_length(btrim(value)) not between 1 and 180
    ), false
  );
$$;

create table if not exists public.subscription_plans (
  code text primary key,
  name text not null,
  emoji text not null default '',
  price_toman bigint not null check (price_toman between 0 and 100000000),
  price_note text not null default 'ماهانه',
  duration_days smallint not null default 30 check (duration_days between 1 and 3650),
  features text[] not null,
  badge text,
  theme text not null default 'silver' check (theme in ('silver', 'gold', 'green')),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_code_check check (code ~ '^[a-z][a-z0-9_-]{1,49}$'),
  constraint subscription_plans_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint subscription_plans_emoji_check check (char_length(emoji) <= 16),
  constraint subscription_plans_price_note_check check (char_length(btrim(price_note)) between 1 and 80),
  constraint subscription_plans_features_check check (
    public.subscription_features_valid(features)
  ),
  constraint subscription_plans_badge_check check (
    badge is null or char_length(btrim(badge)) between 1 and 80
  )
);

insert into public.subscription_plans (
  code, name, emoji, price_toman, price_note, duration_days,
  features, badge, theme, sort_order, is_active
)
values
  (
    'silver', 'نقره‌ای', '🥈', 149000, 'ماهانه', 30,
    array[
      'برنامه تغذیه شخصی‌سازی‌شده',
      'محاسبه دقیق کالری و ماکرو',
      '۶ وعده غذایی روزانه',
      'جایگزینی غذا (سواپ)',
      'پشتیبانی ۷/۲۴'
    ],
    null, 'silver', 10, true
  ),
  (
    'gold', 'طلایی', '🥇', 249000, 'ماهانه', 30,
    array[
      'همه مزایای نقره‌ای',
      '✨ برنامه تمرینی اختصاصی',
      '✨ تنظیم بر اساس ورزش روز',
      '✨ مشاوره با متخصص تغذیه',
      '✨ تحلیل پیشرفته ترکیب بدن'
    ],
    'محبوب‌ترین', 'gold', 20, true
  )
on conflict (code) do nothing;

alter table public.user_profiles
  drop constraint if exists user_profiles_subscription_tier_check;

alter table public.user_profiles
  drop constraint if exists user_profiles_subscription_tier_fkey;

alter table public.user_profiles
  add constraint user_profiles_subscription_tier_fkey
  foreign key (subscription_tier)
  references public.subscription_plans(code)
  on update cascade
  on delete restrict;

drop trigger if exists trg_subscription_plans_updated_at on public.subscription_plans;
create trigger trg_subscription_plans_updated_at
before update on public.subscription_plans
for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;

drop policy if exists "Authenticated users can read active subscription plans" on public.subscription_plans;
create policy "Authenticated users can read active subscription plans"
  on public.subscription_plans
  for select
  to authenticated
  using (is_active = true);

revoke all on public.subscription_plans from anon;
revoke insert, update, delete on public.subscription_plans from authenticated;
revoke truncate, references, trigger on public.subscription_plans from authenticated;
grant select on public.subscription_plans to authenticated;
grant select, insert, update, delete on public.subscription_plans to service_role;

comment on table public.subscription_plans is
  'Live Behtan subscription catalog. Manage rows in Supabase Dashboard; browser clients can only read active plans.';
comment on column public.subscription_plans.price_toman is
  'Plan price in toman. Zero is displayed as رایگان. This catalog does not grant paid access.';
comment on column public.subscription_plans.price_note is
  'Period label only, e.g. ماهانه. UI always supplies the تومان currency label for non-zero prices.';
comment on column public.subscription_plans.duration_days is
  'Entitlement duration reserved for the payment activation flow.';

commit;
