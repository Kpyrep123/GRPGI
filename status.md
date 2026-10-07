# GRPGI — состояние проекта

Обновлено: 2026-10-07. Версия клиента в `package.json`: **1.0.155**. Модули Хаба используют общие правила/runtime v156 и пространственную модель v157; версия установщика не менялась.




## Daily NPC and asset merchant assortments (2026-10-07)

Base: main `f6f4616` after PR #37; branch `feat/npc-daily-assortments`.

- Trader remains an independent asset/unit flag. Edit product range opens a separate modal window above the Hub editor, with the complete physical equipment catalogue, availability checkboxes, search, Selected only, appearance chance (0–100%) and minimum/maximum prices in whole credits. Financial stocks remain in their existing separate exchange. Apply changes only the Hub draft, with undo/redo; Cancel/Escape discard window edits. Save hub uses the existing validated world save and failure/retry path. Disabled entries keep their settings. Duplicated objects, maps and prefabs retain their merchant configuration.
- `merchantMarket` stores per-item rules inside existing planet Hub objects. Offers reuse the planetary market engine, with campaign/hub/map/merchant identity in the seed. Stock and prices remain stable for all players on a given day; appearance and bounded prices roll again on the next campaign market day. Without a configured campaign date, rollover is midnight UTC. Like the planetary market, a fixed campaign market date must be advanced by the DM to rotate stock. Appearance chance determines the daily presence of a product, not the chance of a successful purchase. No per-day purchase quantity limit was added.
- Shared desktop/web purchase rules regenerate today's offer before mutation and reject obsolete day, price or assortment configuration. Spatial purchase wrapper forwards quotation/date arguments while preserving visibility/reach checks. Existing capacity, credit, access, once-only effects and atomic profile save/rollback remain. Legacy `merchantItemIds` continue as fixed-price lists until the DM applies the new editor; empty explicit assortments never fall back to them.
- Added deterministic assortment rule coverage and expanded Hub browser integration for the separate window, catalogue selection, filtering, range validation, Apply/Cancel/Escape, undo/redo, saved configuration, campaign dates, stale-window rejection and desktop/web purchases with save failure/retry and capacity rollback. Existing Hub rules/spatial, dialogue and navigation regression checks remain covered. Script cache keys updated; installer version remains 1.0.155.
- Configuration fits existing planet/profile JSON; no server schema change or deployment. Native Electron, live PocketBase and multi-device synchronization were not exercised. Purchase checks follow the existing client-side Hub mutation architecture; this change does not introduce a server-authoritative NPC trading endpoint. Android's copied mobile/www bundle remains outside this desktop/web change.

## RPG dialogue editor and full-screen conversations (2026-10-07)

Base: main `8562a6b` after PR #36; branch `feat/hub-rpg-dialogues`.

