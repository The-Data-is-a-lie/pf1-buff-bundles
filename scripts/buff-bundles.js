// =====================================================
// PATHFINDER 1E BUFF BUNDLE — linked buff groups on the Buffs tab
// - Renders "Bundles" as a native-styled section at the TOP of the
//   PF1 Buffs tab, plus a "Bundles" pill in the filter bar that
//   behaves like the Temporary/Permanent/Spells pills.
// - Each bundle is a row like a buff row; its ON/MIXED/OFF button in
//   the Active column toggles ALL members at once:
//     any member off  -> click turns everything ON
//     all members on  -> click turns everything OFF
// - Click a bundle's name to expand its member list (dots show each
//   member's state; x removes it from the bundle). Drag a buff row
//   onto a bundle to add it.
// - Toggling a buff individually never changes the bundle; the button
//   state is derived from members at render time (ON / OFF / MIXED).
// - Players see and manage bundles only on actors they own.
// - Storage: actor flag  flags.world.buffBundles =
//     { [bundleId]: { name, memberIds: [itemId, ...] } }
//   (world scope kept for compatibility with the original macro version,
//   so bundles created by the macro keep working under the module.)
// =====================================================

const BB_SCOPE = "world";
const BB_LIST_CLASS = "bb-list";
const BB_FILTER_ID = "bundles";

function bbConsole(...args) { console.log("BUFF BUNDLES |", ...args); }

function bbEsc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- storage helpers ----------
function bbRawBundles(actor) {
    let raw = actor?.getFlag ? actor.getFlag(BB_SCOPE, "buffBundles") : actor?.flags?.[BB_SCOPE]?.buffBundles;
    return (raw && typeof raw === "object") ? raw : {};
}

// Members resolved to live buff items. Ids that no longer resolve (deleted
// buffs, engine-pruned granted copies) are silently dropped at read time.
function bbMembers(actor, bundleId) {
    let b = bbRawBundles(actor)[bundleId];
    if (!b) return [];
    let seen = new Set();
    let out = [];
    for (let id of (Array.isArray(b.memberIds) ? b.memberIds : [])) {
        if (seen.has(id)) continue;
        seen.add(id);
        let item = actor.items.get(id);
        if (item && item.type === "buff") out.push(item);
    }
    return out;
}

function bbState(actor, bundleId) {
    let members = bbMembers(actor, bundleId);
    if (!members.length) return "empty";
    let on = members.filter(i => i.system?.active === true).length;
    if (on === members.length) return "on";
    return on === 0 ? "off" : "mixed";
}

function bbGetBundles(actor) {
    let out = {};
    for (let [id, b] of Object.entries(bbRawBundles(actor))) {
        out[id] = { name: String(b?.name ?? "Bundle"), memberIds: bbMembers(actor, id).map(i => i.id) };
    }
    return out;
}

// ---------- mutations ----------
async function bbCreateBundle(actor, name) {
    let id = foundry.utils.randomID();
    await actor.update({ [`flags.${BB_SCOPE}.buffBundles.${id}`]: { name: String(name || "New Bundle"), memberIds: [] } });
    return id;
}

async function bbRenameBundle(actor, bundleId, name) {
    let b = bbRawBundles(actor)[bundleId];
    if (!b) return { ok: false, reason: "no such bundle" };
    await actor.update({ [`flags.${BB_SCOPE}.buffBundles.${bundleId}.name`]: String(name || "Bundle") });
    return { ok: true };
}

async function bbDeleteBundle(actor, bundleId) {
    await actor.update({ [`flags.${BB_SCOPE}.buffBundles.-=${bundleId}`]: null });
    return { ok: true };
}

async function bbAddMember(actor, bundleId, itemId) {
    let b = bbRawBundles(actor)[bundleId];
    if (!b) return { ok: false, reason: "no such bundle" };
    let item = actor.items.get(itemId);
    if (!item || item.type !== "buff") return { ok: false, reason: "not a buff on this actor" };
    // Engine-managed counters only exist to negate the host's own copy — never bundle them.
    if (item.getFlag?.(BB_SCOPE, "counterOf")) return { ok: false, reason: "engine counter buff" };
    let ids = Array.isArray(b.memberIds) ? [...b.memberIds] : [];
    if (ids.includes(itemId)) return { ok: false, reason: "already in bundle" };
    ids.push(itemId);
    await actor.update({ [`flags.${BB_SCOPE}.buffBundles.${bundleId}.memberIds`]: ids });
    return { ok: true };
}

