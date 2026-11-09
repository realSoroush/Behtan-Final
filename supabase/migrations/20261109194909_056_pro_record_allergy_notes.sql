-- Optional specialist-only record. Existing case revisions remain valid and unchanged.
-- Deliberately excluded from valid_intake and the engine's enumerated allergies.
create or replace function pro_private.valid_real_intake(a jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 return coalesce(jsonb_typeof(a)='object' and jsonb_typeof(a->'display_name')='string'
 and char_length(btrim(a->>'display_name')) between 1 and 80
 and jsonb_typeof(a->'phone')='string' and char_length(a->>'phone')<=20
 and (a->>'phone'='' or a->>'phone' ~ '^\+?[0-9]{8,15}$')
 and (not (a ? 'custom_allergy_notes') or
   (jsonb_typeof(a->'custom_allergy_notes')='string' and char_length(a->>'custom_allergy_notes')<=1000))
 and pro_private.valid_intake(a-'display_name'-'phone'-'custom_allergy_notes'),false);
exception when others then return false;
end $$;
revoke all on function pro_private.valid_real_intake(jsonb) from public,anon,authenticated;
