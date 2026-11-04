-- Dante relational schema proposal. Apply through Supabase SQL editor after
-- setting up Auth users and adding each member to a workspace.
create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','reviewer','creator')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.brand_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  source_type text not null check (source_type in ('fact','rule','term','asset')),
  guidance text not null,
  status text not null default 'pending' check (status in ('pending','approved','archived')),
  version integer not null default 0,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(guidance,''))) stored,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brand_sources_search_idx on public.brand_sources using gin(search_vector);

create table if not exists public.source_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_id uuid not null references public.brand_sources(id) on delete cascade,
  version integer not null,
  guidance text not null,
  approved_by uuid references auth.users(id),
  approved_at timestamptz not null default now(),
  unique(source_id, version)
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  channel text not null,
  body text not null,
  status text not null default 'current' check (status in ('current','needs_review','exception','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_source_links (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  source_id uuid not null references public.brand_sources(id) on delete cascade,
  source_version integer not null,
  primary key(content_id, source_id)
);

create table if not exists public.review_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  source_id uuid not null references public.brand_sources(id) on delete cascade,
  source_version integer not null,
  result text not null,
  evidence jsonb not null default '{}'::jsonb,
  ai_assist jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users(id),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace and wm.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

create or replace function public.has_workspace_role(target_workspace uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = (select auth.uid())
      and wm.role = any(allowed_roles)
  );
$$;
revoke all on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

create or replace function public.search_approved_sources(target_workspace uuid, search_text text)
returns table(id uuid, title text, source_type text, guidance text, rank real)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.title, s.source_type, s.guidance,
    ts_rank(s.search_vector, websearch_to_tsquery('english', search_text)) as rank
  from public.brand_sources s
  where s.workspace_id = target_workspace and s.status = 'approved'
    and public.is_workspace_member(target_workspace)
    and s.search_vector @@ websearch_to_tsquery('english', search_text)
  order by rank desc, s.title;
$$;
revoke all on function public.search_approved_sources(uuid, text) from public;
grant execute on function public.search_approved_sources(uuid, text) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.brand_sources enable row level security;
alter table public.source_versions enable row level security;
alter table public.content_items enable row level security;
alter table public.content_source_links enable row level security;
alter table public.review_findings enable row level security;
alter table public.audit_events enable row level security;

create policy "members can read their workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "members can read workspace membership" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy "members can read sources" on public.brand_sources for select using (public.is_workspace_member(workspace_id));
create policy "members can submit sources" on public.brand_sources for insert with check (public.has_workspace_role(workspace_id, array['admin','reviewer','creator']));
create policy "reviewers can update sources" on public.brand_sources for update using (public.has_workspace_role(workspace_id, array['admin','reviewer'])) with check (public.has_workspace_role(workspace_id, array['admin','reviewer']));
create policy "members can read source versions" on public.source_versions for select using (public.is_workspace_member(workspace_id));
create policy "reviewers can append source versions" on public.source_versions for insert with check (public.has_workspace_role(workspace_id, array['admin','reviewer']));
create policy "members can read content" on public.content_items for select using (public.is_workspace_member(workspace_id));
create policy "members can submit content" on public.content_items for insert with check (public.is_workspace_member(workspace_id));
create policy "reviewers can resolve content" on public.content_items for update using (public.has_workspace_role(workspace_id, array['admin','reviewer'])) with check (public.has_workspace_role(workspace_id, array['admin','reviewer']));
create policy "members can read content links" on public.content_source_links for select using (public.is_workspace_member(workspace_id));
create policy "members can link content" on public.content_source_links for insert with check (public.is_workspace_member(workspace_id));
create policy "reviewers can update content links" on public.content_source_links for update using (public.has_workspace_role(workspace_id, array['admin','reviewer'])) with check (public.has_workspace_role(workspace_id, array['admin','reviewer']));
create policy "members can read findings" on public.review_findings for select using (public.is_workspace_member(workspace_id));
create policy "reviewers can create findings" on public.review_findings for insert with check (public.has_workspace_role(workspace_id, array['admin','reviewer']));
create policy "reviewers can resolve findings" on public.review_findings for update using (public.has_workspace_role(workspace_id, array['admin','reviewer'])) with check (public.has_workspace_role(workspace_id, array['admin','reviewer']));
create policy "members can read audit" on public.audit_events for select using (public.is_workspace_member(workspace_id));
create policy "members can append audit" on public.audit_events for insert with check (public.is_workspace_member(workspace_id));

revoke all on public.workspaces, public.workspace_members, public.brand_sources, public.source_versions,
  public.content_items, public.content_source_links, public.review_findings, public.audit_events from anon;
grant select on public.workspaces, public.workspace_members, public.brand_sources, public.source_versions,
  public.content_items, public.content_source_links, public.review_findings, public.audit_events to authenticated;
grant insert, update on public.brand_sources, public.content_items, public.content_source_links, public.review_findings, public.source_versions to authenticated;
grant insert on public.audit_events to authenticated;

-- Private upload bucket; add Storage object policies scoped to workspace membership
-- before enabling uploads. Keep original PDFs/DOCX files private.
insert into storage.buckets(id, name, public) values ('dante-sources', 'dante-sources', false)
on conflict (id) do nothing;

create policy "workspace members read private Dante uploads" on storage.objects for select to authenticated
using (bucket_id = 'dante-sources' and exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id::text = (storage.foldername(name))[1] and wm.user_id = (select auth.uid())
));
create policy "workspace members add private Dante uploads" on storage.objects for insert to authenticated
with check (bucket_id = 'dante-sources' and exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id::text = (storage.foldername(name))[1] and wm.user_id = (select auth.uid())
));

-- Compatibility state store for the current interactive prototype. Each signed-in
-- user receives an isolated workspace snapshot; the normalized tables above remain
-- the target for the next migration and cross-member collaboration.
create table if not exists public.dante_workspace_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.dante_workspace_state enable row level security;
revoke all on public.dante_workspace_state from anon;
grant select, insert, update on public.dante_workspace_state to authenticated;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dante_workspace_state'
      and policyname = 'users manage their Dante workspace state'
  ) then
    create policy "users manage their Dante workspace state" on public.dante_workspace_state
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;
