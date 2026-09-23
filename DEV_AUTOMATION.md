# DEV-публикация и автоматизация

Инструменты появляются в профиле только при двух условиях:

1. приложение запущено из исходников (`npm start`, `app.isPackaged === false`);
2. текущий пользователь имеет роль `gm`, `dm` или `master`.

В установленной Electron-сборке панель отсутствует.

## Кнопка `СОБРАТЬ И ОПУБЛИКОВАТЬ ПК`

Кнопка:

1. проверяет `npm`, `ssh` и `scp`;
2. сравнивает версию с сервером и увеличивает patch только если текущая версия уже опубликована;
3. обновляет `package.json`, `package-lock.json` и `build.buildVersion`;
4. собирает Windows NSIS-установщик;
5. загружает установщик и updater-файлы в `/var/www/grpg-app/downloads`;
6. проверяет SHA-256 на сервере;
7. последним публикует `latest.yml`, после чего версия становится видна игрокам.

Адреса задаются в `devops.config.json`:

```json
{
  "desktopRelease": {
    "target": "/var/www/grpg-app/downloads",
    "publicUrl": "https://app.grpg-sync.ru/downloads",
    "installerAlias": "GRPGI-Setup-latest.exe"
  }
}
```

Git и GitHub не участвуют в сборке, загрузке или проверке обновлений. Репозиторий можно оставить только как резервную историю исходников.

## Кнопка `ДЕПЛОЙ WEB`

Источник:

```text
deploy/site
```

Сервер:

```text
root@161.104.35.195:22
/var/www/grpg-app
```

Деплой выполняется через системные `ssh.exe` и `scp.exe`:

1. проверяется SSH-доступ без запроса пароля;
2. сайт копируется во временную папку;
3. существующий `/downloads` переносится в новую версию;
4. каталог сайта переключается атомарно;
5. проверяются `https://app.grpg-sync.ru/` и `https://app.grpg-sync.ru/app/`;
6. при ошибке возвращается предыдущая версия.

### Одноразовая настройка SSH-ключа

В PowerShell или CMD:

```cmd
ssh-keygen -t ed25519 -f "%USERPROFILE%\.ssh\grpgi_deploy"
type "%USERPROFILE%\.ssh\grpgi_deploy.pub" | ssh root@161.104.35.195 "umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys"
ssh -i "%USERPROFILE%\.ssh\grpgi_deploy" root@161.104.35.195 "echo SSH_OK"
```

Вторая команда один раз запросит пароль сервера. Приватный ключ никому не передаётся.

Путь уже задан в `devops.config.json`:

```json
{
  "webDeploy": {
    "identityFile": "~/.ssh/grpgi_deploy"
  }
}
```

## Кнопка `ZIP ДЛЯ ПЕРЕДАЧИ`

ZIP создаётся для передачи исходников на проверку и изменение. Он не является desktop- или Android-билдом.

Используется список отслеживаемых и новых файлов Git с дополнительными исключениями:

- `.git`;
- `node_modules`;
- `dist`, `out`, `release`, `build`;
- Android build и Gradle cache;
- `renderer/assets/audio` и аудиоформаты;
- `.exe`, `.apk`, `.aab`, архивы и установщики;
- `pb_data`, `world-data`, `user-data`, `.env`, ключи и сертификаты;
- `webapp_work`;
- временные и backup-файлы;
- файлы крупнее 20 МБ.

Правила находятся в `devops.config.json`. В каждый ZIP добавляется `_GRPGI_SOURCE_ARCHIVE_MANIFEST.json` с SHA-256, размерами и причинами исключения файлов.