async function bbRemoveMember(actor, bundleId, itemId) {
    let b = bbRawBundles(actor)[bundleId];
    if (!b) return { ok: false, reason: "no such bundle" };
    let ids = (Array.isArray(b.memberIds) ? b.memberIds : []).filter(id => id !== itemId);
    await actor.update({ [`flags.${BB_SCOPE}.buffBundles.${bundleId}.memberIds`]: ids });
    return { ok: true };
}

// All-on-first toggle, batched into ONE embedded-document update so the DB
// round trip (and any per-item updateItem reactions) stay cheap.
// Only members whose state actually differs are written.
async function bbToggleBundle(actor, bundleId) {
    let members = bbMembers(actor, bundleId);
    if (!members.length) return { ok: false, reason: "bundle is empty" };
    let to = !members.every(i => i.system?.active === true);
    let updates = members.filter(i => (i.system?.active === true) !== to).map(i => ({ _id: i.id, "system.active": to }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    return { ok: true, active: to };
}

// ---------- expansion state (survives re-renders, per session) ----------
function bbExpandedSet() {
    game.pf1BuffBundles._expanded = game.pf1BuffBundles._expanded || new Set();
    return game.pf1BuffBundles._expanded;
}

// ---------- sheet section ----------
// Row zebra/hover copied from the system's `.item-list .item` rules: the list
// deliberately does NOT use the `item-list` class, because the sheet's search
// handler iterates `.item-list .item` and crashes on rows whose data-item-id
// isn't a real item. Cell widths still come free via the `item` row class.
const BB_CSS = `
    .${BB_LIST_CLASS} { list-style: none; margin: 0; padding: 0; overflow: hidden; }
    .${BB_LIST_CLASS} .bb-row { padding: 0 2px; border-bottom: 1px solid var(--pf1-faint); background-color: var(--pf1-item-list-bg); }
    .${BB_LIST_CLASS} .bb-row:last-child { border-bottom: none; }
    .${BB_LIST_CLASS} .bb-row.bb-alt { background-color: var(--pf1-item-list-bg-alt); }
    .${BB_LIST_CLASS} .bb-row:hover { background-color: var(--pf1-item-list-hover-bg); color: var(--pf1-item-list-hover-text); }
    .${BB_LIST_CLASS} .bb-row.bb-over { outline: 2px solid #4b8; outline-offset: -2px; }
    .${BB_LIST_CLASS} .bb-caret { flex: 0 0 12px; text-align: center; }
    .${BB_LIST_CLASS} .bb-toggle { width: 100%; height: 20px; font-size: 10px; padding: 0 2px; line-height: 1.8; border-radius: 4px; }
    .${BB_LIST_CLASS} .bb-toggle.st-on { background: rgba(60,160,60,.3); }
    .${BB_LIST_CLASS} .bb-toggle.st-mixed { background: rgba(200,160,40,.3); }
    .${BB_LIST_CLASS} .bb-members { cursor: default; }
    .${BB_LIST_CLASS} .bb-member { display: flex; align-items: center; gap: 6px; padding: 1px 4px; }
    .${BB_LIST_CLASS} .bb-dot { width: 8px; height: 8px; border-radius: 50%; background: #999; display: inline-block; flex: 0 0 auto; }
    .${BB_LIST_CLASS} .bb-dot.on { background: #3c9; }
    .${BB_LIST_CLASS} .bb-member-name { flex: 1; }
    .${BB_LIST_CLASS} .bb-remove-member { cursor: pointer; opacity: .7; padding: 0 4px; font-weight: 700; flex: 0 0 auto; }
    .${BB_LIST_CLASS} .bb-drop { margin: 2px 0; padding: 3px; text-align: center; opacity: .6; border: 1px dashed rgba(120,120,120,.45); border-radius: 6px; }
    .${BB_LIST_CLASS} .bb-none { opacity: .6; padding: 2px 6px; font-size: var(--font-size-12); }

    /* Pinned drop dock — a direct child of the scroll container (.item-groups-list),
       NOT inside .bb-list, so its selectors sit at top level here. Sticky pins it to
       the top of the buff list while everything below scrolls under it. */
    .bb-dock { position: sticky; top: 0; z-index: 5; background: var(--pf1-item-list-bg); padding: 2px; display: flex; flex-direction: column; gap: 2px; }
    .bb-dock-chip { padding: 3px; text-align: center; font-size: var(--font-size-12); opacity: .8; border: 1px dashed rgba(120,120,120,.6); border-radius: 6px; cursor: default; }
    .bb-dock-chip.bb-over { outline: 2px solid #4b8; outline-offset: -2px; opacity: 1; }

    /* Manage-bundle popup. Renders inside a resizable Dialog (no .bb-list ancestor),
       so member/drop styles are scoped to .bb-manage. The flex chain from
       .window-content down lets the member list grow/shrink as the window is
       resized, while the drop zone stays pinned at the top. */
    .bb-manage-dialog .window-content { display: flex; flex-direction: column; }
    .bb-manage-dialog .dialog-content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
    .bb-manage { display: flex; flex-direction: column; gap: 6px; flex: 1 1 auto; min-height: 0; }
    .bb-manage .bb-name-row { display: flex; gap: 4px; flex: 0 0 auto; }
    .bb-manage .bb-name-row input { flex: 1; }
    .bb-manage-members { flex: 1 1 auto; min-height: 60px; display: flex; flex-direction: column; gap: 2px; overflow: auto; }
    .bb-manage .bb-member { display: flex; align-items: center; gap: 6px; padding: 1px 4px; }
    .bb-manage .bb-dot { width: 8px; height: 8px; border-radius: 50%; background: #999; display: inline-block; flex: 0 0 auto; }
    .bb-manage .bb-dot.on { background: #3c9; }
    .bb-manage .bb-member-name { flex: 1; }
    .bb-manage .bb-remove-member { cursor: pointer; opacity: .7; padding: 0 4px; font-weight: 700; flex: 0 0 auto; }
    .bb-manage .bb-none { opacity: .6; padding: 2px 6px; font-size: var(--font-size-12); }
    .bb-manage .bb-drop { flex: 0 0 auto; margin: 0; padding: 10px; text-align: center; opacity: .7; border: 1px dashed rgba(120,120,120,.6); border-radius: 6px; }
    .bb-manage .bb-drop.bb-over { outline: 2px solid #4b8; outline-offset: -2px; opacity: 1; }
`;

// Header mirrors a native section header so columns always line up. Prefer
// cloning a real one from the DOM (tracks system template changes); fall back
// to a static copy of the current template when filters hide every native section.
function bbBuildHeader(tab) {
    let native = tab.querySelector(".buffs-body .item-list-header");
    let header;
    if (native) {
        header = native.cloneNode(true);
        header.className = "item-list-header flexrow buffs-bundles";
        let h3 = header.querySelector(".item-name h3");
        if (h3) h3.textContent = "Bundles";
    } else {
        header = document.createElement("li");
        header.className = "item-list-header flexrow buffs-bundles";
        header.innerHTML = `
            <div class="item-name"><h3>Bundles</h3></div>
            <div class="item-detail item-duration"><span>${bbEsc(game.i18n?.localize("PF1.Duration") ?? "Duration")}</span></div>
            <div class="item-detail item-level"><span>${bbEsc(game.i18n?.localize("PF1.Level") ?? "Level")}</span></div>
            <div class="item-detail item-actions"><i class="icon-pf icon-gears"></i></div>
            <div class="item-detail item-uses"><i class="icon-pf icon-battery-pack"></i></div>
            <div class="item-detail item-active"><span>${bbEsc(game.i18n?.localize("PF1.Active") ?? "Active")}</span></div>
            <div class="item-controls"></div>`;
    }
    let controls = header.querySelector(".item-controls");
    if (controls) controls.innerHTML = `<a class="item-control bb-create" data-tooltip="Create Bundle"><i class="fa-solid fa-plus" inert></i></a>`;
    return header;
}

// Empty item-detail cells matching the header's columns keep row alignment
// identical to native buff rows no matter what columns the system renders.
function bbBuildRow(actor, header, bundleId, bundle, index) {
    let state = bbState(actor, bundleId);
    let label = state === "on" ? "ON" : state === "mixed" ? "MIXED" : "OFF";
    let expanded = bbExpandedSet().has(`${actor.id}:${bundleId}`);
    let members = bbMembers(actor, bundleId);

    let row = document.createElement("li");
    row.className = `item flexrow bb-row${index % 2 ? " bb-alt" : ""}`;
    row.dataset.bundleId = bundleId;

    let name = document.createElement("div");
    name.className = "item-name bb-expand";
    name.innerHTML = `
        <a class="bb-caret"><i class="fa-solid fa-caret-${expanded ? "down" : "right"}" inert></i></a>
        <h4>${bbEsc(bundle?.name ?? "Bundle")}</h4>`;
    row.appendChild(name);

    for (let cell of header.querySelectorAll(".item-detail")) {
        let d = document.createElement("div");
        d.className = cell.className;
        if (d.classList.contains("item-active")) {
            d.innerHTML = `<button type="button" class="bb-toggle st-${state}" title="Any member off: turns everything ON. All on: turns everything OFF.">&#x23FB; ${label}</button>`;
        }
        row.appendChild(d);
    }

    let controls = document.createElement("div");
    controls.className = "item-controls";
    controls.innerHTML = `
        <a class="item-control bb-rename" data-tooltip="Rename Bundle"><i class="fa-solid fa-edit" inert></i></a>
        <a class="item-control bb-delete" data-tooltip="Delete Bundle"><i class="fas fa-trash" inert></i></a>`;
    row.appendChild(controls);

    // Expanded member panel rides inside the row like a native item summary.
    if (expanded) {
        let rows = members.map(i => `
            <div class="bb-member" data-item-id="${i.id}">
                <span class="bb-dot ${i.system?.active ? "on" : ""}"></span>
                <span class="bb-member-name">${bbEsc(i.name)}</span>
                <a class="bb-remove-member" title="Remove from bundle (does not delete the buff)">&times;</a>
            </div>`).join("");
        let panel = document.createElement("div");
        panel.className = "item-summary bb-members";
        // Drop hint inside the open bundle. The actual drop is handled by the row-level
        // dragover/drop listeners (bbWireSection) — the whole expanded row is a drop target;
        // this just makes that obvious and gives empty bundles something to aim at.
        panel.innerHTML = `${rows}<div class="bb-drop">drag buffs here to add</div>`;
        row.appendChild(panel);
    }
    return row;
}

function bbBuildSection(actor, tab) {
    let header = bbBuildHeader(tab);
    let list = document.createElement("ol");
    list.className = BB_LIST_CLASS;
    list.dataset.list = "bundles";
    let style = document.createElement("style");
    style.textContent = BB_CSS;
    list.appendChild(style);
    list.appendChild(header);

    let entries = Object.entries(bbRawBundles(actor));
    if (!entries.length) {
        let none = document.createElement("li");
        none.className = "bb-none";
        none.textContent = "No bundles yet — click + to create one, then drag buffs in.";
        list.appendChild(none);
    }
    entries.forEach(([id, b], i) => list.appendChild(bbBuildRow(actor, header, id, b, i)));
    return list;
}

function bbWireSection(list, actor) {
    list.querySelector(".bb-create")?.addEventListener("click", async () => {
        let name = null;
        try {
            name = await Dialog.prompt({
                title: "New Buff Bundle",
                content: `<p><input type="text" name="bundleName" placeholder="Bundle name" style="width:100%" autofocus/></p>`,
                label: "Create",
                callback: (html) => html.find?.('[name="bundleName"]')?.val() ?? html.querySelector?.('[name="bundleName"]')?.value,
                rejectClose: false
            });
        } catch (e) { name = null; }
        if (name === null || name === undefined) return;
        await bbCreateBundle(actor, String(name).trim() || "New Bundle");
    });

    for (let row of list.querySelectorAll(".bb-row")) {
        let bundleId = row.dataset.bundleId;

        // Name/caret click toggles member expansion (mimics native item summary).
        row.querySelector(".bb-expand")?.addEventListener("click", () => {
            let key = `${actor.id}:${bundleId}`;
            let set = bbExpandedSet();
            set.has(key) ? set.delete(key) : set.add(key);
            // Rebuild in place — no actor update happened, so no auto re-render.
            let tab = row.closest('.tab[data-tab="buffs"]');
            if (tab) bbInjectSection(tab, actor);
        });

        row.querySelector(".bb-toggle")?.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            let res = await bbToggleBundle(actor, bundleId);
            if (!res.ok) ui.notifications.warn(`Bundle: ${res.reason}.`);
        });

        // "Rename" now opens a fuller manage popup: rename + a drop zone you can
        // drag buffs into (the popup shares the page DOM with the sheet).
        row.querySelector(".bb-rename")?.addEventListener("click", (ev) => {
            ev.stopPropagation();
            bbOpenManageDialog(actor, bundleId);
        });

        row.querySelector(".bb-delete")?.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            let name = bbRawBundles(actor)[bundleId]?.name ?? "this bundle";
            let yes = await Dialog.confirm({
                title: "Delete Bundle",
                content: `<p>Delete bundle "<b>${bbEsc(name)}</b>"? The buffs themselves are not touched.</p>`
            });
            if (yes) await bbDeleteBundle(actor, bundleId);
        });

        for (let x of row.querySelectorAll(".bb-remove-member")) {
            x.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                let itemId = ev.currentTarget.closest(".bb-member")?.dataset.itemId;
                if (itemId) await bbRemoveMember(actor, bundleId, itemId);
            });
        }

        // Keep clicks inside the member panel from toggling expansion.
        row.querySelector(".bb-members")?.addEventListener("click", (ev) => ev.stopPropagation());

        // Drag & drop: accept buff rows dragged from this same sheet.
        row.addEventListener("dragover", (ev) => { ev.preventDefault(); row.classList.add("bb-over"); });
        row.addEventListener("dragleave", () => row.classList.remove("bb-over"));
        row.addEventListener("drop", async (ev) => {
            ev.preventDefault();
            // Without this the sheet's own drop handler ALSO fires and duplicates the item.
            ev.stopPropagation();
            row.classList.remove("bb-over");
            let data = null;
            try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (e) {}
            if (data?.type !== "Item" || !data.uuid) return;
            let doc = await fromUuid(data.uuid);
            if (!doc) return;
            // addMember validates it resolves to a buff on THIS actor.
            let res = await bbAddMember(actor, bundleId, doc.id);
            if (!res.ok) ui.notifications.warn(`Bundle: ${res.reason}.`);
        });
    }
}

