# Equipment-based merchant assortments

The v171 editor adds bulk assortment rules, tags, templates and recommended pricing; see `ASSORTMENTS_V171.md` for the current workflow. The details below describe the retained v170 compatibility format.

In World Config, open **Equipment → an item → Торговцы и терминалы**. Enable the terminals and Hub merchants that should sell it, enter the daily appearance chance and minimum/maximum price, then save the equipment card. Each row shows its midpoint; the summary is the unweighted mean of the enabled rows' midpoints, not a probability-weighted market quote. Search by planet, hub, map or merchant; use the selected-only filter to review assignments.

Save a Hub object with its **Merchant / Торговец** flag first. Both units and assets qualify. The destination label includes hub, map and object, plus the linked NPC name where available. Identical NPCs or object IDs on different maps have independent assortments. Turning the Merchant flag off excludes the object from discovery and trading. Existing assignments remain visible with a warning so they can be disabled or restored. Start points are excluded. Stocks continue using the shared stock market.

The planet card and Hub inspector now point to the equipment editor. Legacy assortments remain effective until overridden for that item and destination. Unchecking a row explicitly disables the item there. A zero appearance chance never offers the item; 100% always offers it on an active destination. Normal daily seeds and purchase/sale guards remain in effect.

## Data and compatibility

Each equipment record stores `merchantOffers`: `kind` (`planet` or `hub`), `planetId`, and, for hubs, `mapId` and `objectId`, plus `enabled`, `appearanceChance`, `minPrice`, `maxPrice`. Prices are nonnegative integer credits; chance is 0–100; minimum cannot exceed maximum. Planet ID changes remap equipment references in the same save. Removed maps/objects retain orphan assignments for review rather than silently retargeting them.

Shared clients resolve these assignments over legacy planet `market` and object `merchantMarket` / `merchantItemIds`. Normal world snapshots also project the effective assortment into those existing fields. Equipment saves publish both equipment and planets, preserving compatibility with the current server market endpoint and older clients. Equipment cards remain authoritative: edit assortments with the updated configurator. Avoid concurrent world edits from old configurators that do not understand equipment assignments.

## Apply

- Update the desktop source/bundle, including both new renderer scripts and the CSS. Installer version remains 1.0.155; no installer has been built here.
- Pull these changes before running **Deploy Web** so the updated HTML, helper, market engine and Hub scripts are deployed together. No static-web service restart is needed.
- If using the repository's JSON sync-server market backend, deploy `sync-server/market-engine.js` and `sync-server/merchant-catalog-v170.js` together and restart that backend.
- No stock market service changes, schema migration or new PocketBase route are required. The existing PocketBase goods hook is not included in this checkout; its native executable/live endpoint could not be exercised. The compatibility projection is tested with the existing row format.

## Validation

`tests/equipment-merchants-v170.mjs` covers discovery, scoped identities, legacy fallback, disabled overrides, daily chance, projection without input mutation, Node market pricing/transactions, and Hub buys/stale quotes. `tests/equipment-merchants-v170.browser.mjs` uses the real renderer/configurator for editing, filtering, validation, saving/reopening, publishing equipment plus planets, Hub buy/sell, orphan warnings and planet renames. The existing Hub editor/dialogue/trade browser suite follows the new equipment-editor entry point. Terminal, category, ambient/chart and full-web Hub navigation/walking regressions also passed. Native PocketBase integration requires `POCKETBASE_EXE` and was unavailable.