- Replaced the dialogue authoring UI with a full-screen, three-pane workspace: searchable dialogue list, compact graph, and properties inspector. Speaker text and multiple player replies stay visible in each graph card; conditions, scopes, once-per-character settings and flags move to the inspector. Existing legacy prerequisites remain visible and can be removed explicitly. Dialogue-level completion flags apply on confirmed endings. Pan/zoom, node movement, starting-node selection, layout, node/dialogue duplication, undo/redo and keyboard port connections are supported. Dropping a reply output onto empty graph space creates and connects a new speaker node.
- New replies require an explicit destination: another node, Return to beginning, or End dialogue. Disconnecting or deleting a target creates an unconfigured destination rather than silently completing the conversation. New empty nodes require replies or an explicit Ending node setting. Existing blank-target replies and no-reply endings retain their old meaning. Graph checks report missing/duplicate IDs, invalid destinations and unreachable nodes; loops remain legal. Dynamic blocked-response cases are visible in preview and always retain Leave.
- Conditions support ALL/ANY, flags set/unset, dialogue completed/not completed, and items present/absent in inventory/equipment. Dialogue prerequisites can require completion with a particular NPC or asset/unit. Confirmed endings record completion context in each player's hub progress; return links and Leave do not mark completion. One-time nodes/replies remain per character. Legacy unscoped prerequisites keep their original current-hub behavior; legacy records without NPC context cannot be retrospectively attributed to a specific NPC. Use an unscoped prerequisite for that older progress or reset/replay the relevant conversation when introducing an NPC-specific requirement.
- Player conversations use a shared full-screen desktop/web view with a dedicated NPC portrait pane, readable speaker text, multiple reply buttons, optional hidden/disabled unavailable replies and author-provided explanations. Leave and Escape close without completing the dialogue; reopening resumes confirmed progress. Leave remains available during a save; a pending choice may finish saving but does not reopen the closed screen. Save errors retain the current reply and allow retry. Navigation/dialogue saves remain quiet. Static portraits use existing NPC/asset images; PNG emotion sets are deferred.
- Test dialogue opens an isolated character copy with adjustable flags, previous dialogue/NPC completions, required inventory items and equipment. One-time node/reply history resets for the test. Preview uses shared rules and presentation, and never writes world/profile data. Save hub runs the real existing authoring save path; validation failures, cloud/disk failures and external-change conflicts keep the draft open.
- Added `dialogues-v161.mjs` and `dialogues-v161.browser.mjs`. Passed new rule and Chromium desktop/web/editor tests for branching/loops, NPC-specific unlock and persistence, conditions, explicit endings, Leave/Escape/resume, hidden/disabled replies, portrait/full-screen/mobile layout, failed saves/retry, leaving during a pending save, drag-create links, isolated preview, undo/redo and authoring save validation/failure/retry. Updated the existing Hub browser integration suite to exercise the compact editor and shared full-screen view; its world save failures/retry, graph links, trading, fog, movement and web adapter checks pass. Existing Hub core/spatial, navigation browser, GalaGram, skill-chain and fauna/shield World Config regressions pass. JS syntax, shared-file equality and `git diff --check` pass; editor and mobile conversation screenshots inspected.
- Relevant script cache keys updated; installer version unchanged. No server/schema changes, deployment or installer release. Native Electron, live PocketBase and multi-device synchronization were not exercised. Android's copied mobile/www bundle remains outside this desktop/web change.

## GalaGram dates and Hub navigation (2026-10-06)

Base: main `ef6e5fa` after PR #35; branch `fix/galagram-year-hub-navigation`.

- New player publications use the actual creation timestamp with only the year replaced by **3616**. Month, day, time, and timezone suffix are preserved; campaign market dates no longer determine publication dates. Previously saved player posts display and sort with year 3616 without rewriting their stored profile data. New World Config News forms also default to 3616; existing world-news dates remain intact.
- Hub navigation, transitions, and dialogue progress save without success notifications. Error notifications remain, and purchases still confirm success. Profile synchronization and per-step persistence are unchanged.
- Player token animation is 140 ms instead of 260 ms. Each animation runs concurrently with that step's save rather than starting after the save. The next step starts only when both finish. Fog and visible objects update only after the save and animation complete; a failed save rolls the token back to the last confirmed position and stops the route. Network latency still limits movement speed.
- Hovering over an empty map hex draws the planned hex route and destination. Inaccessible destinations have a red outline. Preview uses the same wall/door-aware pathfinder as movement, coalesces pointer events to animation frames, and avoids recalculating within the same hex. Leaving the map clears preview; movement shows its remaining route. Wall segments are prepared once per path search rather than once per expanded edge.
- Desktop and web use matching shared runtime, spatial, News core and composer files. Relevant script/CSS cache keys updated; installer version unchanged.
- Passed: `node tests/hub-navigation-v160.browser.mjs` for desktop/web route previews, blocked destinations, pointer leave, quiet dialogue/navigation, overlapping saves/animation, next-step timing, confirmed fog and failed-save rollback. Also passed the existing Hub browser suite (editor/graph, saves, dialogue/trading, movement/fog and leaving the hub), Hub core/spatial tests, GalaGram core/browser suites (including year-only timestamps, legacy ordering and retries), skill-chain regression, syntax checks and `git diff --check`. Route screenshots inspected.
- Native Electron, live PocketBase and multi-device behavior were not exercised. No server/schema changes, deployment, or installer release.