// ---------- pinned drop dock ----------
// A slim bar of drop chips (one per currently-expanded bundle) that lives as a
// direct child of the scroll container (.item-groups-list) so `position: sticky`
// pins it to the top of the buff list while every buff below scrolls under it.
// It must NOT go inside .bb-list / .item-list — both are overflow:hidden and would
// clip the sticky element. Returns null when nothing is expanded (no dock shown).
function bbBuildDock(actor) {
    let expanded = Object.entries(bbRawBundles(actor))
        .filter(([id]) => bbExpandedSet().has(`${actor.id}:${id}`));
    if (!expanded.length) return null;
    let dock = document.createElement("div");
    dock.className = "bb-dock";
    dock.innerHTML = expanded
        .map(([id, b]) => `<div class="bb-dock-chip" data-bundle-id="${id}">&#xFF0B; drag into ${bbEsc(b?.name ?? "Bundle")}</div>`)
        .join("");
    return dock;
}

// Same accept-a-buff-from-this-sheet drop logic as the bundle rows (bbWireSection).
function bbWireDock(dock, actor) {
    for (let chip of dock.querySelectorAll(".bb-dock-chip")) {
        chip.addEventListener("dragover", (ev) => { ev.preventDefault(); chip.classList.add("bb-over"); });
        chip.addEventListener("dragleave", () => chip.classList.remove("bb-over"));
        chip.addEventListener("drop", async (ev) => {
            ev.preventDefault();
            // Without this the sheet's own drop handler ALSO fires and duplicates the item.
            ev.stopPropagation();
            chip.classList.remove("bb-over");
            let data = null;
            try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (e) {}
            if (data?.type !== "Item" || !data.uuid) return;
            let doc = await fromUuid(data.uuid);
            if (!doc) return;
            let res = await bbAddMember(actor, chip.dataset.bundleId, doc.id);
            if (!res.ok) ui.notifications.warn(`Bundle: ${res.reason}.`);
        });
    }
}

