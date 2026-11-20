-- Ejecutar DESPUÉS de desplegar las funciones. Reemplazá TU_REF y TU_CRON_SECRET.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('sync-torneo', '* * * * *', $$
  select net.http_post(
    url := 'https://TU_REF.supabase.co/functions/v1/sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'TU_CRON_SECRET'),
    body := '{}'::jsonb
  );
$$);
-- Para detenerlo: select cron.unschedule('sync-torneo');
