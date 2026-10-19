begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='owed_app_url')
    or not exists (select 1 from vault.decrypted_secrets where name='owed_cron_secret') then
    raise exception 'Add owed_app_url and owed_cron_secret to Supabase Vault before enabling the worker';
  end if;
end;
$$;

select cron.schedule('owed-deadlines', '* * * * *', 'select owed.tick()');
select cron.schedule('owed-worker', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='owed_app_url') || '/api/jobs/deadlines',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='owed_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

commit;
