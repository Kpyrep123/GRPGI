# Self-host realtime sync

Сервер заменяет Supabase для синхронизации кампании. Он хранит данные на диске в JSON-файлах и отдаёт realtime-события через SSE. База ограничена только размером диска.

## Запуск на машине ДМа или отдельном сервере

```bash
cd sync-server
export SYNC_TOKEN="замени-на-длинный-случайный-токен"
export PUBLIC_BASE_URL="http://<tailscale-ip-или-magicdns>:8787"
docker compose up -d --build
```

Проверка:

```bash
curl -H "Authorization: Bearer $SYNC_TOKEN" http://127.0.0.1:8787/health
```

## Tailscale

1. Установи Tailscale на сервер и на компьютеры игроков.
2. Подключи все устройства к одному tailnet.
3. В приложении укажи `SERVER_URL` как `http://<tailscale-ip>:8787` или MagicDNS-имя.
4. В `ACCESS_TOKEN` укажи тот же `SYNC_TOKEN`.

Порт наружу в интернет открывать не нужно, если все клиенты ходят через Tailscale.

## Что синхронизируется realtime

- world snapshot: статьи, планеты, навыки, организации, кампании с тикерами, сцены и прочее;
- игроки и изменения профиля;
- чат;
- runtime боя;
- изображения и ассеты, которые раньше уходили в Supabase Storage.

Polling оставлен только как fallback, если realtime-соединение временно разорвалось.
