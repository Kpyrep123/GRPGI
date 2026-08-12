# GRPGI 1.0.55 — Era marker image set

## Galactic map markers

Galaxy marker rendering now prefers campaign-era PNG assets:

- Medieval: `renderer/assets/images/bronzera/`
- Industrial: `renderer/assets/images/nowadays/`
- Technological: `renderer/assets/images/scifi/`

Expected files in every folder:

- `blackhole.png` — black hole
- `danger.png` — danger / former diamond marker
- `misc.png` — misc / former square marker
- `trade.png` — trade / former money-bag marker
- `node.png` — node
- `star.png` — star system / former orbital marker
- `planet.png` — planet
- `ship.png` — ship

Internal marker ids (`diamond`, `square`, `credits`, `orbital`) are intentionally preserved for saved-world compatibility.

## Color handling

Entity colors are no longer used to replace the entire art style. The source PNG is retained and the configured marker color is applied as a light `source-atop` tint (27%). Original highlights, shadows, texture and most of the asset palette remain visible.

## Fallback

Images are loaded lazily. Missing or invalid PNG files use the legacy Canvas marker renderer automatically, independently for every marker type.

The galaxy legend also displays the era asset when available and falls back to its old glyph on load failure.

## Web

DEV Web deploy now copies the marker files that exist in the three renderer asset folders into the temporary deploy tree:

`app/assets/markers/<folder>/`

The copied files are not duplicated into the repository's `deploy/site` source tree. This keeps one editable marker asset set. Missing files remain valid and use the Web Canvas fallback.

## Compatibility

No world-data migration is required. Existing `markerStyle` values and custom marker colors remain compatible.

No npm install/ci operation is required for this patch.
