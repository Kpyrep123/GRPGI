# DEV-публикация и автоматизация

Инструменты появляются в профиле только при двух условиях:

1. приложение запущено из исходников (`npm start`, `app.isPackaged === false`);
2. текущий пользователь имеет роль `gm`, `dm` или `master`.

В установленной Electron-сборке панель отсутствует.

## Кнопка `PATCH → GITHUB MAIN`

Кнопка:

1. проверяет Git, remote и репозиторий `Kpyrep123/GRPGI`;
2. проверяет, что `origin/main` является предком текущего `HEAD`;
3. блокирует секреты, пользовательские данные, файлы от 95 МБ и неожиданные удаления;
4. увеличивает только patch-часть версии;
5. обновляет `package.json`, `package-lock.json` и `build.buildVersion`;
6. выполняет `git add -A`, commit и push `HEAD:main`.

По умолчанию Git tag не создаётся и Electron/Android build не запускается. Это задаётся полем:

```json
{
  "github": {
    "createTag": false
  }
}
```

GitHub CLI не требуется. Используется обычный `git push` и авторизация Git for Windows/Git Credential Manager.

### Защита от случайного удаления

Публикация блокирует удаления критических путей из `github.protectedDeletionPrefixes` и `github.protectedDeletionPaths`. Также ограничено количество остальных удалений.

Это важно для папок, которые могли отсутствовать в переданном patch-архиве. Например, массовое удаление `mobile/**` остановит публикацию.

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
