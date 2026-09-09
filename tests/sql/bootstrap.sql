-- Disposable PostgreSQL fixture only. Never execute against Supabase production.
create role authenticator login noinherit;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon,authenticated to authenticator;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create table storage.buckets (id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant all on all tables in schema storage to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
