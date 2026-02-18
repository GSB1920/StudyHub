create extension if not exists pgcrypto;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  class text,
  board text,
  created_at timestamptz default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  type text not null check (type in ('pdf','test','sheet')),
  url text,
  created_at timestamptz default now()
);

create index if not exists materials_subject_idx on public.materials(subject_id);

alter table public.subjects enable row level security;
alter table public.materials enable row level security;

create policy if not exists subjects_select_all on public.subjects for select using (true);
create policy if not exists subjects_insert_all on public.subjects for insert with check (true);
create policy if not exists subjects_update_all on public.subjects for update using (true) with check (true);

create policy if not exists materials_select_all on public.materials for select using (true);
create policy if not exists materials_insert_all on public.materials for insert with check (true);
create policy if not exists materials_update_all on public.materials for update using (true) with check (true);

select storage.create_bucket('materials', public => true);

create policy if not exists storage_materials_select_all on storage.objects for select using (bucket_id = 'materials');
create policy if not exists storage_materials_insert_all on storage.objects for insert with check (bucket_id = 'materials');
