-- Create User Progress Table
create table if not exists public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  progress integer default 0,
  status text default 'started',
  last_accessed timestamptz default now(),
  unique(user_id, material_id)
);

-- RLS
alter table public.user_progress enable row level security;

create policy "Users can view own progress" on public.user_progress 
  for select using (auth.uid() = user_id);

create policy "Users can insert own progress" on public.user_progress 
  for insert with check (auth.uid() = user_id);

create policy "Users can update own progress" on public.user_progress 
  for update using (auth.uid() = user_id);