// ---------- manage-bundle popup (rename + drag-drop members) ----------
// A non-modal Dialog that shares the page DOM with the sheet, so buff rows can be
// dragged straight from the sheet onto its drop zone. Stays open, so you can drop
// several buffs in a row; rename and member-remove happen in-place without closing.
function bbManageMembersHtml(actor, bundleId) {
    let members = bbMembers(actor, bundleId);
    if (!members.length) return `<div class="bb-none">No members yet — drag buffs into the box below.</div>`;
    return members.map(i => `
        <div class="bb-member" data-item-id="${i.id}">
            <span class="bb-dot ${i.system?.active ? "on" : ""}"></span>
            <span class="bb-member-name">${bbEsc(i.name)}</span>
            <a class="bb-remove-member" title="Remove from bundle (does not delete the buff)">&times;</a>
        </div>`).join("");
}

function bbOpenManageDialog(actor, bundleId) {
    let current = bbRawBundles(actor)[bundleId]?.name ?? "Bundle";
    let content = `
        <div class="bb-manage">
            <div class="bb-drop bb-manage-drop">drag buffs here to add</div>
            <div class="bb-name-row">
                <input type="text" name="bundleName" value="${bbEsc(current)}" placeholder="Bundle name"/>
                <button type="button" class="bb-manage-rename">Rename</button>
            </div>
            <div class="bb-manage-members">${bbManageMembersHtml(actor, bundleId)}</div>
        </div>`;
    new Dialog({
        title: `Manage Bundle: ${current}`,
        content,
        buttons: { close: { label: "Close" } },
        default: "close",
        render: (html) => {
            // (listeners wired below)
            let root = html?.jquery ? html[0] : (html instanceof HTMLElement ? html : html?.[0]);
            if (!root?.querySelector) return;
            let membersEl = root.querySelector(".bb-manage-members");

            let wireRemove = () => {
                for (let x of membersEl?.querySelectorAll(".bb-remove-member") ?? []) {
                    x.addEventListener("click", async (ev) => {
                        let itemId = ev.currentTarget.closest(".bb-member")?.dataset.itemId;
                        if (itemId) { await bbRemoveMember(actor, bundleId, itemId); refresh(); }
                    });
                }
            };
            let refresh = () => { if (membersEl) { membersEl.innerHTML = bbManageMembersHtml(actor, bundleId); wireRemove(); } };
            wireRemove();

            // Rename applies in-place so the popup can stay open for more drops.
            let input = root.querySelector('[name="bundleName"]');
            let doRename = async () => {
                let trimmed = String(input?.value ?? "").trim();
                if (trimmed && trimmed !== (bbRawBundles(actor)[bundleId]?.name ?? "")) await bbRenameBundle(actor, bundleId, trimmed);
            };
            root.querySelector(".bb-manage-rename")?.addEventListener("click", doRename);
            input?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); doRename(); } });

            // Drop zone: same accept-a-buff-from-this-sheet logic as the rows/dock.
            let drop = root.querySelector(".bb-manage-drop");
            drop?.addEventListener("dragover", (ev) => { ev.preventDefault(); drop.classList.add("bb-over"); });
            drop?.addEventListener("dragleave", () => drop.classList.remove("bb-over"));
            drop?.addEventListener("drop", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                drop.classList.remove("bb-over");
                let data = null;
                try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (e) {}
                if (data?.type !== "Item" || !data.uuid) return;
                let doc = await fromUuid(data.uuid);
                if (!doc) return;
                let res = await bbAddMember(actor, bundleId, doc.id);
                if (!res.ok) ui.notifications.warn(`Bundle: ${res.reason}.`);
                else refresh();
            });
        }
    }, { resizable: true, width: 420, height: 480, classes: ["dialog", "bb-manage-dialog"] }).render(true);
}

