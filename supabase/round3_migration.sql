-- Round 3: shared workspaces, roles, invitations, and private document storage.
-- Run after the existing dante_workspace_state table has been created.
create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Dante Workspace',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null check (role in ('admin','reviewer','creator')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
alter table public.workspace_members add column if not exists email text not null default '';

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','reviewer','creator')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.dante_workspace_state add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
do $$
declare r record; wid uuid; member_email text;
begin
  for r in select user_id,state from public.dante_workspace_state where workspace_id is null loop
    insert into public.workspaces(name) values (coalesce(nullif(r.state #>> '{workspace,name}',''),'Dante Workspace')) returning id into wid;
    select coalesce(email,'') into member_email from auth.users where id=r.user_id;
    insert into public.workspace_members(workspace_id,user_id,email,role) values (wid,r.user_id,coalesce(member_email,''),'admin') on conflict do nothing;
    update public.dante_workspace_state set workspace_id=wid where user_id=r.user_id;
  end loop;
end $$;

do $$ declare pk_name text;
begin
  select c.conname into pk_name from pg_constraint c where c.conrelid='public.dante_workspace_state'::regclass and c.contype='p';
  if pk_name is not null then execute format('alter table public.dante_workspace_state drop constraint %I',pk_name); end if;
end $$;
alter table public.dante_workspace_state alter column workspace_id set not null;
alter table public.dante_workspace_state add constraint dante_workspace_state_pkey primary key(workspace_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.dante_workspace_state enable row level security;

create or replace function public.is_dante_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members wm where wm.workspace_id=target_workspace and wm.user_id=(select auth.uid()));
$$;
revoke all on function public.is_dante_workspace_member(uuid) from public,anon;
grant execute on function public.is_dante_workspace_member(uuid) to authenticated;

drop policy if exists "members can read their workspaces" on public.workspaces;
create policy "members can read their workspaces" on public.workspaces for select to authenticated using (public.is_dante_workspace_member(id));
drop policy if exists "members can read workspace membership" on public.workspace_members;
create policy "members can read workspace membership" on public.workspace_members for select to authenticated using (public.is_dante_workspace_member(workspace_id));
drop policy if exists "members can read workspace state" on public.dante_workspace_state;
create policy "members can read workspace state" on public.dante_workspace_state for select to authenticated using (public.is_dante_workspace_member(workspace_id));
drop policy if exists "users manage their Dante workspace state" on public.dante_workspace_state;
drop policy if exists "members update workspace state" on public.dante_workspace_state;

revoke all on public.workspace_invitations from anon,authenticated;
revoke insert,update,delete on public.workspaces,public.workspace_members,public.dante_workspace_state from anon,authenticated;
grant select on public.workspaces,public.workspace_members,public.dante_workspace_state to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('dante-sources','dante-sources',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "workspace members read private Dante uploads" on storage.objects;
drop policy if exists "workspace members add private Dante uploads" on storage.objects;
create policy "workspace members read private Dante uploads" on storage.objects for select to authenticated using (
  bucket_id='dante-sources' and public.is_dante_workspace_member(((storage.foldername(name))[1])::uuid)
);
create policy "workspace members add private Dante uploads" on storage.objects for insert to authenticated with check (
  bucket_id='dante-sources' and public.is_dante_workspace_member(((storage.foldername(name))[1])::uuid)
);

create or replace function public.accept_dante_workspace_invite(invite_hash text)
returns table(workspace_id uuid, workspace_name text, member_role text)
language plpgsql security definer set search_path = '' as $$
declare invite public.workspace_invitations%rowtype; user_email text;
begin
  select lower(coalesce(auth.jwt()->>'email','')) into user_email;
  select * into invite from public.workspace_invitations wi
    where wi.token_hash=invite_hash and wi.accepted_at is null and wi.expires_at>now() and lower(wi.email)=user_email
    for update;
  if not found then raise exception 'Invite is invalid, expired, already used, or belongs to a different email.'; end if;
  insert into public.workspace_members(workspace_id,user_id,email,role)
    values (invite.workspace_id,(select auth.uid()),user_email,invite.role)
    on conflict (workspace_id,user_id) do nothing;
  update public.workspace_invitations set accepted_at=now() where id=invite.id;
  return query select w.id,w.name,invite.role from public.workspaces w where w.id=invite.workspace_id;
end $$;
revoke all on function public.accept_dante_workspace_invite(text) from public,anon;
grant execute on function public.accept_dante_workspace_invite(text) to authenticated;
