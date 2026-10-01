-- Kirana Shop AI: core schema (Section 2).
-- Plain Postgres, compatible with Supabase. All money is integer paise.
-- The app talks to the database only from the server (direct connection).
-- RLS is enabled with no policies, so Supabase's anon/authenticated roles
-- cannot read or write anything through the public API.

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type bill_channel   as enum ('counter', 'online');
create type bill_status    as enum ('DRAFT', 'CONFIRMED', 'PAID', 'ON_CREDIT', 'CANCELLED');
create type payment_method as enum ('paytm', 'cash', 'udhaar', 'mock');
create type fulfilment     as enum ('RECEIVED', 'PREPARING', 'READY', 'COMPLETED');
create type line_source    as enum ('manual', 'scan', 'parchi', 'voice', 'photo', 'storefront');
create type payment_provider as enum ('paytm', 'mock', 'cash');
create type payment_status as enum ('CREATED', 'PENDING', 'SUCCESS', 'FAILED');
create type stock_reason   as enum ('opening', 'restock', 'sale', 'adjustment');
create type khata_type     as enum ('debit', 'credit');
create type action_type    as enum ('reorder', 'reminder');
create type action_status  as enum ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- ---------- core ----------
create table merchants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  locality    text not null,
  open_till   text not null,
  delivery_radius_km numeric(4,1) not null default 1,
  restock_hour smallint not null default 9 check (restock_hour between 0 and 23),
  created_at  timestamptz not null default now()
);

create table products (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  sku           text not null,
  name          text not null,
  category      text not null,
  unit          text not null,
  aliases       text[] not null default '{}',
  price_paise   integer not null check (price_paise > 0),
  stock         integer not null default 0 check (stock >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  barcode       text,
  active        boolean not null default true,
  unique (merchant_id, sku),
  unique (merchant_id, barcode)
);
create index products_merchant_idx on products (merchant_id) where active;

create table customers (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name        text not null,
  phone       text,
  created_at  timestamptz not null default now()
);
create index customers_merchant_idx on customers (merchant_id);

-- A bill is both a counter bill and an online order (channel = 'online').
create table bills (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references merchants(id) on delete cascade,
  number         integer not null,
  channel        bill_channel not null default 'counter',
  status         bill_status not null default 'DRAFT',
  payment_method payment_method,
  fulfilment     fulfilment,
  customer_id    uuid references customers(id),
  total_paise    integer not null default 0 check (total_paise >= 0),
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  settled_at     timestamptz,           -- paid (PAID) or put on credit (ON_CREDIT)
  unique (merchant_id, number),
  check (status <> 'ON_CREDIT' or customer_id is not null),
  check (channel = 'online' or fulfilment is null)
);
create index bills_merchant_settled_idx on bills (merchant_id, settled_at) where status in ('PAID', 'ON_CREDIT');

create table bill_items (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid not null references bills(id) on delete cascade,
  product_id        uuid not null references products(id),
  qty               integer not null check (qty > 0),
  unit_price_paise  integer not null check (unit_price_paise > 0),
  line_total_paise  integer generated always as (qty * unit_price_paise) stored,
  source            line_source not null default 'manual',
  confidence        numeric(4,3) check (confidence between 0 and 1),
  raw_text          text
);
create index bill_items_bill_idx on bill_items (bill_id);
create index bill_items_product_idx on bill_items (product_id);

create table payments (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid not null references bills(id) on delete cascade,
  provider          payment_provider not null,
  provider_order_id text not null unique,
  txn_id            text,
  amount_paise      integer not null check (amount_paise > 0),
  status            payment_status not null default 'CREATED',
  verified_at       timestamptz,
  raw               jsonb,
  created_at        timestamptz not null default now(),
  check (status <> 'SUCCESS' or verified_at is not null)
);
create index payments_bill_idx on payments (bill_id);

create table stock_movements (
  id          bigserial primary key,
  product_id  uuid not null references products(id) on delete cascade,
  delta       integer not null check (delta <> 0),
  reason      stock_reason not null,
  bill_id     uuid references bills(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index stock_movements_product_idx on stock_movements (product_id, created_at);

create table khata_entries (
  id          bigserial primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  type        khata_type not null,
  amount_paise integer not null check (amount_paise > 0),
  bill_id     uuid references bills(id) on delete set null,
  payment_id  uuid references payments(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index khata_customer_idx on khata_entries (customer_id, created_at);

create table actions (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  type        action_type not null,
  status      action_status not null default 'PENDING',
  payload     jsonb not null default '{}',
  draft_text  text not null,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  executed_at timestamptz
);
create index actions_merchant_idx on actions (merchant_id, created_at desc);

-- Append-only log shown to judges. Rows cannot be updated or deleted
-- (demo reset uses TRUNCATE, which row triggers do not block).
create table events (
  id          bigserial primary key,
  merchant_id uuid not null references merchants(id) on delete cascade,
  type        text not null,
  summary     text not null,
  data        jsonb not null default '{}',
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index events_merchant_idx on events (merchant_id, id desc);

create function events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'events is append-only';
end $$;
create trigger events_no_update before update or delete on events
  for each row execute function events_append_only();

-- ---------- views ----------
create view customer_balances with (security_invoker = true) as
select c.id as customer_id, c.merchant_id, c.name,
       coalesce(sum(case when k.type = 'debit' then k.amount_paise else -k.amount_paise end), 0)::integer as balance_paise,
       max(k.created_at) as last_activity_at
from customers c
left join khata_entries k on k.customer_id = c.id
group by c.id;

-- ---------- access ----------
alter table merchants       enable row level security;
alter table products        enable row level security;
alter table customers       enable row level security;
alter table bills           enable row level security;
alter table bill_items      enable row level security;
alter table payments        enable row level security;
alter table stock_movements enable row level security;
alter table khata_entries   enable row level security;
alter table actions         enable row level security;
alter table events          enable row level security;
