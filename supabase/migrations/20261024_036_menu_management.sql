begin;
create table public.member_menu_audit(id uuid primary key default gen_random_uuid(),actor uuid not null references auth.users(id),template_id text not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
alter table public.member_menu_audit enable row level security;revoke all on public.member_menu_audit from public,anon,authenticated;
create trigger member_menu_audit_immutable before update or delete on public.member_menu_audit for each row execute function pro_private.immutable_audit();
create function public.admin_member_menus() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED';end if;
 return jsonb_build_object('templates',(select coalesce(jsonb_agg(t order by sort_order,id),'[]') from public.meal_templates t),'slots',(select coalesce(jsonb_agg(s order by template_id,position),'[]') from public.meal_template_slots s),'foods',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'unit',unit_label,'min',portion_min_units,'max',portion_hard_max_units) order by name),'[]') from public.food_items where is_active));end$$;
create function public.admin_save_member_menu(p_id text,p_name text,p_slot text,p_expected timestamptz,p_items jsonb,p_active boolean default true) returns void language plpgsql security definer set search_path='' as $$
declare old public.meal_templates;item jsonb;f public.food_items;pos integer:=0;diets text[];before_data jsonb;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED';end if;
 if p_id!~'^[a-z][a-z0-9_]{1,79}$' or length(trim(p_name)) not between 1 and 100 or p_slot not in('breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack','post_workout') or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 12 or octet_length(p_items::text)>12000 then raise exception 'INVALID_MENU';end if;
 if(select count(distinct i->>'food') from jsonb_array_elements(p_items)i)<>jsonb_array_length(p_items) then raise exception 'DUPLICATE_FOOD';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id,36));select * into old from public.meal_templates where id=p_id for update;
 if (old.id is not null and old.updated_at is distinct from p_expected) or(old.id is null and p_expected is not null) then raise exception 'STALE_MENU';end if;
 before_data:=jsonb_build_object('template',to_jsonb(old),'items',(select jsonb_agg(s) from public.meal_template_slots s where template_id=p_id));
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item)k where k not in('food','fixed')) then raise exception 'INVALID_ITEM';end if;
  select * into f from public.food_items where id=item->>'food' and is_active;if not found then raise exception 'INVALID_FOOD';end if;
  if item->'fixed' is not null and item->'fixed'<>'null'::jsonb and(jsonb_typeof(item->'fixed')<>'number' or(item->>'fixed')::numeric<f.portion_min_units or(item->>'fixed')::numeric>f.portion_hard_max_units) then raise exception 'INVALID_PORTION';end if;
 end loop;
 select array_agg(d) into diets from unnest(array['none','vegan','lacto_ovo','pescatarian','raw']) d where not exists(select 1 from jsonb_array_elements(p_items)i join public.food_items fd on fd.id=i->>'food' where d=any(fd.excluded_for_vegetarian));
 if diets is null then raise exception 'NO_COMPATIBLE_DIET';end if;
 insert into public.meal_templates(id,display_name,slot,is_active,vegetarian_statuses_only) values(p_id,trim(p_name),p_slot,p_active,diets) on conflict(id) do update set display_name=excluded.display_name,slot=excluded.slot,is_active=excluded.is_active,vegetarian_statuses_only=excluded.vegetarian_statuses_only;
 delete from public.meal_template_slots where template_id=p_id;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into f from public.food_items where id=item->>'food';
  insert into public.meal_template_slots(template_id,position,role,primary_food_item_id,dynamic_units,fixed_units) values(p_id,pos,f.role,f.id,item->>'fixed' is null,(item->>'fixed')::numeric);pos:=pos+1;
 end loop;
 insert into public.member_menu_audit(actor,template_id,before_data,after_data) values(auth.uid(),p_id,before_data,jsonb_build_object('name',p_name,'slot',p_slot,'items',p_items,'active',p_active));
end$$;
revoke all on function public.admin_member_menus(),public.admin_save_member_menu(text,text,text,timestamptz,jsonb,boolean) from public,anon;grant execute on function public.admin_member_menus(),public.admin_save_member_menu(text,text,text,timestamptz,jsonb,boolean) to authenticated;
commit;
