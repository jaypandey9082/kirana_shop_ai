-- Section 9: approved actions and their single execution record.
create table outbox (
  id            uuid primary key default gen_random_uuid(),
  action_id     uuid not null unique references actions(id) on delete cascade, -- one execution per action
  channel       text not null check (channel in ('supplier_message', 'customer_reminder')),
  recipient     text not null,
  body          text not null,
  link          text,
  delivered_via text not null,  -- 'n8n' or 'built-in outbox'
  created_at    timestamptz not null default now()
);
alter table outbox enable row level security;

alter table actions add column error text;