// The sheet's search handler skips our rows (see BB_CSS note), so filter
// bundles by name — or any member's name — ourselves.
function bbWireSearch(tab, actor) {
    let input = tab.querySelector(".search-input");
    if (!input || input.dataset.bbBound) return;
    input.dataset.bbBound = "1";
    input.addEventListener("input", () => {
        let q = String(input.value ?? "").toLowerCase();
        for (let row of tab.querySelectorAll(`.${BB_LIST_CLASS} .bb-row`)) {
            if (!q) { row.style.display = ""; continue; }
            let name = bbRawBundles(actor)[row.dataset.bundleId]?.name ?? "";
            let hit = name.toLowerCase().includes(q)
                || bbMembers(actor, row.dataset.bundleId).some(i => i.name.toLowerCase().includes(q));
            row.style.display = hit ? "" : "none";
        }
    });
}

// ---------- filter pill ----------
function bbActiveFilters(app) {
    let set = app?._filters?.sections?.buffs;
    return (set instanceof Set) ? set : null;
}

// The system's filter-pill click handler is DELEGATED on the .filter-list ul,
// so a pill injected into it gets native toggle behavior (including
// shift-click exclusivity) for free — it just stores "bundles" in the same
// per-sheet filter set and re-renders, which brings us back through the hook.
function bbInjectFilterPill(tab, app) {
    let ul = tab.querySelector('.filter-list[data-category="buffs"]');
    if (!ul) return;
    ul.querySelector(`.filter-rule[data-filter="${BB_FILTER_ID}"]`)?.remove();
    let pill = document.createElement("li");
    pill.className = "filter-rule bb-filter";
    pill.dataset.category = "buffs";
    pill.dataset.filter = BB_FILTER_ID;
    pill.textContent = "Bundles";
    if (bbActiveFilters(app)?.has(BB_FILTER_ID)) pill.classList.add("active");
    ul.insertBefore(pill, ul.firstChild);
}

