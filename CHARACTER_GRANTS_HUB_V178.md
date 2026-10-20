# Character grants and continuous Hub movement (v178)

Base: main `7f915b2` (PR #53). Installer version remains 1.0.155.

## Skills and characteristics

- A common skill with prerequisites follows its predecessor's sector. Common-only dependency chains stay together in the side bank, with successors below predecessors. Independent common skills retain a compact three-column arrangement. Actual prerequisites still determine access; placement does not add requirements.
- The **Характеристики ↑** toolbar button opens an explicit upgrade panel. Clicking a characteristic at the centre also opens it. Existing confirmation, point deduction, conflict checks and the maximum base value of 5 are reused. Glory remains DM-controlled.
- World Config → Skills → **Базовый** makes a skill automatically owned by every existing and new character without spending points or satisfying learning requirements. Active/reaction skills retain their combat configuration and Lua. Removing the flag stops future automatic grants; already owned skills remain owned.

## Professions and origins

The profession and geographic origin cards now contain **Навыки и стартовые предметы**:

1. Select existing global skills through the shared searchable checkbox picker.
2. Add private skill definitions directly in the card: name, activation type, image URL, rich description, modifier JSON and optional Lua script. Private definitions do not become ordinary World Config skills. Their generated IDs encode source and local ID to avoid collisions; retain these IDs when editing imported JSON. Advanced existing combat metadata is preserved.
3. Select starting equipment and quantity (1–999). Repeated item rows must be combined.

Data stays in the existing `socialOrigins` / `geographicOrigins` JSON sections as `grantedSkillIds`, `grantedSkills`, and `startingItems: [{itemId, qty}]`. Section export/import and campaign backups carry these fields. Form drafts preserve added rows, multiple selections and incomplete JSON while switching/rerendering; validation happens on save.

Character normalization unions basic and origin skills with existing ownership. Private definitions resolve in stats, skill descriptions and desktop combat actions. Characters already using an origin receive its skill grants too. Skill points are unchanged. Existing ownership is retained when grants change; removing a definition itself makes that private ability unavailable.

**v180 correction:** starting equipment is registration-only. The explicit `startingLoadout` initializer prepares goods and source/item receipts for a new registration draft. Ordinary `apply` calls used by profile reads, inventory edits, World Config, combat, trade and sync grant skills but never issue equipment, including when an old character has no receipts or an origin definition gains new goods. Changing a saved character's origin does not issue starting items.

Registration stores `characterGrants178.items` with the prepared inventory; quantities and positions pass through the usual application submission. Receipts continue to prevent duplicate explicit initialization. Skills remain retroactive and do not spend skill points. Existing inventories and old receipts are retained; the fix does not guess which already-owned copies were caused by the previous bug.

## Hub

- Player movement uses pixel coordinates, routes around wall ends and rotated blocking assets, and follows the complete route from one click. A swept circular collision shape checks the full character width, including along each segment. The default diameter is 40 px; **Ширина персонажа** in the map inspector accepts 8–80 px and also sizes the token. Gaps narrower than the diameter remain impassable.
- The existing `hexSize` field remains as a distance conversion scale for old vision and interaction settings; it no longer snaps Hub positions or draws a player grid. Existing saved coordinates and entry/transition destinations remain in pixels. Interaction distance stays equivalent to the previous two-hex range and additionally requires an unobstructed line of sight.
- Confirmed movement is saved in segments of at most 60 px. Animation and vision interpolate continuously between them. A failed write stops the route and restores the last confirmed token position and fog; camera/map DOM remains intact.
- Fog uses ray-cast visibility clipped by sight blockers, a gradual radial edge and compact raster exploration memory (`version178: 1`, RLE runs). Old hex exploration migrates on read. Walls and closed doors stop sight; opening a door updates visibility. Fog is animated transiently while moving; only confirmed positions expand saved memory.
- Walls remain visible/selectable in the DM editor. Player markup contains no wall entities. Movement and sight blocking default to enabled for walls and can be disabled independently using the existing flags. A wall's invisible presentation does not disable collision.

## Apply and verify

Update the desktop source/bundle and restart the client. Run **Deploy Web** from this revision and refresh the browser. Deploy includes the new shared `character-grants-v178.js` and `hub-free-v178.js` plus changed shared runtime/layout and web app files. The desktop-only `character-authoring-v178.js` is loaded at the end of the renderer entry page.

No backend schema change, service restart or stock-market service update is required. Use the standard player mutation endpoints; there is no new endpoint. Do not deploy only an entry HTML file without its scripts. No production deployment, native Electron build or live PocketBase test was performed here.

Validation covers pure grants, collision/pathfinding, small gaps, rotated assets and doors, legacy fog migration, real desktop queued writes, actual desktop/web World Config and profile UI, JSON round trips, characteristic purchases, full web movement with a versioned API fixture, fog pixel alpha/occlusion, and mid-route save rollback. Historical hex unit tests exercise the retained legacy module in isolation; v178 browser tests load the actual new entry pages.
