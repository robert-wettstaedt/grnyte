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

    -- First check if user has a global role with this permission
    select role into user_role from public.user_roles where user_roles.auth_user_fk = user_id;

    select count(*)
    into bind_permissions
    from public.role_permissions
    where role_permissions.permission = requested_permission
      and role_permissions.role = user_role;

    -- If user has global permission, return true
    if bind_permissions > 0 then
      return true;
    end if;

    -- Otherwise, check region-specific role
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

-- Function to set the current region context for subsequent operations
create or replace function public.set_region_context(region_id int) returns void as $$
begin
  perform set_config('app.current_region_id', region_id::text, false);
end;
$$ language plpgsql volatile security definer;

-- Function for use in RLS policies to check if a user has access to content in a specific region
create or replace function public.has_region_access(region_id int) returns boolean as $$
  declare
    user_id uuid;
    is_authorized boolean;
  begin
    select (auth.jwt() ->> 'sub')::uuid into user_id;

    -- Check if user is an admin (has global rights)
    select authorize('data.read') into is_authorized;
    if is_authorized then
      return true;
    end if;

    -- Check if user is a member of the region
    return exists (
      select 1
      from public.region_members
      where auth_user_fk = user_id
        and region_fk = region_id
        and is_active = true
    );
  end;
$$ language plpgsql stable security definer set search_path = '';

-- Grant execute permissions to authenticated users
grant execute on function public.authorize_in_region to authenticated;
grant execute on function public.set_region_context to authenticated;
grant execute on function public.has_region_access to authenticated;
`)
}
