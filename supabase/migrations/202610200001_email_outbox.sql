alter table owed.notifications
  add column email_state text not null default 'pending'
    check (email_state in ('pending','sending','sent','failed','unknown','skipped')),
  add column email_attempts integer not null default 0,
  add column email_claimed_at timestamptz,
  add column email_sent_at timestamptz,
  add column email_error text;

update owed.notifications set email_state = 'skipped';

create index notifications_email_pending on owed.notifications (created_at) where email_state = 'pending';
