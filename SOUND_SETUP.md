# Звук в приложении

Храни пользовательские звуковые файлы в `renderer/assets/audio/`.

Куда прописывать пути:
- `renderer/app.js`
- константа `SOUND_CONFIG`

Файлы, которые можно заменить своими:
- `ui_click.mp3`
- `module_open.mp3`
- `system_jump.mp3`
- `planet_focus.mp3`
- `market_buy.mp3`
- `action_success.mp3`
- `action_fail.mp3`
- `ambient_space.mp3`

После добавления файлов просто пересобери приложение через `npm run dist`.