## GalaGram: shared News feed (2026-10-06)

Base: main `2bf3d9b`; branch `feat/galagram-feed`.

- Desktop News is now a GalaGram feed with player posts, profile author names/avatars, plain text, up to four image attachments (PNG/JPEG/WebP/GIF, 8 MB each), previews, and deletion of the current character's posts. Existing News titles, subtitles, rich bodies, images, visibility, unread markers, and stock ticker remain supported.
- World Config News keeps the existing `NEWS` / `NEWS_LIST` structure and adds an author selector: world news/DM, an existing NPC, or an organization whose name is typed manually. Existing records require no migration.
- Player posts use the same article fields in a `newsPosts` map in each synchronized profile, scoped to the selected story campaign. Publication patches only this map, avoiding world snapshot writes. Deletion uses tombstones; author names come from the owner profile. Feed ordering uses in-world publication dates with creation timestamps as tie breakers.
- Web has a separate GalaGram navigation tab, including restored navigation/history. Shared core/UI files match desktop. Images upload through the existing campaign_assets collection and desktop media bridge; interrupted uploads recover by assetPath. Failed publication retains the composer, uploaded image URLs, and stable post ID for retry. Refresh does not clear drafts.
- Passed: `node tests/galagram-v159.cjs` (legacy records, visibility/campaign scope, ownership, organization/NPC World Config, desktop profile-only patch/rollback, web PocketBase asset contract and recovery); `node tests/galagram-v159.browser.mjs` (Chromium composer, images, save/upload failures and retries, refresh, deletion, author labels, escaped player text, mobile width); existing skill-chain and fauna/shield World Config regressions; JS syntax and git diff whitespace checks. Browser test accepts PLAYWRIGHT_CORE_PATH and CHROMIUM_PATH overrides. Installer version unchanged; web app cache key updated.
- Native Electron, live PocketBase permissions/uploads, and two-device synchronization were not exercised. No deployment or merge performed. Android's copied mobile/www bundle is outside this requested web/desktop change.

## World Config: редактирование навыка сохраняет ветку (2026-10-06)

Основа: `main`, `469190f` после слияния PR #33. Ветка исправления: `fix/skill-chain-edit`.

- Найдена причина разрыва последовательности: общее `replaceEntity` вызывает `removeEntity`, а удаление навыка очищает входящие prerequisites, бонусы специализаций и выданные навыки. При редактировании третьего элемента из пяти четвёртый терял ссылку на третий, но пятый оставался связан с четвёртым.
- Сохранение навыка теперь обновляет запись без процедуры удаления. При смене ID сначала переназначаются ссылки, затем записывается отредактированный навык. Коллизия ID отклоняется до изменения данных; одинаковые ID не запускают переназначение специализаций.
- World Config сохраняет существующий `treePos`. Изменения названия, описания, стоимости или условий не сбрасывают ручную позицию узла и не убирают навык у игроков. Переназначение ID охватывает шаблоны и текущие профили игроков.
- Явное удаление по-прежнему очищает ссылки. Остальные типы сущностей используют прежний путь сохранения. Обновлён ключ кеширования desktop `app.js`; версия установщика не менялась.
- `node tests/skill-chain-edit-v158.mjs`: реальная логика collect/replace/remove/remap из `app.js`; ветка из пяти навыков, повторное редактирование после сериализации/загрузки, координаты, выдача игрокам, явное изменение prerequisite, переименование ID, коллизия и удаление. Тест на исходном `main` воспроизводит потерю связи четвёртого навыка с третьим; на исправленном коде проходит.
- `node tests/v146-fauna-shields-world-config.cjs`, `node --check renderer/app.js`, проверка синтаксиса теста и `git diff --check` прошли. Нативный Electron и живой PocketBase не запускались.
- Удалённые предыдущими сохранениями связи автоматически не восстанавливаются: в текущих данных нет сведений о прежнем prerequisite. Их нужно назначить повторно в World Config.

