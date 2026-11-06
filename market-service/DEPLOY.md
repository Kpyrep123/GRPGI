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
# Browser preflight must allow x-grpgi-session:
curl -sS -D - -o /dev/null -X OPTIONS \
  https://sync.grpg-sync.ru/api/grpgi/stock-exchange-v148/order \
  -H 'Origin: https://app.grpg-sync.ru' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,x-grpgi-session'
systemctl status grpgi-market pocketbase --no-pager
ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -15
```

Authenticated exchange responses have API version `200`. Read, order and cancel
requests require the same `X-GRPGI-Session` header as PocketBase. The service
validates it against `POCKETBASE_URL` (default `http://127.0.0.1:8090`); point this
at PocketBase directly, not the public Caddy exchange route. A player can access
only their own account; DM operations use the private credential DM flag.
The quote timer and settlement of accepted pending orders run independently
of browser sessions.

PocketBase should stay available even if the
market service is stopped or reaches its 30% CPU quota.

## Rollback

```bash
systemctl disable --now grpgi-market
# Remove or comment the grpgi_market Caddy handle, then:
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

The old PocketBase route remains disabled until a deliberate rollback.

## Update an existing installation after v212 authentication

After pulling the merged fix, run from the repository checkout on the local computer:

```bash
scp market-service/server.js root@sync.grpg-sync.ru:/opt/grpgi-market-service/server.js
```

Then on the server:

```bash
node --check /opt/grpgi-market-service/server.js
systemctl disable --now grpgi-stock-worker
if [ -f /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js ]; then
  mv /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js \
     /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js.disabled
  systemctl restart pocketbase
fi
systemctl restart grpgi-market
systemctl is-active pocketbase grpgi-market
curl -fsS http://127.0.0.1:8091/health
journalctl -u grpgi-market --since '2 minutes ago' --no-pager
```

This updates the existing service without replacing its environment or databases.
Disable the legacy PocketBase route and worker so two engines cannot settle the
same portfolio. Testing the old worker's endpoint on port 8090 does not test the
public exchange routed to port 8091. After deployment, log into the website again
and verify quote movement, chart history, placing and cancelling an order.
