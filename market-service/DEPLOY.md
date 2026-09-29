# GRPGI Market Service v2

This service isolates the stock exchange from PocketBase. It keeps quotes, candles,
orders and DM events in its own SQLite database. Existing v148 API paths remain
compatible; Caddy directs only those paths to port 8091.

## Safety first

Keep the old route and worker disabled during installation:

```bash
systemctl disable --now grpgi-stock-worker
test ! -f /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js ||
  mv /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js \
     /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js.disabled
systemctl restart pocketbase
```

## Install

From the repository checkout:

```bash
install -d -o pocketbase -g pocketbase /opt/grpgi-market-service
install -d -o pocketbase -g pocketbase /var/lib/grpgi-market
install -o pocketbase -g pocketbase -m 0644 market-service/server.js /opt/grpgi-market-service/server.js
install -o pocketbase -g pocketbase -m 0644 market-service/package.json /opt/grpgi-market-service/package.json
install -o root -g root -m 0644 market-service/grpgi-market.service /etc/systemd/system/grpgi-market.service
install -o root -g pocketbase -m 0640 market-service/grpgi-market.env.example /etc/grpgi-market.env
```

Set the same random worker token already used by the deployment:

```bash
editor /etc/grpgi-market.env
```

Add the contents of `market-service/Caddyfile.snippet` before the general
PocketBase reverse proxy in the active Caddyfile, then validate:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now grpgi-market
systemctl reload caddy
```

## Verify before opening the UI

```bash
curl -fsS http://127.0.0.1:8091/health | jq
curl -fsS "http://127.0.0.1:8091/api/grpgi/stock-exchange-v148?campaignId=main&playerId=PLAYER_ID" |
  jq '{ok,version,lastTick,quoteCount:(.quotes|length)}'
systemctl status grpgi-market pocketbase --no-pager
ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -15
```

Expected API version is `200`. PocketBase should stay available even if the
market service is stopped or reaches its 30% CPU quota.

## Rollback

```bash
systemctl disable --now grpgi-market
# Remove or comment the grpgi_market Caddy handle, then:
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

The old PocketBase route remains disabled until a deliberate rollback.

