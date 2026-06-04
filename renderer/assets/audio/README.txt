Положи сюда свои звуковые файлы перед сборкой билда.

По умолчанию код ищет такие файлы:
- ui_click.mp3
- module_open.mp3
- system_jump.mp3
- planet_focus.mp3
- market_buy.mp3
- action_success.mp3
- action_fail.mp3
- ambient_space.mp3

Если хочешь другие имена или подпапки, поменяй константу SOUND_CONFIG в renderer/app.js.
Папка renderer/assets/audio/ автоматически попадёт в сборку, потому что package.json уже включает renderer/**/*.
