# Публикация ПК, APK и веб-версии на домене

Схема домена:

- `sync.grpg-sync.ru` — PocketBase, база, API и realtime.
- `app.grpg-sync.ru` — статический сайт загрузки и веб-версия player-only клиента.

## Что изменилось

Веб-версия находится в:

```text
deploy/site/app/
```

Это браузерная сборка мобильного клиента. В ней нет режима ДМа и нет галактической карты. Вместо карты используется лёгкий навигатор по системам и планетам.

В браузере локальное хранение отключено: конфигурация, сессия и кеш не пишутся в `localStorage` / `Preferences`. После обновления страницы пользователь заново вводит параметры подключения и логин персонажа. Игровые изменения сохраняются в PocketBase.

## 1. DNS

В DNS-зоне `grpg-sync.ru` должны быть записи:

```text
A  sync  161.104.35.195
A  app   161.104.35.195
```

## 2. Подготовка сайта на сервере

На сервере:

```bash
mkdir -p /var/www/grpg-app/downloads
```

Скопируй содержимое папки `deploy/site` из проекта в `/var/www/grpg-app`:

```powershell
scp -r deploy/site/* root@161.104.35.195:/var/www/grpg-app/
```

После этого веб-клиент будет лежать здесь:

```text
/var/www/grpg-app/app/index.html
```

## 3. Caddy

Файл `/etc/caddy/Caddyfile`:

```caddy
sync.grpg-sync.ru {
    reverse_proxy 127.0.0.1:8090
}

app.grpg-sync.ru {
    root * /var/www/grpg-app
    file_server
}
```

Проверка и перезагрузка:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Проверка:

```bash
curl -I https://app.grpg-sync.ru/
curl -I https://app.grpg-sync.ru/app/
```

## 4. ПК-версия

Сборка установщика:

```bash
npm install
npm run dist
```

Готовый `.exe` из `dist` положить на сервер:

```powershell
scp "dist\Galactic RPG Interface-Setup-1.0.22.exe" root@161.104.35.195:/var/www/grpg-app/downloads/GRPGI-Setup-latest.exe
```

В ПК-клиенте в профиле теперь находится блок `Загрузка приложения`, который ведёт на страницу загрузки и веб-версию.

## 5. Android APK

```bash
npm run mobile:install
npm run mobile:sync
npm run mobile:open:android
```

В Android Studio собрать APK и положить его на сервер как:

```text
/var/www/grpg-app/downloads/GRPGI-Mobile-latest.apk
```

## 6. Веб-версия

Открывается по адресу:

```text
https://app.grpg-sync.ru/app/
```

Параметры подключения:

```text
Backend: PocketBase
SERVER_URL: https://sync.grpg-sync.ru
APP_USER_EMAIL: пользователь из app_users
APP_USER_PASSWORD: пароль пользователя из app_users
CAMPAIGN_ID: main
DEVICE_LABEL: web-player
```

## 7. Что не входит в веб-версию

- режим ДМа;
- World Config;
- редакторы;
- глобальная галактическая карта;
- второй экран;
- локальное файловое хранилище Electron.

Остальные player-facing функции работают через облако: профиль, навигатор, архив, торговый терминал, чат, бой, навыки, репутация и гостевой вход.
