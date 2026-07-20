Unreleased

Version 1.0.1 (2026-07-20)

- Pinned drop dock: while a bundle is expanded, a drop chip stays pinned at the top of the buff list, so buffs deep in a long list can be dragged straight up into the bundle without scrolling back.
- Resizable "Manage Bundle" popup (opened from a bundle's Rename control): drag buffs from the sheet onto its top drop zone, remove members inline, and rename in place. The window is resizable and the member list grows to fit.

Version 1.0.0 (2026-07-18)

- Initial release.
- Bundles section at the top of the PF1 Buffs tab, styled like a native sheet section.
- Bundles filter pill in the Buffs filter bar with native pill behavior.
- One-click ON/MIXED/OFF group toggle per bundle (batched into a single actor update).
- Drag-and-drop buffs onto a bundle to add them; expandable member list with per-member state dots and remove buttons.
- Create / rename / delete bundles from the sheet; per-actor storage via actor flags.
- Public API on `game.pf1BuffBundles` for macros and other modules.
