-- KioskCetak: skema awal. Semua akses data lewat server (service role).
-- RLS diaktifkan tanpa policy: anon/authenticated tidak bisa membaca apa pun langsung (NFR-SEC-04).

create table machines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  maintenance boolean not null default false,       -- mode perawatan (admin)
  fault boolean not null default false,             -- gagal cetak beruntun; dibersihkan lewat "Isi ulang selesai"
  fault_reason text,
  printer_state text not null default 'offline',    -- ready | paper_out | ink_out | error | offline (dilaporkan agent)
  capabilities jsonb not null default '{"duplex": true, "color": true}',
  last_heartbeat timestamptz,
  agent_token_hash text,
  active_order_id uuid,
  locked_at timestamptz,
  sides_bw_since_refill int not null default 0,
  sides_color_since_refill int not null default 0,
  sheets_since_refill int not null default 0,
  last_nozzle_check timestamptz,
  nozzle_result text,
  created_at timestamptz not null default now()
);

create table machine_settings (
  machine_id uuid primary key references machines(id) on delete cascade,
  price_bw_single int not null default 500,
  price_bw_duplex int not null default 400,
  price_color_single int not null default 1500,
  price_color_duplex int not null default 1300,
  rounding int not null default 100 check (rounding in (100, 500)),
  max_copies int not null default 50,
  min_total int not null default 1000,
  allow_color boolean not null default true,
  allow_duplex boolean not null default true,
  allow_nup boolean not null default true,
  paper_capacity int not null default 250,
  paper_warn int not null default 30,               -- peringatan saat sisa lembar <= nilai ini
  ink_bw_capacity int not null default 4000,        -- perkiraan sisi hitam-putih per isi ulang
  ink_color_capacity int not null default 1500,
  ink_warn_pct int not null default 15,
  offline_alert_minutes int not null default 5,
  admin_whatsapp text                                -- format 628xxxx, untuk tombol "Laporkan masalah"
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Token QR dinamis di layar kiosk. Sekali pakai, berlaku 60 dtk + 30 dtk toleransi.
create table kiosk_tokens (
  token text primary key,
  machine_id uuid not null references machines(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index on kiosk_tokens (machine_id, created_at desc);

create table orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  machine_id uuid not null references machines(id),
  session_id uuid references sessions(id) on delete set null,
  status text not null default 'DIBUAT',
  total int not null default 0,
  price_snapshot jsonb,
  pay_expires_at timestamptz,
  paid_at timestamptz,
  printed_at timestamptz,
  files_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on orders (status, updated_at);
create index on orders (machine_id, created_at desc);

create table order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  position int not null default 0,
  original_name text not null,
  mime text not null,
  kind text not null,                                -- pdf | docx | pptx | image
  size_bytes bigint not null,
  storage_path text not null,
  converted_path text,
  status text not null default 'pending',            -- pending | uploaded | processing | ready | error
  error text,
  pages int,
  options jsonb,
  sides int,
  price int,
  created_at timestamptz not null default now(),
  processing_since timestamptz
);
create index on order_files (order_id);
create index on order_files (status);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_ref text not null unique,                 -- idempotensi webhook (FR-PAY-04)
  amount int not null,
  status text not null default 'pending',            -- pending | paid | expired | mismatch | late
  qr_string text,
  raw jsonb,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on payments (order_id);

create table print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  machine_id uuid not null references machines(id),
  status text not null default 'queued',             -- queued | claimed | printing | done | failed
  attempt int not null default 0,
  error text,
  progress jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index on print_jobs (machine_id, status);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null default 'needs_info',         -- needs_info | pending | done
  kind text not null default 'full',                 -- full | partial
  amount int not null,
  reason text,
  holder_name text,
  destination text,                                  -- e-wallet / rekening
  admin_note text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  delete_after timestamptz not null default (now() + interval '6 months')
);
create index on refunds (status);

create table order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  type text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index on order_events (order_id, id);

create table admins (
  email text primary key,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table alerts (
  id bigint generated always as identity primary key,
  kind text not null,
  machine_id uuid references machines(id) on delete cascade,
  message text not null,
  dedupe_key text,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);
create index on alerts (dedupe_key, created_at desc);

create table app_state (
  key text primary key,
  value timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['machines','machine_settings','sessions','kiosk_tokens','orders','order_files','payments',
    'print_jobs','refunds','order_events','admins','audit_log','alerts','app_state']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Bucket privat untuk dokumen (NFR-SEC-08)
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

-- Kunci mesin atomik: hanya berhasil bila belum ada order aktif (FR-LCK-02)
create or replace function lock_machine(p_machine uuid, p_order uuid) returns boolean
language plpgsql as $$
declare n int;
begin
  update machines set active_order_id = p_order, locked_at = now()
   where id = p_machine and active_order_id is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function release_machine(p_machine uuid, p_order uuid) returns void
language sql as $$
  update machines set active_order_id = null, locked_at = null
   where id = p_machine and active_order_id = p_order;
$$;

-- Konfirmasi pembayaran idempoten (FR-PAY-03..07). Satu transaksi, baris dikunci.
create or replace function confirm_payment(p_ref text, p_amount int, p_raw jsonb default null) returns text
language plpgsql as $$
declare pay payments; ord orders;
begin
  select * into pay from payments where provider_ref = p_ref for update;
  if not found then return 'unknown'; end if;
  if pay.status = 'paid' then return 'duplicate'; end if;

  select * into ord from orders where id = pay.order_id for update;

  if p_amount <> pay.amount then
    update payments set status = 'mismatch', raw = coalesce(p_raw, raw) where id = pay.id;
    insert into order_events(order_id, type, detail) values (ord.id, 'PAYMENT_MISMATCH', 'nominal webhook ' || p_amount || ' != ' || pay.amount);
    insert into alerts(kind, machine_id, message, dedupe_key)
      values ('payment_mismatch', ord.machine_id, 'Pembayaran tidak cocok untuk order ' || ord.code, 'mismatch:' || ord.id);
    return 'mismatch';
  end if;

  if ord.status <> 'MENUNGGU_BAYAR' then
    -- Dibayar setelah kedaluwarsa/dibatalkan: masuk antrean refund manual (FR-PAY-07)
    update payments set status = 'late', paid_at = now(), raw = coalesce(p_raw, raw) where id = pay.id;
    insert into refunds(order_id, status, kind, amount, reason)
      values (ord.id, 'needs_info', 'full', pay.amount, 'Pembayaran masuk setelah order ' || ord.status);
    insert into order_events(order_id, type, detail) values (ord.id, 'PAYMENT_LATE', 'order sudah ' || ord.status);
    insert into alerts(kind, machine_id, message, dedupe_key)
      values ('payment_late', ord.machine_id, 'Pembayaran terlambat untuk order ' || ord.code || ' (perlu refund)', 'late:' || ord.id);
    return 'late';
  end if;

  update payments set status = 'paid', paid_at = now(), raw = coalesce(p_raw, raw) where id = pay.id;
  update orders set status = 'LUNAS', paid_at = now(), updated_at = now() where id = ord.id;
  insert into print_jobs(order_id, machine_id) values (ord.id, ord.machine_id)
    on conflict (order_id) do nothing;
  insert into order_events(order_id, type, detail) values (ord.id, 'PAID', pay.provider || ':' || pay.provider_ref);
  return 'ok';
end $$;
