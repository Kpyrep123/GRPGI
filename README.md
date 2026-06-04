# Galactic RPG Interface — Supabase sync build

## Запуск
```bash
npm install
npm start
```

## Что добавлено в этой версии
- локальный runtime-state и мир по-прежнему сохраняются в Electron `userData`
- добавлена настройка Supabase через `SYNC_PANEL`
- на старте и при логине приложение проверяет, нет ли в облаке более новой ревизии
- при сохранении приложение сначала пишет локально, потом проверяет ревизию в Supabase и пушит снапшот только если никто не успел изменить его раньше
- при конфликте облако не перезаписывается автоматически
- доступно ручное `TEST_CONNECTION`, `PULL_NEWER`, `PUSH_LOCAL`

## Структура данных
- `renderer/data/*.json` — дефолтные шаблоны мира
- `userData/world-data/*.json` — рабочий мир, который меняет ДМ-конфигуратор
- `userData/world-data/assets/*` — изображения сущностей
- `userData/galactic-state.json` — живое состояние профилей игроков
- `userData/galactic-sync-config.json` — локальная конфигурация Supabase для текущего ПК

## Supabase
В проект добавлены:
- `supabase-setup.sql` — SQL для таблицы и RLS policy
- `SUPABASE_SETUP.md` — краткая инструкция по подключению

## Тестовые пароли
- Шепард — `1234`
- V — `0000`
- Ведущий — `admin`
