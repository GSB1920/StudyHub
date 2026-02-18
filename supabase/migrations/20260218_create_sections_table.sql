-- Create Sections Table
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- RLS Policies for Sections
alter table public.sections enable row level security;
create policy "Public sections are viewable by everyone" on public.sections for select using (true);
create policy "Users can insert sections" on public.sections for insert with check (true);
create policy "Users can update sections" on public.sections for update using (true);
create policy "Users can delete sections" on public.sections for delete using (true);

-- Update Materials Table
alter table public.materials add column if not exists section_id uuid references public.sections(id) on delete cascade;

-- Migrate existing Categories to Sections
do $$
declare
  r record;
  sec_id uuid;
begin
  -- Loop through unique subject_id + category combinations
  for r in select distinct subject_id, category from materials where category is not null loop
    -- Create section if not exists
    insert into sections (subject_id, name)
    select r.subject_id, r.category
    where not exists (select 1 from sections where subject_id = r.subject_id and name = r.category)
    returning id into sec_id;
    
    -- If already exists, get the id
    if sec_id is null then
      select id into sec_id from sections where subject_id = r.subject_id and name = r.category;
    end if;

    -- Update materials
    update materials set section_id = sec_id where subject_id = r.subject_id and category = r.category;
  end loop;
end $$;
