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

## Web background audio (Deploy Web)

Place the original `web_ambient.m4a` in `renderer/assets/audio/` beside the source project used by Deploy Web. It is ignored by Git and copied directly into the temporary web deployment at `app/assets/audio/web_ambient.m4a`, with no source-archive size limit. A file already placed in `deploy/site/app/assets/audio/` also works. Desktop-imported audio is checked in the writable `scene-editor-media/audio` directory, including timestamp-prefixed imports of this filename. Only the requested ambient file is copied, not the whole combat sound library.

Deploy Web reports whether the track was uploaded, preserved from the previous server deployment, or absent locally and on the server. An existing server track is retained when the local source is unavailable. The web client plays it in a loop at 15% after a user gesture; the circular mute button saves its setting. Uploading the static site requires no market-service or PocketBase restart.
