# Развёртывание серверной биржи 1.0.148

Биржа работает непосредственно с `campaign_snapshots` и `campaign_players` рабочего PocketBase. Состояние цен и заявок хранится в отдельной служебной SQLite-таблице `grpgi_stock_exchange_state_v148`; hooks создают её автоматически. Существующие коллекции, hooks и Caddy-маршруты не заменяются.

## 1. Подготовка исходников

На локальном компьютере после слияния PR:

```bash
git switch main
git pull origin main
node --check pocketbase/pb_hooks/grpgi_stock_exchange_v148.js
node --check pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js
node tests/v148-pocketbase-stock.mjs
```

Если сервер получает архив `src`, убедитесь, что в нём есть:

```text
pocketbase/pb_hooks/grpgi_stock_exchange_v148.js
pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js
stock-worker/worker.js
stock-worker/package.json
stock-worker/grpgi-stock-worker.service
```

## 2. Резервная копия

На сервере:

```bash
sudo systemctl stop grpgi-stock-worker 2>/dev/null || true
sudo systemctl stop pocketbase
sudo install -d -m 700 /opt/backups
sudo tar -C /opt -czf "/opt/backups/pocketbase-before-stock-v148-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" pocketbase
sudo systemctl start pocketbase
```

Проверьте, что PocketBase вернулся:

```bash
curl -fsS http://127.0.0.1:8090/api/health
```

## 3. Загрузка hooks из распакованного `src`

Ниже `/root/grpgi-src` — пример каталога распакованного архива. Каталог `pb_hooks` целиком не удалять и не заменять.

```bash
sudo install -o pocketbase -g pocketbase -m 0640 \
  /root/grpgi-src/pocketbase/pb_hooks/grpgi_stock_exchange_v148.js \
  /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.js

sudo install -o pocketbase -g pocketbase -m 0640 \
  /root/grpgi-src/pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js \
  /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js

sudo systemctl restart pocketbase
sudo journalctl -u pocketbase -n 100 --no-pager
```

После перезапуска неавторизованный маршрут должен вернуть `401`:

```bash
curl -i 'https://sync.grpg-sync.ru/api/grpgi/stock-exchange-v148?campaignId=main&playerId=test'
```

Ответ `404` означает, что hooks не загрузились. В этом случае worker не запускать и сначала проверить журнал PocketBase.

## 4. Установка секундного worker

```bash
sudo install -d -o pocketbase -g pocketbase -m 0750 /opt/grpgi-stock-worker
sudo install -o pocketbase -g pocketbase -m 0640 \
  /root/grpgi-src/stock-worker/worker.js \
  /root/grpgi-src/stock-worker/package.json \
  /opt/grpgi-stock-worker/

sudo install -o root -g root -m 0644 \
  /root/grpgi-src/stock-worker/grpgi-stock-worker.service \
  /etc/systemd/system/grpgi-stock-worker.service
```

Создайте отдельный токен worker:

```bash
WORKER_TOKEN="$(openssl rand -hex 32)"
sudo sh -c "umask 077; printf '%s\n' \
  'POCKETBASE_URL=http://127.0.0.1:8090' \
  'GRPGI_STOCK_WORKER_TOKEN=$WORKER_TOKEN' \
  'STOCK_TICK_MS=1000' \
  > /etc/grpgi-stock-worker.env"
```

Тот же токен должен быть доступен процессу PocketBase. Для systemd создайте drop-in:

```bash
sudo systemctl edit pocketbase
```

Содержимое:

```ini
[Service]
EnvironmentFile=/etc/grpgi-stock-worker.env
```

Примените настройки и запустите worker:

```bash
sudo systemctl daemon-reload
sudo systemctl restart pocketbase
sudo systemctl enable --now grpgi-stock-worker
sudo systemctl status grpgi-stock-worker --no-pager
sudo journalctl -u grpgi-stock-worker -n 100 --no-pager
```

## 5. Проверка

У служебного маршрута неверный токен должен давать `401`:

```bash
curl -i -X POST http://127.0.0.1:8090/api/grpgi/stock-exchange-v148/tick \
  -H 'X-GRPGI-Worker-Token: incorrect'
```

Корректный вызов:

```bash
set -a
. /etc/grpgi-stock-worker.env
set +a
curl -fsS -X POST "$POCKETBASE_URL/api/grpgi/stock-exchange-v148/tick" \
  -H "X-GRPGI-Worker-Token: $GRPGI_STOCK_WORKER_TOKEN"
```

Ответ должен содержать `"ok":true`, `serverTime` и список кампаний. Затем войдите тестовым игроком, откройте биржу и проверьте, что `lastTick` меняется раз в секунду. Создайте небольшую лимитную заявку и убедитесь, что она исполняется при закрытом клиенте.

## 6. Деплой клиентов

Только после успешной серверной проверки публикуйте `deploy/site` и собирайте приложение 1.0.148. Сначала обновляется сервер, затем сайт, затем установщик приложения.

## Откат

```bash
sudo systemctl disable --now grpgi-stock-worker
sudo rm -f /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.js
sudo rm -f /opt/pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js
sudo systemctl restart pocketbase
```

Служебную таблицу при обычном откате удалять не нужно: она не влияет на старые версии и сохраняет заявки для повторного включения.
