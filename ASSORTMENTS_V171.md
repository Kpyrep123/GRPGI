# Bulk assortments, tags and recommended prices

## DM workflow

1. **World Config → Теги**: create and name trade tags. Existing equipment tags are registered on the first load without a trade catalogue. Renaming a tag's label leaves its references intact.
2. **Снаряжение → item → Торговля**: set its recommended price and select tags. Existing prices remain the fallback until a recommended price is entered. Stocks retain their separate exchange.
3. **Планеты → planet → Торговля**: enter a signed price adjustment, e.g. `25` for +25% or `-25` for −25%.
4. Open **Ассортимент терминала** from a planet card, or **Ассортимент торговца** from a Merchant-flagged Hub asset/unit. Both use the same separate large editor. Apply changes to the draft, then save the card or Hub. Cancel/Escape discards the assortment window's edits; Hub undo includes applied assortment changes.

Tag and category lists now use search, persistent selected chips and explicit right-hand checkboxes. Type a tag name and press Enter or Add to create it; case-insensitive existing names are reused. New tags enter the shared registry only when the owning card/Hub is saved. Cancelling the assortment window discards its new tags.

The catalogue has images, search, category/tag filters, recommended-price filters and views for all goods, included goods and individual settings. Multiple tag/category selections use OR within each group; the groups combine with AND. Stocks are excluded.

- **В ассортименте** is the persistent goods checkbox. Checking/unchecking it immediately changes the draft assortment and survives saving/reopening. The separate **Для массовых действий** checkbox is only a temporary batch selection.
- **Add/change selected** creates explicit assignments for the selected, currently shown goods. Future equipment additions are not added by that action.
- **Include by current filter** creates a dynamic rule. It also matches future goods. Rules have optional chance/variation overrides; blank values inherit the assortment defaults. The last matching enabled rule wins.
- **Exclude selected** creates explicit exclusions that win over rules.
- **Reset manual settings** removes the explicit exception and returns to rules or the original legacy assortment.
- **Изменить** next to an item opens its price mode, chance and range/variation in the right panel. Valid edits update that item in the draft automatically; saving the window validates pending fields. Use the persistent stock checkbox to include/exclude it. Batch parameters still require the explicit bulk action.
- Bulk actions affect selected goods among the currently shown results. Hidden selections cannot accidentally be changed by a filtered action.

Recommended-price mode uses `recommended price × (1 + adjustment/100) × (1 ± variation/100)`, rounded to whole credits. A recommended price of 100, +25% adjustment and ±15% variation gives **106–144**. A Hub merchant inherits its planet adjustment unless it has its own override. Fixed ranges ignore those adjustments. Availability chance and the daily price remain independent, seeded by the existing destination/campaign/day mechanism; this change does not change the backend's existing calendar selection.

The editor previews configured ranges and the unweighted mean of enabled items' range midpoints. This mean is not a probability-weighted expected daily price.

## Templates and copying

**World Config → Шаблоны ассортимента** holds reusable assortments. Edit goods/rules in the same window, then use **Сохранить и применить шаблон к торговцам**. This takes the current validated card draft and saves the template plus any selected planet terminals/Hub merchants together; a separate template-card save is not required. Recipients list the Hub/map/object identity; repeated NPCs on different maps remain independent.

The shared editor also offers **Копировать из торговца**. Copy a saved merchant into a template to distribute it to several destinations, or copy directly into another merchant's draft. Saved legacy fixed rows are copied as fixed settings.

Applying a template/source copies defaults and rules, while retaining the recipient's individual exceptions by default. The World Config recipient window previews configured stock and retained exceptions. Uncheck **Сохранить индивидуальные настройки торговцев** to replace overrides for items covered by the template, while leaving unrelated goods untouched. Reapplying the same rule IDs updates them without duplicate rules. Templates are copied, not live subscriptions: changing a template later does not silently rewrite merchants. Apply it again when needed. Destination-specific price adjustments are not copied by templates.

## Compatibility and storage

