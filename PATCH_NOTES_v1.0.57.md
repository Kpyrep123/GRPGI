# GRPGI 1.0.57 — Campaign Studio persistent view + graph ports

## Campaign Studio
- Camera pan/zoom, selected node, current campaign/mode-specific selection, catalog search and panel scroll are treated as local UI state. Incoming realtime/world snapshots no longer reset them.
- Camera pan/zoom no longer causes world/PocketBase saves. Only graph content changes are synchronized.
- Unsaved local edits are protected from stale incoming snapshots until the save/push cycle finishes.
- Every knowledge/plot/condition card has four edge connectors. Drag from any connector to a connector on another card to create a graph relation.
- Knowledge graph: connector drag creates a normal relation.
- Plot tree: connector drag creates a directed branch.
- Condition → plot drag assigns the shared condition to that plot element.
- Inspector-based relation creation is still available.
- Drag-created links are immediate and non-blocking; their labels can be edited inline in the inspector afterwards.

## Galactic map
- System marker visuals are 40% larger in Electron and desktop Web. Hit areas/proximity checks were increased accordingly.
- Web system labels now use desktop-equivalent level-of-detail behavior: labels disappear while zoomed out and fade in progressively as the map is enlarged.

## Validation
- No npm install or npm ci was run.
- JavaScript/CJS syntax and JSON structure were checked.
- Campaign Studio local-state retention was unit-tested against a stale incoming snapshot.
