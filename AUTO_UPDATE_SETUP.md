# Auto Update Setup for GRPGI

Автообновление подключено через `electron-updater` и GitHub Releases.

Текущий репозиторий обновлений:

```text
https://github.com/Kpyrep123/GRPGI
```

Текущая версия приложения:

```text
1.0.2
```

## 1. Установить зависимости

```bash
npm install
```

Если зависимости уже стоят из старой сборки, отдельно:

```bash
npm install electron-updater@^6.8.3
```

## 2. Локальная сборка без публикации

```bash
npm run release:local
```

Это соберёт Windows NSIS installer локально, но не отправит его в GitHub Releases.

## 3. Ручная публикация релиза с компьютера

Нужен GitHub token в переменной окружения `GH_TOKEN` с правом записи в Releases.

```bash
npm run release
```

`electron-builder` должен загрузить installer и `latest.yml` в GitHub Release.

## 4. Публикация через GitHub Actions

Я добавил workflow:

```text
.github/workflows/release.yml
```

Он запускается:

- вручную через `Actions → Build and publish Electron release → Run workflow`;
- автоматически при push тега вида `v1.0.2`.

Команды для release через tag:

```bash
git add .
git commit -m "Release 1.0.2"
git tag v1.0.2
git push origin main
git push origin v1.0.2
```

GitHub Actions использует встроенный `${{ secrets.GITHUB_TOKEN }}`.

## 5. Поведение приложения

- Проверка обновлений запускается при старте только в packaged build.
- В dev-режиме будет статус: updater работает только в собранном приложении.
- В профиле есть панель обновлений: проверить, скачать, перезапустить и установить.

## 6. Важно

Автообновление нормально работает с NSIS installer. Portable `.exe` для этой схемы использовать не стоит.

Для проверки автообновления нужна следующая версия выше текущей. Например, если установлен build `1.0.2`, следующий релиз должен быть `1.0.3`.
