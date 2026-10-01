-- Section 10: online orders from the QR storefront.
alter table bills
  add column order_name  text,
  add column order_phone text check (order_phone is null or order_phone ~ '^[6-9][0-9]{9}$'),
  add column order_mode  text check (order_mode is null or order_mode in ('pickup', 'delivery')),
  add column order_note  text;
create index bills_online_idx on bills (merchant_id, created_at desc) where channel = 'online';
