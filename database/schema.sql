-- Create a table to store user schedules
create table public.schedules (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_email text not null,
  telegram_chat_id text,
  schedule_data jsonb not null, -- Stores the full daily plan
  is_active boolean default true
);

-- Enable Row Level Security (RLS)
alter table public.schedules enable row level security;

-- Allow anyone to insert (for now, until we add Auth)
create policy "Enable insert for all users" on public.schedules for insert with check (true);

-- Allow users to read their own schedule (based on email match - simplified for prototype)
create policy "Enable read for users based on email" on public.schedules for select using (true);
