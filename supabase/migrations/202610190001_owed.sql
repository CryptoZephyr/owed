begin;

create schema owed;
revoke all on schema owed from public;

create table owed.candidates (
  id uuid primary key default gen_random_uuid(),
  paypal_user_id text not null unique,
  payer_id text not null unique,
  name text not null,
  email text,
  verified boolean not null,
  created_at timestamptz not null default now()
);

create table owed.roles (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references owed.candidates,
  title text not null check (length(title) between 1 and 160),
  employer_name text not null check (length(employer_name) between 1 and 120),
  guarantee_cents integer not null check (guarantee_cents between 100 and 100000),
  capacity integer not null check (capacity between 1 and 100),
  hold_cents integer not null check (hold_cents > 0),
  deadline timestamptz not null,
  status text not null default 'draft' check (status in ('draft','approval_pending','active','closing','closed','needs_attention')),
  order_id text unique,
  approve_url text,
  authorization_id text unique,
  authorized_at timestamptz,
  expires_at timestamptz,
  renewed boolean not null default false,
  charged_cents integer not null default 0 check (charged_cents >= 0 and charged_cents <= hold_cents),
  created_at timestamptz not null default now(),
  check (hold_cents = guarantee_cents * capacity)
);

create table owed.guarantees (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references owed.roles,
  candidate_id uuid references owed.candidates,
  invite_hash text not null unique,
  candidate_label text not null check (length(candidate_label) between 1 and 120),
  deadline timestamptz not null,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'invited' check (status in ('invited','pending','overdue','charging','awaiting_account','paying','paid','unclaimed','closed','needs_attention')),
  extended boolean not null default false,
  closure_status text check (closure_status in ('moving_forward','not_moving_forward','still_deciding')),
  closure_message text,
  closed_at timestamptz,
  nudged_at timestamptz,
  flagged_at timestamptz,
  capture_id text unique,
  payout_batch_id text unique,
  payout_status text,
  created_at timestamptz not null default now(),
  unique (role_id, candidate_id)
);

create table owed.paypal_operations (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references owed.roles,
  kind text not null check (kind in ('create_hold','authorize_hold','charge_guarantee','payout','release_hold','renew_hold')),
  business_key text not null,
  input jsonb not null,
  state text not null default 'queued' check (state in ('queued','processing','unknown','pending','succeeded','rejected','manual_review')),
  result jsonb,
  failure jsonb,
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  first_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, business_key)
);

create index paypal_operations_due on owed.paypal_operations (next_attempt_at, created_at) where state in ('queued','processing','unknown','pending');
create index guarantees_due on owed.guarantees (deadline) where status in ('invited','pending');

create table owed.sessions (
  token_hash text primary key,
  candidate_id uuid not null references owed.candidates,
  expires_at timestamptz not null
);

create table owed.login_states (
  token_hash text primary key,
  return_to text not null,
  expires_at timestamptz not null
);

create table owed.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references owed.candidates,
  guarantee_id uuid references owed.guarantees,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now(),
  unique (guarantee_id, recipient_id, kind)
);

alter table owed.candidates enable row level security;
alter table owed.roles enable row level security;
alter table owed.guarantees enable row level security;
alter table owed.paypal_operations enable row level security;
alter table owed.sessions enable row level security;
alter table owed.login_states enable row level security;
alter table owed.notifications enable row level security;

create function owed.tick() returns void language plpgsql set search_path = '' as $$
begin
  insert into owed.notifications (recipient_id, guarantee_id, kind, message)
  select r.employer_id, g.id, 'deadline_nudge', 'A candidate is waiting for a status. Reply before the guarantee deadline.'
  from owed.guarantees g join owed.roles r on r.id = g.role_id
  where g.status in ('invited','pending') and g.nudged_at is null and r.status = 'active'
    and g.deadline <= now() + interval '24 hours'
  on conflict do nothing;
  update owed.guarantees g set nudged_at = now()
  from owed.roles r where r.id = g.role_id and r.status = 'active'
    and g.status in ('invited','pending') and g.nudged_at is null and g.deadline <= now() + interval '24 hours';
  update owed.guarantees g set status = 'overdue'
  from owed.roles r where r.id = g.role_id and r.status = 'active'
    and g.status in ('invited','pending') and g.deadline <= now();
  delete from owed.sessions where expires_at < now();
  delete from owed.login_states where expires_at < now();
end;
$$;

revoke all on all tables in schema owed from public;
revoke all on all functions in schema owed from public;

commit;