## Хаб: стены, туман, гексы и граф диалогов (2026-10-05)

Основа: `main`, `a4b41f5` после слияния PR #32. Ветка изменений: `fix/hub-hex-fog-graph`.

- В редактор добавлен инструмент «СТЕНА»: зажать мышь и провести отрезок; Shift фиксирует угол с шагом 30°. Стены выбираются, перемещаются, дублируются (кнопка / Shift / Ctrl+D), удаляются и поддерживают отмену/повтор. Толщина, блокировка движения и блокировка обзора задаются отдельно. У ассетов также появился флаг блокировки обзора.
- «ТУМАН» включает туман войны для карты, «ПРОСМОТР» показывает область видимости от первой точки входа. В настройках карты задаются радиус гекса и обзор; пустой обзор берётся из профиля игрока. Существующие карты не получают туман автоматически, новые создаются с включённым туманом.
- Игрок перемещается по центрам соседних гексов. Поиск кратчайшего маршрута обходит стены и блокирующие объекты; закрытые двери перекрывают движение и обзор, открытые пропускают. Старые пиксельные позиции нормализуются на ближайший гекс при открытии. Движение останавливается при ошибке сохранения, смене позиции, недоступности следующего гекса или уходе из игрового экрана.
- Токен использует `image` из профиля и круглый контур. Каждый подтверждённый шаг анимируется; после завершения его анимации обновляется туман. Позиция и исследованные гексы записываются одним изменением профиля на каждый шаг. Исследование хранится отдельно по хабам и картам; смена геометрии сетки сбрасывает несовместимые данные исследования этой карты.
- Неисследованная территория скрыта, исследованная вне текущего обзора затемнена. Стены и закрытые двери преграждают обзор. Объекты вне текущего обзора не отображаются и недоступны для взаимодействий, диалогов и торговли.
- Вместо горизонтальных колонок редактор диалогов использует граф: узлы перетаскиваются за заголовок, выход каждого ответа соединяется с входом узла перетаскиванием. Поддержаны разрыв связи, удаление узла с очисткой входящих ссылок, выбор стартового узла, панорама, масштаб и раскладка. Связь также создаётся клавишей Enter на выходе, затем на входе; Escape отменяет создание связи. Ответ без связи завершает диалог.
- Координаты узлов сохраняются вместе с хабом. Существующие `nextNodeId`, условия, флаги, карты/NPC/ассеты, результаты и одноразовые настройки сохранены; игровой движок исполняет те же связи.
- Общая пространственная модель и игровой интерфейс совпадают в Electron и вебе, который используется при подготовке Android. Обновлены ссылки кеширования модулей. Версия установщика не менялась.

Проверки:

- `node tests/hub-functions-v156.mjs`: прежние правила диалогов, доступа и покупок.
- `node tests/hub-spatial-v157.mjs`: преобразование координат, соседние шаги, кратчайший путь, обход/блокировка стен, двери, обзор, туман, переходы между картами, исследование и валидация.
- `tests/hub-functions-v156.browser.mjs`: рисование/дублирование/удаление стен и история, предпросмотр тумана, перетаскивание узлов и соединений, разрыв/повторное соединение, сохранение/повторное открытие графа, портрет игрока, промежуточное положение анимации, исследование после каждого шага, остановка при ошибке записи и смене экрана в desktop/web. Проверки сохранения хаба, диалогов, торговли и адаптивной рабочей области также сохранены.
- Сценарии прошли в Chromium; снимки редактора графа и игрового тумана просмотрены. Проверены синтаксис изменённых JS и `git diff --check`.
- IPC, медиа и облако в браузерных тестах подменены. Живой PocketBase, установленный Electron, сборка Windows и физический Android не проверены. Серверные hooks и выпуск установщиков не изменялись.

## Функциональность Хаба и редактор диалогов (2026-10-05)

Основа: `main`, `6d5aaef` после слияния PR #31. Изменения подготовлены в `fix/hub-functions-v156` для отдельного PR.

