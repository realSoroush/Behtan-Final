-- Run AFTER adding payment_project_url and payment_reconcile_secret to Supabase Vault.
-- Never commit the real token. Its value must match PAYMENT_RECONCILE_SECRET in Edge Secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='payment_project_url')
    or not exists(select 1 from vault.decrypted_secrets where name='payment_reconcile_secret') then
    raise exception 'Create both payment Vault secrets before scheduling';
  end if;
end $$;
select cron.schedule('behtan-payment-reconciliation','* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='payment_project_url') || '/functions/v1/payments',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='payment_reconcile_secret')),
    body := '{"action":"reconcile"}'::jsonb,
    timeout_milliseconds := 140000
  );
$job$);
