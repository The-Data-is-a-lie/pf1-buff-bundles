# Pathfinder 1e Buff Bundle

A FoundryVTT module for the **Pathfinder 1e (pf1)** system that adds **Buff Bundles** — linked groups of buffs you can toggle ON or OFF with a single click, straight from the Buffs tab of the character sheet.

The GM installs the module once; every player can then create and manage bundles on the characters they own.

## What it does

- Adds a **Bundles** section at the top of the PF1 **Buffs** tab, styled like a native sheet section.
- Adds a **Bundles** pill to the Buffs filter bar that behaves like the built-in Temporary/Permanent/Spells pills (including shift-click exclusivity).
- Each bundle is a row with an **ON / MIXED / OFF** button in the Active column that toggles **all** member buffs at once:
  - any member off → click turns everything **ON**
  - all members on → click turns everything **OFF**
- All member toggles are batched into a single update, so big bundles stay fast.
- Toggling a buff individually never changes the bundle — the button state (ON / OFF / MIXED) is derived from the members at render time.

## Usage

1. Open a character sheet and go to the **Buffs** tab.
2. Click the **+** in the Bundles header to create a bundle and name it (e.g. "Pre-Combat", "Rage Round", "Divine Might").
3. **Drag buff rows onto the bundle** to add them.
4. Click the bundle's **name** to expand its member list — dots show each member's current state, and **×** removes a buff from the bundle (the buff itself is not deleted).
5. Click the bundle's **ON/MIXED/OFF** button to toggle the whole group.

Bundle membership is stored as a flag on the actor, so bundles follow the character — not the user or the scene. Deleting a bundle never deletes the buffs in it.

## Requirements

- Foundry VTT v10+ (verified on v13)
- [Pathfinder 1e (pf1)](https://foundryvtt.com/packages/pf1) game system

## Installation

**Manifest URL** (Foundry → Add-on Modules → Install Module → paste into "Manifest URL"):

```
https://raw.githubusercontent.com/The-Data-is-a-lie/pf1-buff-bundles/main/module.json
```

Or install manually: download `downloads/pf1-buff-bundles.zip` from this repository and extract it into your `Data/modules/` folder.

Then enable **Pathfinder 1e Buff Bundle** in your world's Manage Modules screen.

## API

The module exposes its functions on `game.pf1BuffBundles` for use in macros or other modules:

| Function | Description |
| --- | --- |
| `getBundles(actor)` | Returns `{ [bundleId]: { name, memberIds } }` with dead member ids pruned. |
| `bundleState(actor, bundleId)` | `"on"`, `"off"`, `"mixed"`, or `"empty"`. |
| `toggleBundle(actor, bundleId)` | All-on-first group toggle (one batched update). |
| `createBundle(actor, name)` | Creates a bundle, returns its id. |
| `renameBundle(actor, bundleId, name)` | Renames a bundle. |
| `deleteBundle(actor, bundleId)` | Deletes a bundle (never touches the buffs). |
| `addMember(actor, bundleId, itemId)` | Adds a buff on that actor to the bundle. |
| `removeMember(actor, bundleId, itemId)` | Removes a buff from the bundle. |

Bundles are stored at `flags.world.buffBundles` on the actor.

## License

[AGPL-3.0](LICENSE)
