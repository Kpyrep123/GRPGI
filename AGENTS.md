# UI controls

For every multiple-value choice, use the shared `checkbox-picker-v172` component. It enhances `select[multiple]` controls with search, persistent selected chips, and a checkbox on the right of each row. Do not expose native multi-select lists or require Ctrl/Command-click for selection. Keep the underlying select for existing form values and change handlers.

Tags additionally support typed creation and case-insensitive reuse of existing names. Use `data-allow-tag-create172` only on tag controls with a `grpg-create-tag172` handler. Keep newly created tags in the owning form/Hub draft until its normal save; cancellation must not add tags to the saved world. Entity references (maps, NPCs, players, dialogues) support search and checkboxes, but must not create arbitrary IDs from typed text.

When introducing a new page or isolated modal, load the shared script/CSS or call `GRPGCheckboxPickerV172.enhance(root)` after inserting its controls. Preserve existing IDs, form serialization, and domain change handlers. Keep desktop and deployed web component copies identical.
