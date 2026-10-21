-- Kode mesin yang mudah dibaca dan unik: 001 = mesin 1 (perpustakaan), 002 = mesin 2 (kantor), dst.
-- Dipakai untuk label di layar kiosk. id (uuid) tetap menjadi kunci internal.
alter table machines add column if not exists code text;

-- Isi mesin yang sudah ada berdasarkan urutan dibuat (migrasi ini dijalankan sekali, kolom code masih kosong semua).
with n as (select id, row_number() over (order by created_at) as rn from machines)
update machines m set code = lpad(n.rn::text, 3, '0') from n where n.id = m.id and m.code is null;

create unique index if not exists machines_code_key on machines (code);
