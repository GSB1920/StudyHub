-- Create a table for public profiles (linked to auth.users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  class text,
  board text,
  updated_at timestamp with time zone,
  
  constraint username_length check (char_length(email) >= 3)
);

-- Set up Row Level Security (RLS)
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on public.profiles
  for update using (auth.uid() = id);

-- Create a table for Subjects
create table public.subjects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  icon text not null, -- MaterialCommunityIcons name
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.subjects enable row level security;
create policy "Subjects are viewable by everyone." on public.subjects for select using (true);

-- Create a table for Study Materials
create table public.materials (
  id uuid default gen_random_uuid() primary key,
  subject_id uuid references public.subjects not null,
  title text not null,
  type text check (type in ('pdf', 'test', 'sheet')) not null,
  url text, -- URL to the file in Storage
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.materials enable row level security;
create policy "Materials are viewable by everyone." on public.materials for select using (true);

-- Functions to handle new user creation automatically
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Seed Data: Subjects
INSERT INTO public.subjects (name, icon) VALUES
  ('Mathematics', 'calculator'),
  ('Physics', 'atom'),
  ('Chemistry', 'flask'),
  ('Biology', 'dna'),
  ('English', 'book-open-page-variant'),
  ('Computer Science', 'laptop');

-- Seed Data: Materials (Linking to the subjects we just created)
-- Note: In a real script, we'd look up IDs, but for simplicity here we assume the order or insert manually if needed.
-- But since UUIDs are random, we need to do this carefully. Here is a safer way:

DO $$
DECLARE
  math_id uuid;
  phys_id uuid;
BEGIN
  SELECT id INTO math_id FROM public.subjects WHERE name = 'Mathematics';
  SELECT id INTO phys_id FROM public.subjects WHERE name = 'Physics';

  INSERT INTO public.materials (subject_id, title, type) VALUES
    (math_id, 'Algebra Chapter 1', 'pdf'),
    (math_id, 'Calculus Cheat Sheet', 'sheet'),
    (math_id, 'Trigonometry Test 1', 'test'),
    (phys_id, 'Kinematics Notes', 'pdf'),
    (phys_id, 'Laws of Motion Test', 'test');
END $$;
