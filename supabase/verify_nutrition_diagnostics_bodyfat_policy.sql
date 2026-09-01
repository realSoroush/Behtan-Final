select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_profiles'
  and column_name in ('body_fat_pct', 'body_fat_source')
order by column_name;

select body_fat_source, count(*)
from public.user_profiles
group by body_fat_source
order by body_fat_source nulls first;
