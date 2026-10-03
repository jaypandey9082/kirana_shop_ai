-- Distributor loop: an approved reorder becomes a purchase order the distributor can accept,
-- and "Maal aa gaya" adds the received stock once and records what is owed to the supplier.
--
-- SENT --accept--> ACCEPTED --receive--> RECEIVED (--paid--> paid_at set)
--      --reject--> REJECTED
-- SENT can also be received directly (the distributor delivered without using the app).

create type po_status as enum ('SENT', 'ACCEPTED', 'REJECTED', 'RECEIVED');

create table purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  number         integer generated always as identity,
  merchant_id    uuid not null references merchants(id) on delete cascade,
  action_id      uuid unique references actions(id) on delete set null, -- one order per approved reorder
  supplier_slug  text not null,
  supplier_name  text not null,
  status         po_status not null default 'SENT',
  eta            text,
  note           text,
  total_paise    integer not null default 0 check (total_paise >= 0),
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  received_at    timestamptz,
  paid_at        timestamptz,
  check (paid_at is null or status = 'RECEIVED')
);
create index purchase_orders_merchant_idx on purchase_orders (merchant_id, created_at desc);
create index purchase_orders_supplier_idx on purchase_orders (supplier_slug, created_at desc);

create table purchase_order_items (
  id               uuid primary key default gen_random_uuid(),
  po_id            uuid not null references purchase_orders(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  qty_ordered      integer not null check (qty_ordered > 0),
  qty_confirmed    integer check (qty_confirmed >= 0 and qty_confirmed <= qty_ordered),
  unit_cost_paise  integer not null check (unit_cost_paise >= 0)
);
create index purchase_order_items_po_idx on purchase_order_items (po_id);

-- Which purchase order a restock came from (audit trail).
alter table stock_movements add column po_id uuid references purchase_orders(id) on delete set null;

alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