// ---------- injection ----------
function bbInjectSection(tab, actor, app) {
    tab.querySelector(`.${BB_LIST_CLASS}`)?.remove();
    tab.querySelector(".bb-dock")?.remove();
    tab.querySelector(".buff-bundles-panel")?.remove(); // stale panel from the old macro version
    // Same visibility rule the system applies to its own sections: show when
    // no filter is active, or when the Bundles filter is among the active ones.
    let filters = app ? bbActiveFilters(app) : bbActiveFilters(bbAppFor(tab));
    if (filters?.size && !filters.has(BB_FILTER_ID)) return;
    let groups = tab.querySelector(".buffs-body .item-groups-list");
    if (!groups) return;
    let list = bbBuildSection(actor, tab);
    bbWireSection(list, actor);
    groups.insertBefore(list, groups.firstChild);
    // The dock must sit directly in the scroll container, above .bb-list, so its
    // sticky positioning pins it to the top of the buff list.
    let dock = bbBuildDock(actor);
    if (dock) {
        bbWireDock(dock, actor);
        groups.insertBefore(dock, groups.firstChild);
    }
}

// Recover the sheet app from the DOM for rebuilds outside the render hook.
function bbAppFor(tab) {
    let el = tab.closest(".app, .application");
    let id = el?.dataset?.appid;
    return (id != null ? ui.windows?.[id] : null) ?? null;
}

