# Galactic RPG Interface

Electron-интерфейс настольной RPG с локальным хранением, синхронизацией через PocketBase и поддержкой собственного выделенного sync-сервера.

## Поддерживаемые режимы

- `pocketbase` — основной backend: снапшоты кампании, игроки, чат, боевой runtime, realtime и файлы.
- `selfhost` — выделенный сервер из каталога `sync-server`.
- локальный режим — синхронизация отключена, данные остаются в `userData/world-data`.

Другие backend-провайдеры конфигурацией не принимаются.

## Запуск

Для первого запуска в Windows можно открыть `INSTALL_AND_RUN.cmd`. Скрипт удалит старую папку `node_modules`, выполнит чистую установку и проверит загрузку исполняемого файла Electron.

Вручную:

```bash
npm ci
npm run electron:repair
npm start
```

При обычном `npm start` проверка Electron запускается автоматически. Если загрузка Electron не проходит, проверьте доступ к GitHub, VPN/прокси и антивирус, затем повторите `npm run electron:repair`.

## Сборка

```bash
npm run dist
```

Перед сборкой настройте PocketBase по инструкции `POCKETBASE_SETUP.md` либо выделенный сервер по `SELFHOST_SYNC_SETUP.md`.

## Данные приложения

- `userData/world-data` — редактируемые данные мира и ассеты.
- `userData/galactic-state.json` — состояние приложения.
- `userData/galactic-sync-config.json` — локальная конфигурация PocketBase или выделенного сервера.
- `userData/galactic-read-markers.json` — отметки прочтения.

Старые готовые сборки намеренно не хранятся в исходном архиве: после изменения backend-кода приложение следует собрать заново.

## DEV-публикация и автоматизация

В профиле ДМа при запуске через `npm start` доступна панель для публикации patch-версии в GitHub `main`, прямого SSH-деплоя `deploy/site` и создания очищенного ZIP исходников. Установленная Electron-сборка эту панель не показывает.

Настройка: [`DEV_AUTOMATION.md`](DEV_AUTOMATION.md).
