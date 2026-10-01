-- Section 4: bill lines that the merchant must check before confirming.
alter table bill_items
  add column needs_review  boolean not null default false,
  add column candidate_ids uuid[]  not null default '{}';
