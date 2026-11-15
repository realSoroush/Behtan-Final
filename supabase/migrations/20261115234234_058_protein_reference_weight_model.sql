begin;

alter table public.nutrition_protein_policy
  add column reference_weight_model text not null default 'step-v1',
  add constraint nutrition_protein_policy_reference_weight_model_check
    check (reference_weight_model in ('step-v1', 'continuous-lower-envelope-v1'));

comment on column public.nutrition_protein_policy.reference_weight_model is
  'Shared reference-weight model for new Member and Pro calculations. Existing update permissions and catalog revision triggers apply.';

notify pgrst, 'reload schema';
commit;
