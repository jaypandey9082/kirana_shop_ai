-- Section 5: payments.
-- The mock gateway table stands in for an external gateway so mock payments go
-- through exactly the same server-side verification path as Paytm.
create table mock_gateway_orders (
  order_id     text primary key,
  amount_paise integer not null check (amount_paise > 0),
  status       text not null default 'CREATED' check (status in ('CREATED', 'SUCCESS', 'FAILED')),
  txn_id       text,
  updated_at   timestamptz not null default now()
);
alter table mock_gateway_orders enable row level security;

-- One successful payment per bill, enforced by the database as a last line of defence.
create unique index payments_one_success_per_bill on payments (bill_id) where status = 'SUCCESS';
