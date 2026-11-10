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
install -o pocketbase -g pocketbase -m 0644 market-service/server.js market-service/accounting-v213.js market-service/stock-motion-v165.js /opt/grpgi-market-service/
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

Authenticated exchange responses have API version `213`. Read, order and cancel
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
scp market-service/server.js market-service/accounting-v213.js root@sync.grpg-sync.ru:/opt/grpgi-market-service/
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

## v213: attached protection, commissions, DM portfolio and credit grants

The deployed exchange is the independent service on 8091. v213 does not change
the intentionally disabled legacy PocketBase exchange engine.

- New tickets choose a market or limit entry and optional absolute stop-loss and
  take-profit prices. Long: stop below entry, take above; short: the reverse.
  Protected exits are created only after the opening order fills. One exit fills
  and cancels its sibling (OCO). Cancelling either exit cancels both. Execution
  uses the available server quote; a stop price is not a guaranteed fill price.
- Partial manual closes reduce outstanding protection. When multiple protected
  entries share an aggregated position, remaining protection is allocated oldest
  first. Full close and liquidation leave no usable protection for an empty position.
  Existing standalone protective orders remain supported for compatibility.
- Opening and closing pay `MARKET_TRADE_FEE_RATE` (default 0.001 = 0.1%) on gross
  traded value. An opening requires both collateral and commission. Each tick
  accrues `MARKET_BORROW_DAILY_RATE` (0.0003 = 0.03%/day) on entry cost minus
  collateral, and `MARKET_CUSTODY_DAILY_RATE` (0.0001 = 0.01%/day) on current
  position value, for both long and short positions. Rates are game defaults,
  configurable in `/etc/grpgi-market.env`, not universal real-exchange tariffs.
- Time is real elapsed seconds / 86400, including service downtime and time offline.
  Custody uses the current quote when accrual runs. First observation of an old
  position starts its accrual clock, with no retrospective installation charge.
  Charges are deducted from cash and shown in daily ledger summaries; cash can
  become negative, preventing new entries without sufficient funds. Closing remains
  possible and proceeds first repay a negative cash balance. No fee is levied for
  placing or cancelling an unfilled order. Client normalization preserves clocks.
- World Config's character card has a live stock editor immediately below inventory.
  Add/edit/delete long or short, quantity, entry price and leverage. Adding the same
  stock/side merges cost and collateral, yielding effective weighted leverage.
  Granting collateral does not debit cash; deleting does not credit cash. Editing
  or deleting cancels attached protection; unrelated pending entry orders remain.
  Every mutation is DM-authorized, checks concurrent position changes and uses a
  persistent operation receipt. Saving the rest of the form retains the live portfolio.
- Credits use `/api/grpgi/auth-v212/credits/grant`: private DM session, backend campaign,
  transactional receipt and no duplicate credit on retry. The renderer now reads
  lexical `Sync.config`, replacing stale retries containing a blank campaign.

After merging and pulling, from the local repository folder:

```bash
scp market-service/server.js market-service/accounting-v213.js root@sync.grpg-sync.ru:/opt/grpgi-market-service/
scp pocketbase/pb_hooks/grpgi_auth_v212.js pocketbase/pb_hooks/grpgi_auth_v212.pb.js root@sync.grpg-sync.ru:/opt/pocketbase/pb_hooks/
```

On the server:

```bash
node --check /opt/grpgi-market-service/server.js
node --check /opt/grpgi-market-service/accounting-v213.js
systemctl restart pocketbase
systemctl restart grpgi-market
systemctl is-active pocketbase grpgi-market
curl -fsS http://127.0.0.1:8091/health
journalctl -u grpgi-market --since '2 minutes ago' --no-pager
```

No manual migration and no environment replacement are needed for the defaults.
SQLite columns and receipt table are added automatically, preserving data. Do not
re-enable the old stock worker or legacy route. Publish `deploy/site/app` through
the existing website deployment and restart/rebuild the desktop app to load the
updated main/preload/renderer. Android builds obtain these web changes via
`tools/prepare-mobile.cjs` from `deploy/site/app`. The legacy `mobile/www` and `webapp_work` trees are
not the deployed website and are not upgraded by this service release.

Checks (run from the repository root):

```bash
node tests/market-accounting-v213.cjs
POCKETBASE_BIN=/path/to/pocketbase python tests/market-session-v212.integration.py
HAPPY_DOM_MODULE=/path/to/happy-dom/lib/index.js node tests/stock-config-v213.dom.mjs
HAPPY_DOM_MODULE=/path/to/happy-dom/lib/index.js node tests/stock-orders-v213.dom.mjs
```


## v222 · Доходность биржи (история)

Обычные котировки больше не тянет к ориентиру. При стандартной волатильности
скачок новости имеет размер от 2,5% до 7,5% в любую сторону и возникает в среднем
раз в час на тикер. Генератор использует закрытый ключ кампании в SQLite.
Котировка и свечи общие для всех участников кампании.

Когда совокупная нереализованная прибыль открытых позиций по тикеру превышает
0,3% от их суммарной стоимости входа, вероятность обычного тика против перевеса
лонгов или шортов плавно растёт с 50% до 55%. Верхний предел достигается
при 2% совокупной прибыли и перевесе в одну сторону. При равном количестве
лонгов и шортов вероятность составляет 50%. Величина обычного движения,
новостные скачки и команды ДМа от открытых позиций не зависят. Тарифы открытия, закрытия и удержания берутся из действующих настроек.

После обновления локального репозитория скопируйте на сервер три файла:

```bash
scp market-service/server.js market-service/accounting-v213.js market-service/stock-motion-v165.js root@sync.grpg-sync.ru:/opt/grpgi-market-service/
```

На сервере:

```bash
systemctl restart grpgi-market
systemctl is-active grpgi-market
curl -fsS http://127.0.0.1:8091/health
```

Проверка версии модели в ответе health — `"motion":"risk-v222"`.
Сервис сам добавит таблицу ключей. Текущие котировки, свечи, позиции и заявки
остаются в действующих базах. Для этого изменения достаточно перезапуска
`grpgi-market`. Веб-клиент, приложение и PocketBase отдельно не обновляются.

Симуляция с комиссией 0,1% за исполнение:

```bash
node tests/market-risk-v222.cjs
```


## v223 · Переключатель режима потерь

На бирже выберите любую акцию и откройте «Управление ДМа». Переключатель
«Режим потерь для всей кампании» по умолчанию выключен. Настройка хранится в SQLite
и применяется к будущим тикам. В обычном режиме позиции не влияют на цену.
Во включённом режиме предельная вероятность движения против перевеса составляет
52,5%. Средний интервал новостных скачков в обоих режимах — два часа на тикер
при независимой генерации. В обычном режиме комиссия за исполнение вдвое
ниже ставки сервиса. При настройках по умолчанию это 0,05% вместо 0,1%.
Действующая ставка применяется в момент исполнения заявки. Плата за хранение
и заём сохраняет действующие ставки.

После `git pull --ff-only origin main` и Deploy Web из локального репозитория:

```bash
scp market-service/server.js market-service/accounting-v213.js market-service/stock-motion-v165.js root@sync.grpg-sync.ru:/opt/grpgi-market-service/
ssh root@sync.grpg-sync.ru "systemctl restart grpgi-market && systemctl is-active grpgi-market && curl -fsS http://127.0.0.1:8091/health"
```

Проверьте `"motion":"risk-v223"` в ответе health. Таблица настроек создаётся
при старте сервиса. Для переключателя в Electron обновите и перезапустите приложение.
