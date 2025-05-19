import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import Database from 'postgres'
import drizzleConfig from '../../../../drizzle.config'
import * as schema from '../schema'

const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
const db = drizzle(postgres, { schema })

await db.execute(sql`
grant usage on schema public to supabase_auth_admin;

create or replace function public.custom_access_token_hook(event jsonb) returns jsonb as $$
  declare
    claims jsonb;
    user_role public.app_role;
    user_permissions jsonb;
  begin
    -- Fetch the user role in the user_roles table
    select role into user_role from public.user_roles where user_fk = (event->>'user_id')::uuid;

    claims := event->'claims';

    if user_role is not null then
      -- Set the claim for user role
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));

      -- Fetch permissions for the user role
      select jsonb_agg(permission) into user_permissions
      from public.role_permissions
      where role = user_role;

      -- Set the permissions claim
      claims := jsonb_set(claims, '{user_permissions}', coalesce(user_permissions, '[]'::jsonb));
    else
      claims := jsonb_set(claims, '{user_role}', 'null');
      claims := jsonb_set(claims, '{user_permissions}', '[]'::jsonb);
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;
$$ language plpgsql security definer set search_path = '';

grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon, public;

grant all
  on table public.user_roles
  to supabase_auth_admin;

grant all
  on table public.role_permissions
  to supabase_auth_admin;

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
`)

await postgres.end()