- Редактор работает с независимым черновиком. Сохранение находит актуальную планету по ID, проверяет ссылки, пишет раздел `planets` и закрывается только после подтверждения. Ошибка записи или облачной синхронизации сохраняет открытый черновик; локально успешную запись можно повторно отправить. Обновление мира не оставляет сохранение на устаревшем объекте. Изменение хаба извне блокирует перезапись.
- Исправлен результат `Configurator.persistAll`: вызывающий код получает отдельные признаки локальной записи и подтверждения синхронизации. Выбор секции фиксируется до асинхронных операций.
- Юниты имеют круглый контур, квадратные размеры и круглый портрет в редакторе и игре. Ассеты сохраняют свою форму.
- Торговец — отдельный флаг у ассета или юнита. Ассортимент выбирается в инспекторе. Покупка проверяет актуальный баланс, цену, доступ и вместимость; инвентарь и кредиты записываются одним изменением профиля. Ошибка не отображается как успешная покупка. Поддержана совместимость старых торговцев с ассортиментом.
- Добавлена отдельная библиотека флагов. Условия и результаты действий выбирают флаги из неё; старые ссылки на флаги доступны в списке.
- Отдельное полноэкранное окно диалогов содержит список диалогов и горизонтальные колонки с текстом и ответами. Для диалога и каждой колонки задаются карты, NPC и конкретные ассеты/юниты. Ответы выбирают следующую колонку или завершение.
- Условия диалогов, колонок и ответов: флаг установлен/не установлен, предыдущий диалог завершён, предмет в инвентаре/экипирован/в любом из этих мест. Все условия в списке обязательны. Диалог, колонка и ответ имеют независимые настройки одноразового выполнения на игрока.
- Диалоги и действия назначаются как юнитам, так и ассетам: например «Прочитать надпись» и «Стереть наклейку». Завершение отмечается также у повторяемых диалогов; результаты ставят/снимают флаги. Незавершённый разговор сохраняет текущую колонку.
- Общие модули правил и игрового интерфейса используются Electron и вебом (источником Android). Прогресс сохраняется отдельно по хабам и переживает уход/возвращение. Закрытая дверь с блокировкой движения перекрывает путь; открытая пропускает.
- Импорт изображений использует существующий механизм изображений мира с облачной ссылкой. Старые локальные изображения карт, объектов и префабов обрабатываются при сохранении; ошибки загрузки показываются в редакторе.

Проверки:

- `node tests/hub-functions-v156.mjs`: условия, области доступности, результаты, одноразовость, возобновление, покупки, блокировка дверьми, прогресс между хабами и проверка ссылок.
- `tests/hub-functions-v156.browser.mjs`: реальные стили и модули Хаба; рабочая область на 1440/1000/760 px, круглый портрет, отдельное окно колонок, создание флага и условий, назначения торговца, повторное открытие сохранённого хаба, отмена без утечки черновика, устаревшая ссылка на планету, ошибки диска/облака и повторная запись, импорт изображений, диалоги и покупки в desktop/web.
- Браузерные сценарии прошли в Chromium, снимки просмотрены. Проверены синтаксис изменённых JS и `git diff --check`.
- IPC, загрузка медиа и облачные ответы в тестах подменены. Живой PocketBase, Windows-установщик, APK и физический Android не проверены. Сборка/публикация и серверные hooks этой работой не изменялись.

Для браузерного теста: `PLAYWRIGHT_MODULE=/path/playwright-core/index.mjs CHROMIUM_PATH=/path/chromium SCREENSHOT_DIR=/path/screenshots node tests/hub-functions-v156.browser.mjs`.

## Редактор Хаба — рабочая область (2026-10-04)

