# PocketBase backend for Galactic RPG Interface

Recommended public URL:

```text
https://sync.grpg-sync.ru
```

The app uses the following PocketBase collections by default:

- `app_users` — Auth collection for application users.
- `campaign_snapshots` — full world/state snapshot.
- `campaign_players` — isolated player states.
- `campaign_messages` — chat messages.
- `campaign_combat_runtime` — active combat scene runtime.
- `campaign_assets` — uploaded images and other campaign assets.

Default campaign id used in examples: `main`.

## Required app settings

In the app, open Sync settings and choose:

```text
Backend: PocketBase
URL: https://sync.grpg-sync.ru
CAMPAIGN_ID: main
APP_USER_EMAIL: dm@grpg-sync.local
APP_USER_PASSWORD: password from app_users
```

The email/password must belong to a normal record in the `app_users` auth collection, not to a PocketBase superuser.

## API rules

For `campaign_snapshots`, `campaign_players`, `campaign_messages`, and `campaign_combat_runtime`, set List/View/Create/Update rules to:

```text
@request.auth.id != ""
```

Delete can stay empty/closed.

For `campaign_assets`, the app can upload with auth, but image display through normal `<img>` URLs is easiest if View/List are public or otherwise accessible without a custom Authorization header. If images do not appear on player machines, check this collection first.

## Current implementation notes

Version `1.0.17` adds a PocketBase backend provider without removing Supabase or the existing self-host provider.

PocketBase realtime is not enabled in this patch. The app uses the existing guarded polling loop. This is intentional for the first migration step: it makes backend errors easier to diagnose in application logs before adding realtime subscriptions.


## Initial migration note (1.0.18)

If PocketBase has no campaign snapshot yet, the first `Отправить в облако` now seeds `campaign_snapshots` even when local metadata still contains an old Supabase/self-host revision. This is expected when moving an existing local campaign to a fresh PocketBase backend.

## Realtime note (1.0.19)

PocketBase realtime is enabled for:

- `campaign_snapshots`
- `campaign_players`
- `campaign_messages`
- `campaign_combat_runtime`

The implementation uses PocketBase `/api/realtime` SSE directly. It subscribes to whole collections and filters records by `campaignId` inside the application. Existing polling remains as a fallback/healing mechanism.
