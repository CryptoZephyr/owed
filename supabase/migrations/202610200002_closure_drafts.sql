create table owed.closure_drafts (
  guarantee_id uuid primary key references owed.guarantees on delete cascade,
  status text not null check (status in ('moving_forward','not_moving_forward','still_deciding')),
  new_deadline timestamptz,
  message text not null check (length(message) between 1 and 1200),
  review jsonb not null,
  updated_at timestamptz not null default now()
);

alter table owed.closure_drafts enable row level security;

alter table owed.guarantees add column closure_review jsonb;