async function bbOnRenderActorSheet(app, html) {
    try {
        let actor = app?.actor ?? app?.document;
        if (!actor?.items) return;
        if (actor.isOwner === false) return;
        // AppV1 hands us jQuery; AppV2 an HTMLElement.
        let root = html?.jquery ? html[0] : (html instanceof HTMLElement ? html : html?.[0]);
        if (!root?.querySelector) return;
        let tab = root.querySelector('.tab[data-tab="buffs"]');
        if (!tab) return;
        bbInjectFilterPill(tab, app);
        bbInjectSection(tab, actor, app);
        bbWireSearch(tab, actor);
    } catch (e) {
        bbConsole("render error:", e);
    }
}

// ---------- registration ----------
// The handler registry mirrors the original macro's idempotent pattern: if the
// standalone macro is run after the module loads, it takes over these hooks
// cleanly instead of double-registering.
Hooks.once("init", () => {
    game.pf1BuffBundles = game.pf1BuffBundles || {};
    for (let h of game.pf1BuffBundles._renderHandlers ?? []) Hooks.off(h.hook, h.fn);
    game.pf1BuffBundles._renderHandlers = [];
    for (let hook of ["renderActorSheet", "renderActorSheetV2"]) {
        Hooks.on(hook, bbOnRenderActorSheet);
        game.pf1BuffBundles._renderHandlers.push({ hook, fn: bbOnRenderActorSheet });
    }

    // Public API for macros and other modules.
    game.pf1BuffBundles.getBundles = bbGetBundles;
    game.pf1BuffBundles.bundleState = bbState;
    game.pf1BuffBundles.toggleBundle = bbToggleBundle;
    game.pf1BuffBundles.createBundle = bbCreateBundle;
    game.pf1BuffBundles.renameBundle = bbRenameBundle;
    game.pf1BuffBundles.deleteBundle = bbDeleteBundle;
    game.pf1BuffBundles.addMember = bbAddMember;
    game.pf1BuffBundles.removeMember = bbRemoveMember;

    bbConsole("module active — Bundles section + filter pill on Buffs tabs.");
});
