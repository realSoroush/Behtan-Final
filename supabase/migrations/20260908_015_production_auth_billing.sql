begin;

-- Production is the only entitlement domain in this release. Checkout stays
-- closed until SMS.ir, Turnstile, the signed Auth Hook and ZarinPal are deployed.
update public.billing_settings
set mode = 'live', checkout_enabled = false
where id = true;

commit;
