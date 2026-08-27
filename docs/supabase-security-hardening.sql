-- Security hardening for the Blow-Grid Supabase project.
--
-- The Expo app calls the Walter worker. The worker uses the Supabase
-- service-role key, so enabling RLS here does not block normal app traffic.
-- With no anon/authenticated policies, direct public REST access is denied.
-- Run this in Supabase SQL Editor, then re-run Security Advisor.

alter table if exists public.users enable row level security;
alter table if exists public.driver_stops enable row level security;
alter table if exists public.address_cache enable row level security;
alter table if exists public.address_usage_events enable row level security;
alter table if exists public.workspaces enable row level security;
alter table if exists public.workspace_invites enable row level security;
alter table if exists public.workspace_access_requests enable row level security;
alter table if exists public.organizations enable row level security;
alter table if exists public.org_billing enable row level security;
alter table if exists public.subscription_access enable row level security;

-- Confirm the public tables are protected.
select schemaname, tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename in (
    'users',
    'driver_stops',
    'address_cache',
    'address_usage_events',
    'workspaces',
    'workspace_invites',
    'workspace_access_requests',
    'organizations',
    'org_billing',
    'subscription_access'
  )
order by tablename;
