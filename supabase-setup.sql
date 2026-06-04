create table if not exists public.campaign_snapshots (
  campaign_id text primary key,
  revision bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  client_updated_at timestamptz,
  world_json jsonb not null default '{}'::jsonb,
  state_json jsonb not null default '{}'::jsonb
);

alter table public.campaign_snapshots enable row level security;

drop policy if exists "campaign_snapshots_select_anon" on public.campaign_snapshots;
create policy "campaign_snapshots_select_anon"
on public.campaign_snapshots
for select
to anon
using (true);

drop policy if exists "campaign_snapshots_insert_anon" on public.campaign_snapshots;
create policy "campaign_snapshots_insert_anon"
on public.campaign_snapshots
for insert
to anon
with check (true);

drop policy if exists "campaign_snapshots_update_anon" on public.campaign_snapshots;
create policy "campaign_snapshots_update_anon"
on public.campaign_snapshots
for update
to anon
using (true)
with check (true);

create index if not exists campaign_snapshots_updated_at_idx
on public.campaign_snapshots (updated_at desc);

insert into storage.buckets (id, name, public)
values ('campaign-assets', 'campaign-assets', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "campaign_assets_select_public" on storage.objects;
create policy "campaign_assets_select_public"
on storage.objects
for select
to public
using (bucket_id = 'campaign-assets');

drop policy if exists "campaign_assets_insert_anon" on storage.objects;
create policy "campaign_assets_insert_anon"
on storage.objects
for insert
to anon
with check (bucket_id = 'campaign-assets');

drop policy if exists "campaign_assets_update_anon" on storage.objects;
create policy "campaign_assets_update_anon"
on storage.objects
for update
to anon
using (bucket_id = 'campaign-assets')
with check (bucket_id = 'campaign-assets');


create table if not exists public.campaign_players (
  campaign_id text not null,
  player_id text not null,
  version bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  client_updated_at timestamptz,
  deleted_at timestamptz,
  player_json jsonb not null default '{}'::jsonb,
  primary key (campaign_id, player_id)
);

alter table public.campaign_players enable row level security;

drop policy if exists "campaign_players_select_anon" on public.campaign_players;
create policy "campaign_players_select_anon"
on public.campaign_players
for select
to anon
using (true);

drop policy if exists "campaign_players_insert_anon" on public.campaign_players;
create policy "campaign_players_insert_anon"
on public.campaign_players
for insert
to anon
with check (true);

drop policy if exists "campaign_players_update_anon" on public.campaign_players;
create policy "campaign_players_update_anon"
on public.campaign_players
for update
to anon
using (true)
with check (true);

create index if not exists campaign_players_campaign_updated_idx
on public.campaign_players (campaign_id, updated_at asc);

create index if not exists campaign_players_campaign_deleted_idx
on public.campaign_players (campaign_id, deleted_at);


create table if not exists public.campaign_messages (
  campaign_id text not null,
  message_id text not null,
  kind text not null check (kind in ('direct', 'npc')),
  thread_key text not null,
  sender_type text not null default 'player',
  sender_id text,
  recipient_player_id text,
  npc_id text,
  direct_a text,
  direct_b text,
  author_label text,
  body_html text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  edited_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  client_updated_at timestamptz,
  primary key (campaign_id, message_id)
);

alter table public.campaign_messages enable row level security;

drop policy if exists "campaign_messages_select_anon" on public.campaign_messages;
create policy "campaign_messages_select_anon"
on public.campaign_messages
for select
to anon
using (true);

drop policy if exists "campaign_messages_insert_anon" on public.campaign_messages;
create policy "campaign_messages_insert_anon"
on public.campaign_messages
for insert
to anon
with check (true);

drop policy if exists "campaign_messages_update_anon" on public.campaign_messages;
create policy "campaign_messages_update_anon"
on public.campaign_messages
for update
to anon
using (true)
with check (true);

create index if not exists campaign_messages_campaign_updated_idx
on public.campaign_messages (campaign_id, updated_at asc);

create index if not exists campaign_messages_thread_updated_idx
on public.campaign_messages (campaign_id, thread_key, updated_at asc);
