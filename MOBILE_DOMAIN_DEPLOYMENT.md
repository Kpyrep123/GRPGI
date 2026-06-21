# Публикация ПК, web и мобильной версии на домене

Схема домена:

- `sync.grpg-sync.ru` — PocketBase, база, API и realtime.
- `app.grpg-sync.ru` — статический сайт загрузки и браузерная player-only версия.

Разделение клиентов:

- ПК Electron: полное приложение с режимом ДМа, World Config, картой, вторым экраном и редакторами.
- Web: браузерный player-only клиент с внешним видом ПК-интерфейса. Нет режима ДМа, World Config и тяжёлых боевых сцен. Данные берутся из PocketBase и отправляются обратно в PocketBase; постоянный локальный кеш отключён.
- Android: мобильный player-only клиент без режима ДМа и без глобальной карты.

## 1. DNS

В DNS-зоне `grpg-sync.ru` добавь запись:

```text
A  app  161.104.35.195
```

Запись `sync` уже должна указывать на этот же IP.

Проверка:

```powershell
nslookup app.grpg-sync.ru 1.1.1.1
```

Ожидаемый IP:

```text
161.104.35.195
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

После копирования должны открываться:

```text
https://app.grpg-sync.ru
https://app.grpg-sync.ru/app/
```

## 3. Caddy

На сервере открой `/etc/caddy/Caddyfile` и приведи к виду:

```caddy
sync.grpg-sync.ru {
    reverse_proxy 127.0.0.1:8090
}

app.grpg-sync.ru {
    root * /var/www/grpg-app
    file_server
}
```

Потом:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Проверка:

```bash
curl -I https://app.grpg-sync.ru/
curl -I https://app.grpg-sync.ru/app/
```

## 4. Web-версия

Web-версия лежит в:

```text
deploy/site/app/
```

Она использует тот же PocketBase backend:

```text
SERVER_URL: https://sync.grpg-sync.ru
CAMPAIGN_ID: main
```

При открытии браузер попросит ввести параметры подключения. Они не сохраняются в постоянный `localStorage`, поэтому после перезагрузки страницы их нужно ввести заново.

## 5. ПК-версия

Собрать установщик:

```bash
npm install
npm run dist
```

Готовый `.exe` из `dist` положить на сервер:

```powershell
scp "dist\Galactic RPG Interface-Setup-1.0.23.exe" root@161.104.35.195:/var/www/grpg-app/downloads/GRPGI-Setup-latest.exe
```

Если имя файла отличается, просто скопируй нужный установщик под именем:

```text
/var/www/grpg-app/downloads/GRPGI-Setup-latest.exe
```

## 6. Мобильная Android-версия

Установить зависимости и синхронизировать Capacitor:

```bash
npm run mobile:install
npm run mobile:sync
npm run mobile:open:android
```

В Android Studio собрать APK. После сборки положить APK на сервер как:

```text
/var/www/grpg-app/downloads/GRPGI-Mobile-latest.apk
```

## 7. Настройки клиентов

Во всех player-клиентах:

```text
Backend: PocketBase
SERVER_URL: https://sync.grpg-sync.ru
APP_USER_EMAIL: пользователь из app_users
APP_USER_PASSWORD: пароль пользователя из app_users
CAMPAIGN_ID: main
DEVICE_LABEL: имя устройства игрока
```

Логин и пароль `app_users` не публикуй на сайте. Их нужно выдавать игрокам отдельно.


## Юридический минимум для публикации

В патче v1.0.24 добавлена страница `deploy/site/privacy.html` и чекбоксы согласия:

- на странице загрузки `https://app.grpg-sync.ru`;
- в web-клиенте `https://app.grpg-sync.ru/app/`;
- в мобильном клиенте при подключении и входе;
- в ПК-клиенте на экране входа.

Перед публичным запуском заполни в `privacy.html` фактические данные оператора: ФИО/наименование, контактный email, порядок обработки обращений. Без этого политика остаётся техническим шаблоном.
