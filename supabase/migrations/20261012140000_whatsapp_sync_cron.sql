-- Every 30 minutes: pull WhatsApp statuses from MSG91's logs and resend
-- customer messages MSG91 accepted but never sent (resends 9 AM–9 PM only).
do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    perform cron.schedule('whatsapp-status-sync', '*/30 * * * *', $job$
      select net.http_post(
        url := 'https://retail.gpbm.in/api/cron/whatsapp-sync',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || s.decrypted_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000)
      from vault.decrypted_secrets s where s.name = 'owner_summary_cron_secret'
    $job$);
  end if;
end
$outer$;
