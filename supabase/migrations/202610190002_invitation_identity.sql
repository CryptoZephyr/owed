begin;

alter table owed.candidates add column email_verified boolean not null default false;
alter table owed.guarantees add column intended_email text;
alter table owed.guarantees add constraint intended_email_normalized check (
  intended_email is null or
  (intended_email = lower(btrim(intended_email)) and length(intended_email) <= 254 and position('@' in intended_email) > 1)
);
create unique index guarantees_role_intended_email on owed.guarantees (role_id, intended_email) where intended_email is not null;

commit;
