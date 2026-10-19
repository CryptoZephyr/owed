begin;

create extension if not exists pg_cron;
select cron.schedule('owed-deadlines', '* * * * *', 'select owed.tick()');

commit;