- Основа: `main`, коммит `be3bee4` после слияния PR #30.
- Устранён конфликт с классами боевого редактора: палитра, карта и инспектор размещаются в одной строке на всю доступную высоту. Карта занимает центральную колонку, а не маленькую ячейку слева сверху.
- На узком экране карта занимает всю ширину; унаследованное абсолютное позиционирование инспектора отключено. Прокрутка инспектора остаётся внутри панели.
- При открытии, переключении, создании и копировании карты включается центрирование и подгонка масштаба. Изменение размера окна обновляет подгонку; ручной масштаб и перемещение сохраняются до команды «ЦЕНТР».
- Обновлены ссылки кеширования CSS/JS редактора. Веб-модуль Хаба является отдельным игровым интерфейсом без этого конструктора, поэтому его файлы не менялись.
- Проверки: синтаксис JavaScript (`node --check`) и `git diff --check`; проверены конфликтующие CSS-правила. Визуальный запуск не выполнен: загрузка Chromium возвращает повреждённый архив. Требуется проверка установленного Electron; сборка и публикация не выполнялись.

Ниже сохранён исторический статус профиля 1.0.143; его номера версий и команды выпуска относятся к тому этапу.

## Источник и порядок работы

Основной репозиторий: `Kpyrep123/GRPGI`, основная ветка `main`. PR #7 с версией 1.0.142 слит. Исправления подготовлены от `c9da222` в ветке `fix/profile-layout-v143` для PR в `main`. Публикация сайта и сборок выполняется отдельно после слияния.

Старый `status (1).md` от 23 сентября прочитан. Его инструкции по архивам и применению патчей к 1.0.140 больше не описывают текущий процесс. Текущее состояние исходников берётся из GitHub, а не из старого ZIP.

## Изменения 1.0.143

- Исправлен конфликт высоты строк инвентаря со старыми минимальными размерами ячеек. Плитки сохраняют размеры в клетках; сетка из пяти колонок растёт вниз при увеличении вместимости, без внутренней прокрутки.
- При перерисовке сохраняются узел сетки и неизменившиеся элементы. Убрано повторное включение анимации веб-профиля; позиция прокрутки сохраняется, возврат фокуса из меню предмета не прокручивает страницу.
- Неактивный веб-профиль полностью скрывается и не остаётся снизу других разделов.
- Репутация Electron получает названия доступных организаций из справочника и оформлена как в вебе: изображение, название, статус, число и шкала. Кеш учитывает изменения справочника.
- Переключение лора сбрасывает кеш рендера. «Прочитать лор» ведущего и «Изменить лор» игрока работают с прежними правами редактирования.
- Редактирование профиля, обновления и DEV-панель объединены в компактные раскрывающиеся блоки с сохранением обработчиков и состояния раскрытия.
- PNG пользователя добавлены фоном силы, ловкости, выносливости, интеллекта, воли и славы. Сведения о персонаже компактнее; «Последнее обновление» и «Локация» убраны из веб-профиля.
- Веб-перетаскивание учитывает фактическую высоту строк, отступы и промежутки.
- Версия 1.0.143 в Electron, веб-ресурсах, npm и Android (`versionCode 1000143`). Android использует общий веб-исходник.

### Проверки 1.0.143

- `tests/profile-regressions-v143.browser.mjs`: реальные веб-ресурсы на 1440/390/320 px, Electron renderer на 1440/390 px, сгенерированный Android на 390 px. Проверены пересечения плиток и фоновых ячеек, отсутствие внутренней прокрутки и горизонтального переполнения, рост 57 → 62 ячейки, шесть фонов, квадратные импланты, скрытие неактивного профиля, название/статус/число репутации, лор игрока и ведущего, компактные панели, сохранение сетки при надевании/снятии и координаты перетаскивания.
- `tests/profile-sheet-v142.mjs`: структура профиля, сворачиваемый редактор, группировка имплантов, печатный HTML и экранирование.
- `tests/inventory-actions-v142.mjs`: надевание/снятие, владение предметами, устаревшие действия, совместимость слотов, вместимость рюкзака.
- Проверены синтаксис изменённых JS и diff. Существующие CRLF в Android-файлах сохранены.

