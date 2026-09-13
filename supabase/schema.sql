-- THOGAI — Supabase Cloud Financial Schema with Row Level Security (RLS)
-- Run this script in your Supabase project SQL Editor to configure all tables and security policies.

-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- 2. Profiles Table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  avatar_url text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 3. Transactions Table
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'due')),
  amount numeric not null check (amount >= 0),
  category text not null,
  account text default 'Cash',
  description text default '',
  date text not null,
  notes text default '',
  recurring boolean default false,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.transactions enable row level security;

create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- 4. Budgets Table
create table if not exists public.budgets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  limit_amount numeric not null check (limit_amount >= 0),
  period text default 'monthly',
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.budgets enable row level security;

create policy "Users can manage own budgets"
  on public.budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Savings Goals Table
create table if not exists public.savings_goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric not null check (target_amount >= 0),
  current_amount numeric default 0,
  target_date text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.savings_goals enable row level security;

create policy "Users can manage own savings goals"
  on public.savings_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 6. User Settings Table
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text default 'INR',
  monthly_budget numeric default 0,
  starting_balance numeric default 0,
  default_category text default 'Other',
  default_account text default 'Cash',
  categories text[] default array['Food','Travel','Shopping','Bills','Health','Education','Entertainment','Other'],
  accounts text[] default array['Cash','Indian Bank','UPI / GPay','Credit Card','Savings Account'],
  theme text default 'midnight',
  notifications jsonb default '{"budget":true,"dues":true,"summary":true}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.user_settings enable row level security;

create policy "Users can manage own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 7. Automated profile creation trigger on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, created_at, updated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 8. Add onboarding and nickname fields to user_settings
alter table public.user_settings
  add column if not exists onboarding_completed boolean default false,
  add column if not exists nickname text default '',
  add column if not exists income_categories text[] default array['Salary','Freelance','Business Income','Refund','Cashback','Interest','Bonus','Gift','Friend Repayment','Asset Sale','Other'];

-- 9. Reconciliation History Table
create table if not exists public.reconciliation_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account text not null,
  start_date text not null,
  end_date text not null,
  reconciliation_date text not null,
  statement_closing_balance numeric,
  thogai_reconciled_balance numeric,
  difference numeric,
  transactions_checked integer default 0,
  transactions_matched integer default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.reconciliation_history enable row level security;

create policy "Users can manage own reconciliation history"
  on public.reconciliation_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
