import { sql } from 'drizzle-orm'
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  await db.execute(sql`
grant usage on schema public to supabase_auth_admin;

grant all
  on table public.user_roles
  to supabase_auth_admin;

grant all
  on table public.role_permissions
  to supabase_auth_admin;

-- Add grant for region_members table
grant all
  on table public.region_members
  to supabase_auth_admin;

-- Basic authorize function that checks global permissions
create or replace function public.authorize (requested_permission app_permission) returns boolean as $$
  declare
    bind_permissions int;
    user_role public.app_role;
    user_id uuid;
  begin
    select (auth.jwt() ->> 'sub')::uuid into user_id;

    select role into user_role from public.user_roles where user_roles.auth_user_fk = user_id;

    select count(*)
    into bind_permissions
    from public.role_permissions
    where role_permissions.permission = requested_permission
      and role_permissions.role = user_role;

    return bind_permissions > 0;
  end;
$$ language plpgsql stable security definer set search_path = '';

-- Function to check authorization in a specific region
create or replace function public.authorize_in_region(requested_permission app_permission, region_id int) returns boolean as $$
  declare
    bind_permissions int;
    user_role public.app_role;
    region_role public.app_role;
    user_id uuid;
  begin
    -- Get user ID from JWT
    select (auth.jwt() ->> 'sub')::uuid into user_id;

    select role into region_role
    from public.region_members
    where auth_user_fk = user_id
      and region_fk = region_id
      and is_active = true;

    if region_role is null then
      return false;
    end if;

    -- Check if this role has the requested permission
    select count(*)
    into bind_permissions
    from public.role_permissions
    where permission = requested_permission
      and role = region_role;

    return bind_permissions > 0;
  end;
$$ language plpgsql stable security definer set search_path = '';

-- Grant execute permissions to authenticated users
grant execute on function public.authorize_in_region to authenticated;


-- Create the auth hook function
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
  declare
    claims jsonb;
    user_role public.app_role;
  begin
    -- Fetch the user role in the user_roles table
    select role into user_role from public.user_roles where auth_user_fk = (event->>'user_id')::uuid;

    claims := event->'claims';

    if user_role is null then
      claims := jsonb_set(claims, '{user_role}', 'null');
    else
      -- Set the claim
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;
$$;

grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon, public;

grant all
  on table public.user_roles
to supabase_auth_admin;

revoke all
  on table public.user_roles
  from authenticated, anon, public;

create policy "Allow auth admin to read user roles" ON public.user_roles
as permissive for select
to supabase_auth_admin
using (true)
`)
}
