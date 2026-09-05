select schemaname, tablename, rowsecurity from pg_tables where schemaname='public' and tablename='daily_meal_checkins';
select policyname, cmd, roles from pg_policies where schemaname='public' and tablename='daily_meal_checkins' order by cmd, policyname;
select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='daily_meal_checkins' order by ordinal_position;