Сохранение в браузерных тестах подменено; живая база не использовалась. Скриншоты просмотрены. Windows-установщик и APK не собирались; физический Android не проверен. Сервер не изменялся.
Переменные запуска браузерных тестов: `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `SCREENSHOT_DIR`; DOM-тестов: `HAPPY_DOM_MODULE`.

## Изменения 1.0.142

- Перевёрстан профиль веба и Electron: имя с круглым портретом, кредиты напротив имени, восемь карточек ключевых показателей с предоставленными пользователем иконками. Характеристики выше инвентаря, личность и лор внизу. Форматированный лор Electron сохраняется при переносе.
- Компактная экипировка: два вертикальных оружейных слота, броня и меньший рюкзак между ними. Квадратные импланты по четыре в строке. Инвентарь сохраняет пять колонок и реальные размеры предметов.
- Общая янтарная фактура, светлые металлические края и тени панелей; устранён холодный фон активной вкладки профиля и заглушек предметов в профиле.
- Клик, касание, Enter или пробел на предмете открывают доступные действия и полные параметры предмета. Снятие рюкзака не допускается, если из-за этого добавляется переполнение. Проверяются принадлежность экземпляра, совместимость слота и устаревшее действие. Во время сохранения повторное действие блокируется.
- Android теперь собирается из поддерживаемого веб-клиента через `tools/prepare-mobile.cjs`; Capacitor использует `mobile/generated-www`. Это исключает повторное использование устаревшего `mobile/www`.
- Версия обновлена в Electron, веб-ссылках ресурсов, npm lock-файлах и Android (`versionCode 1000142`). Печать/PDF Scattered World из предыдущего PR сохранена.

## Проверки 1.0.142 (предыдущая версия)

Выполнены:

- `tests/profile-sheet-v142.mjs`: порядок разделов, группировка имплантов, печатный HTML и экранирование.
- `tests/inventory-actions-v142.mjs`: реальные веб-нормализаторы, надевание/снятие без изменения количества, повторное надевание, устаревший слот, совместимость, границы имплантов, вместимость рюкзака.
- `tests/profile-touch-v142.browser.mjs`: реальные HTML и подключённые модули веба, Electron renderer и сгенерированного Android; ширины 1440, 390 и 320 px. Девять иконок, квадратные импланты, отсутствие горизонтального переполнения, надевание и снятие ровно по одной записи. Сохранение в этих тестах подменено, живая база не используется.

Для запуска DOM-тестов нужен `happy-dom`, браузерных — `playwright` с Chromium. Можно указать абсолютные пути переменными `HAPPY_DOM_MODULE`, `PLAYWRIGHT_MODULE`; первый аргумент тестов — корень репозитория. `SCREENSHOT_DIR` у браузерного теста сохраняет снимки.

Нативная сборка Electron/Android и физический Android не проверены. Рабочий сервер и его данные этой задачей не изменяются. Тесты интерфейса не подтверждают серверную синхронизацию и не заменяют проверку установленной сборки.

## Выпуск после слияния PR

1. В локальных исходниках: `git switch main`, затем `git pull --ff-only`.
2. Проверить версию 1.0.143 в `package.json`.
3. Опубликовать веб через существующую DEV-команду деплоя. Для Windows собрать установщик через DEV-команду или `npm run dist` и отдельно опубликовать результат.
4. Android: `npm run mobile:install`, `npm run mobile:sync`, `npm run mobile:open:android`, затем сборка в Android Studio.
5. После публикации перезагрузить веб и проверить профиль, снятие/надевание и повторный вход с сохранённым снаряжением.

## Оставшиеся исторические вопросы

Пользователь сообщал об исчезновении акций, откатах массовых операций инвентаря, списании очков без применения навыков и сбросах World Config. Ранее для них подготовлены исправления, но эта работа не подтверждает их окончательное устранение на живых данных. Пользователь сообщил, что после серверных изменений синхронизация работает. Серверные hooks и правила уже менялись вручную; их состояние нельзя выводить только из файлов репозитория.

Основные пути: `renderer/` — Electron, `deploy/site/app/` — веб и источник Android, `mobile/` — Capacitor, `pocketbase/pb_hooks/` — серверные исходники. Серверные изменения планировать отдельно от интерфейса; не заменять каталог hooks целиком.