- Tags/templates live in `equipment.TRADE_CATALOG` alongside the existing equipment section; no new world file or PocketBase collection is needed. World Config displays them as separate categories. Their saves publish equipment and planets together.
- Destinations store `assortmentPolicy` with original `legacy` rows, defaults, dynamic rules, manual overrides and an optional adjustment. Its original legacy baseline is retained separately from generated rows: removing a rule cannot resurrect the last projected assortment.
- A destination adopts this policy on editing. Existing equipment `merchantOffers` migrate into that destination's manual overrides. Unconverted destinations still resolve v170 equipment assignments and legacy markets. Their data, including orphan assignments, is retained.
- The equipment card and merchant editor resolve the same destination policy. Equipment-card overrides update that policy on normal card save; inherited rules are not flattened into fixed item assignments.
- World snapshots continue projecting effective rows into `market` / `merchantMarket` for older clients and the existing server goods endpoint. An equipment/tag/planet edit publishes equipment and planets together so recommended-price or filter changes reach that endpoint.
- Deleted tags remain unresolved references in existing rules; they cannot turn a tag-restricted rule into an unrestricted rule. Remove or replace the rule explicitly. The registry does not recreate deleted tags on reload. Item saves retain unresolved tag selections and unavailable legacy merchant assignments.
- Equipment ID changes remap local policy overrides/baselines; planet ID changes retain v170 assignment remapping. Hub drafts and save-failure behavior remain detached from live data.

## Deployment and validation

Update the desktop source/bundle, then use **Deploy Web** from this revision. Deploy the updated shared helper, Hub core/adapter and HTML together. The authoring module and stylesheet are desktop-only. Installer remains 1.0.155; no installer was built.

For the repository's JSON sync-server, deploy the updated `sync-server/merchant-catalog-v170.js` with its market engine and restart that backend. The helper retains its filename for compatibility. The isolated stock market service does not change and requires no restart. No DB schema change is introduced.

Tests: `tests/assortments-v171.mjs` checks pricing, daily variation, dynamic/static selection, chance/exclusions, fixed-price precedence, old-assignment adoption/reset, projection cleanup, Node transaction parity, Hub inheritance/stale quotes and mirrors. `tests/assortments-v171.browser.mjs` loads the real renderer/configurator and tests tags/templates, normal persistence, item/merchant agreement, multi-target template application, filtered actions, validation/cancel, orphan retention, detached Hub undo/save failure/retry, a saved Hub purchase, and layout at 1440/980/390 px. Existing Hub editor/dialogue/trade, terminal, category, ambient/chart and full-web walking regressions also pass.

Native Electron, the deployed PocketBase goods hook and production data are not exercised. The hook/executable are not provided in this checkout. No deployment or merge is performed as part of the change.

The v173 regression `tests/assortment-template-v173.browser.mjs` covers direct goods checkboxes, automatic item settings, applying an unsaved current template, preserve/replace modes, atomic local-failure rollback/retry, reopening, actual Hub stacking and a saved merchant purchase. The assortment overlay now paints above the real Hub builder; previous pointer-only tests could click through the inert builder while the shop was visually hidden.


## Экспорт и импорт тегов и шаблонов (v175)

В World Config откройте «Теги» или «Шаблоны ассортимента» и нажмите «ЭКСПОРТ JSON» / «ИМПОРТ JSON». Экспортируются все сохранённые записи выбранного раздела. При импорте доступны объединение по ID, полная замена только этого раздела и отмена. Цены, шансы, правила и ручные исключения шаблонов сохраняются. Назначенные торговцам ассортименты при импорте шаблонов автоматически не меняются: примените импортированный шаблон к нужным торговцам обычной кнопкой.

Отдельные файлы `tradeTags.json` и `assortmentTemplates.json` появляются в рабочей папке `world-data` и в новой резервной копии кампании. Для переноса шаблонов с правилами по тегам экспортируйте и импортируйте оба раздела, сначала теги. Снаряжение переносится своим экспортом; ID товаров и тегов должны совпадать. Файл шаблонов не содержит сами товары.

Для совместимости с существующей синхронизацией источник данных остаётся внутри `equipment.json` → `TRADE_CATALOG`. Два новых файла — автоматически обновляемые копии для переноса, а не дополнительная независимая база. Их следует импортировать через World Config: ручное редактирование копии в рабочей папке не меняет кампанию. В старых бэкапах теги и шаблоны можно найти в `equipment.json` → `TRADE_CATALOG.tags` / `.templates`; после обновления приложение создаст отдельные копии при загрузке или бэкапе. Сервер перезапускать не нужно.
