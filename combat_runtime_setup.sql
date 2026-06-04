create table if not exists public.campaign_combat_runtime (
  campaign_id text primary key,
  revision bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  client_updated_at timestamptz,
  active_scene_id text,
  scene_json jsonb not null default '{}'::jsonb,
  runtime_json jsonb not null default '{}'::jsonb
);

alter table public.campaign_combat_runtime enable row level security;

drop policy if exists "campaign_combat_runtime_select_anon" on public.campaign_combat_runtime;
create policy "campaign_combat_runtime_select_anon"
on public.campaign_combat_runtime
for select
to anon
using (true);

drop policy if exists "campaign_combat_runtime_insert_anon" on public.campaign_combat_runtime;
create policy "campaign_combat_runtime_insert_anon"
on public.campaign_combat_runtime
for insert
to anon
with check (true);

drop policy if exists "campaign_combat_runtime_update_anon" on public.campaign_combat_runtime;
create policy "campaign_combat_runtime_update_anon"
on public.campaign_combat_runtime
for update
to anon
using (true)
with check (true);

create index if not exists campaign_combat_runtime_updated_at_idx
on public.campaign_combat_runtime (updated_at desc);
