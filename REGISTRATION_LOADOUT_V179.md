# Registration skills and equipment preview (v179)

Base: main `d2df4ac` after PR #54. Installer remains 1.0.155.

Registration now shows the benefits of each profession/origin card and a live **Ваш персонаж на старте** section on desktop and web:

- Basic skills, existing skills granted by the selected origin/profession, and private skills defined in those editors. Skills show their source, automatic ownership and safely rendered descriptions.
- All purchased and granted starting goods, including quantities, stack sizes and images.
- Primary weapon/shield, secondary weapon, armor and backpack slots. Newly added compatible items automatically occupy available slots; extras remain in the bag. Removing an item or changing campaign/origin removes unavailable draft goods and grants.
- The actual five-column profile inventory layout, including stackable and text-only items, weight, capacity and overflow. Backpack, origin and skill modifiers use each client's existing character/stat rules. Repeated normalization preserves the original base capacity instead of adding the backpack bonus again.

Drag an item onto an appropriate slot or free cells. Compatible equipped items can swap slots. Alternatively, select an item and click a slot/cell, or use the action buttons below its details. Buttons work with the keyboard, and tap selection works without dragging. Inventory movement rejects occupied/out-of-bounds destinations; invalid slot types are rejected. Removing/replacing equipment cannot increase existing overflow or excess weight. A backpack cannot be removed if the remaining capacity cannot hold the loadout.

Manual equipment and positions survive unrelated selection changes. Only newly added copies auto-equip, so manually removing equipment is respected. Selection changes rebuild the entitlement quantities from the currently selected sources; they do not replay persistent character grants over an old inventory. Resetting/closing the form starts a new draft.

Submission validates the same preview, including capacity from the equipped backpack, instead of checking a separate unequipped 12-cell bag. Only loadout fields are copied into the application: inventory/positions, slots, skills, grant receipts and base/derived capacity fields. The new character ID, name, password, campaign, budget, photo and pending approval remain controlled by the existing registration flow. The resulting application reloads with the chosen arrangement and no duplicate starting goods. Nothing is written before the usual application submission.

Also fixed a pre-existing null access in the creation budget when a profession/origin has not yet been chosen.

## Deployment

Update/restart the desktop client and run **Deploy Web** from this revision. The entry pages load the new shared `registration-loadout-v179.js` / `.css`; desktop also loads `registration-desktop-v179.js` after its grant/stat modules. Deploy the changed entry pages and app scripts together with these new files. No backend code/schema change, server restart, stock-service update or installer version bump is required.

## Validation

`tests/registration-loadout-v179.browser.mjs` loads both real entry pages with only cloud/IPC boundaries mocked. It checks initial basic grants, profession/origin benefit cards, private skills and sanitized paragraphs, the existing equipment-selection modal, automatic four-slot equipment, backpack/origin capacity, stack quantities, actual mouse drag, keyboard/tap movement, collision/type rejection, compatible swaps, capacity-dependent backpack removal, manual unequip preservation, quantity changes, overweight recovery, full application submission/readback and reload. Identity and pending approval are asserted separately from the draft loadout. Campaign switching, reset, mobile bounds and desktop/web shared-file equality are covered. Screenshots were inspected.

Existing v178 grants/browser/desktop-queue regressions and v135 desktop/web synchronization regressions pass. Native Electron, a live PocketBase application hook and production deployment were not exercised.
