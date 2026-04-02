document.addEventListener('DOMContentLoaded', () => {
    const IMG_BASE = 'items/';
    const ITEM_PAGE_SIZE = 40;
    const NOTE_MAX = 120;

    // --- STATE ---
    let allItems = [];
    let inventory = [];
    let pendingAdds = new Map();
    let currentRarity = 'all';
    let currentSort = 'default';
    let currentSHG = null;          // 'h', 'g', or null
    let invSearchQuery = '';
    let searchDebounceTimer = null;
    let filteredItemCache = [];
    let renderedItemCount = 0;
    let isLoadingMore = false;
    let itemListObserver = null;


    const RARITY_ORDER = { Legendary: 0, Epic: 1, Rare: 2, Common: 3 };
    const SORT_LABELS = { 'default': 'Value', 'rarity': 'Rarity', 'name': 'Name', 'added order': 'Added Order' };

    // Stability colours — exactly matching CSS variables / guide
    const STABILITY_COLORS = {
        'rising': '#34d399',
        'improving': '#46d27a',
        'doing-well': '#a3e635',
        'fluctuating': '#facc15',
        'struggling': '#fb923c',
        'receding': '#f87171',
        'dropping': '#ef4444',
    };

    // --- DOM ---
    const modal = document.getElementById('item-modal');
    const itemList = document.getElementById('item-list');
    const closeModalBtn = document.querySelector('.close-modal');
    const searchInput = document.getElementById('item-search');
    const raritySidebar = document.querySelector('.rarity-sidebar');
    const inventoryGrid = document.getElementById('inventory-grid');
    const emptyState = document.getElementById('inventory-empty');
    const statTotalValue = document.getElementById('stat-total-value');
    const statUniqueItems = document.getElementById('stat-unique-items');
    const statTotalQty = document.getElementById('stat-total-qty');
    const invSearchEl = document.getElementById('inv-search');
    const invSearchClear = document.getElementById('inv-search-clear');
    const invNoteEl = document.getElementById('inv-note');
    const invNoteCount = document.getElementById('inv-note-count');
    const confirmOverlay = document.getElementById('confirm-dialog');

    // Sort dropdown elements
    const sortDropdown = document.getElementById('inv-sort-dropdown');
    const sortTrigger = document.getElementById('inv-sort-trigger');
    const sortLabel = document.getElementById('inv-sort-label');
    const sortMenu = document.getElementById('inv-sort-menu');

    // Sidebar toggle elements
    const inventorySidebar = document.getElementById('inventory-sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

    // --- SIDEBAR MINIMIZE/EXPAND ---
    function initSidebarToggle() {
        const isMinimized = localStorage.getItem('inv-sidebar-minimized') === 'true';
        if (isMinimized) {
            inventorySidebar.classList.add('minimized');
            sidebarToggleBtn.classList.add('minimized');
            document.querySelector('.sidebar-wrapper').classList.add('minimized');
            document.documentElement.setAttribute('data-sidebar-minimized', 'true');
        }
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }

    function toggleSidebar() {
        inventorySidebar.classList.toggle('minimized');
        sidebarToggleBtn.classList.toggle('minimized');
        document.querySelector('.sidebar-wrapper').classList.toggle('minimized');
        const isMinimized = inventorySidebar.classList.contains('minimized');
        localStorage.setItem('inv-sidebar-minimized', isMinimized);
        // Update data attribute for consistency
        if (isMinimized) {
            document.documentElement.setAttribute('data-sidebar-minimized', 'true');
        } else {
            document.documentElement.removeAttribute('data-sidebar-minimized');
        }
    }

    // --- CUSTOM DIALOG ---
    function showConfirm({ title, message, confirmLabel, cancelLabel, onConfirm, variant }) {
        if (!confirmOverlay) return;
        document.getElementById('confirm-icon').style.display = 'none';
        document.getElementById('confirm-title').textContent = title || 'Are you sure?';
        document.getElementById('confirm-msg').textContent = message || '';
        const actions = document.getElementById('confirm-actions');
        actions.innerHTML = '';

        const btnCancel = document.createElement('button');
        btnCancel.className = 'confirm-btn-secondary';
        btnCancel.textContent = cancelLabel || 'Cancel';
        btnCancel.onclick = () => confirmOverlay.classList.remove('is-visible');
        actions.appendChild(btnCancel);

        const btnConfirm = document.createElement('button');
        btnConfirm.className = variant === 'danger' ? 'confirm-btn-danger' : 'confirm-btn-primary';
        btnConfirm.textContent = confirmLabel || 'Confirm';
        btnConfirm.onclick = () => { confirmOverlay.classList.remove('is-visible'); if (onConfirm) onConfirm(); };
        actions.appendChild(btnConfirm);

        confirmOverlay.classList.add('is-visible');
        btnCancel.focus();
    }

    function showAlert({ title, message }) {
        if (!confirmOverlay) return;
        document.getElementById('confirm-icon').style.display = 'none';
        document.getElementById('confirm-title').textContent = title || 'Notice';
        document.getElementById('confirm-msg').textContent = message || '';
        const actions = document.getElementById('confirm-actions');
        actions.innerHTML = '';

        const btnOk = document.createElement('button');
        btnOk.className = 'confirm-btn-primary';
        btnOk.textContent = 'OK';
        btnOk.onclick = () => confirmOverlay.classList.remove('is-visible');
        actions.appendChild(btnOk);

        confirmOverlay.classList.add('is-visible');
        btnOk.focus();
    }

    // --- PERSISTENCE ---
    function saveInventory() {
        try { localStorage.setItem('ftf-inventory', JSON.stringify(inventory)); }
        catch (e) { console.error('Failed to save inventory:', e); }
    }
    function loadInventory() {
        try {
            const saved = localStorage.getItem('ftf-inventory');
            if (saved) inventory = JSON.parse(saved);
        } catch (e) { inventory = []; }
    }

    function saveNote() {
        try { if (invNoteEl) localStorage.setItem('ftf-inv-note', invNoteEl.value); }
        catch (e) { console.error('Failed to save note:', e); }
    }
    function loadNote() {
        try {
            const saved = localStorage.getItem('ftf-inv-note');
            if (saved && invNoteEl) {
                invNoteEl.value = saved;
                invNoteEl.dispatchEvent(new Event('input'));
            }
        } catch (e) { console.error('Failed to load note:', e); }
    }

    function saveSortOptions() {
        try {
            localStorage.setItem('ftf-inv-sort', JSON.stringify({ sort: currentSort, desc: sortDescending }));
        } catch (e) { console.error('Failed to save sort options:', e); }
    }
    function loadSortOptions() {
        try {
            const savedSort = localStorage.getItem('ftf-inv-sort');
            if (savedSort) {
                const data = JSON.parse(savedSort);
                currentSort = data.sort || 'default';
                sortDescending = data.desc !== undefined ? data.desc : false;
                if (sortLabel) {
                    sortLabel.textContent = 'Sort: ' + (SORT_LABELS[currentSort] || 'Value');
                }
                updateSortDirButton();
                // Update active state in menu
                if (sortMenu) {
                    sortMenu.querySelectorAll('.inv-sort-option').forEach(b => b.classList.remove('active'));
                    const opt = sortMenu.querySelector(`.inv-sort-option[data-value="${currentSort}"]`);
                    if (opt) opt.classList.add('active');
                }
            }
        } catch (e) { console.error('Failed to load sort options:', e); }
    }
    function sanitizeLive(raw) {
        return raw
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')      // control chars
            .replace(/[\u200B-\u200D\u2028\u2029\uFEFF]/g, '')  // zero-width / line seps
            .slice(0, NOTE_MAX);
    }
    function sanitizeNote(raw) {
        return sanitizeLive(raw).trim();
    }

    // --- SORT ---
    let sortDescending = false;
    function getSortedInventory() {
        const arr = [...inventory];
        switch (currentSort) {
            case 'rarity': {
                const dir = sortDescending ? -1 : 1;
                return arr.sort((a, b) =>
                    dir * ((RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99)) ||
                    a.name.localeCompare(b.name));
            }
            case 'name':
                return sortDescending
                    ? arr.sort((a, b) => b.name.localeCompare(a.name))
                    : arr.sort((a, b) => a.name.localeCompare(b.name));
            case 'default': {
                const dir = sortDescending ? -1 : 1;
                return arr.map((item, index) => ({ item, index })).sort((a, b) => {
                    const valA = window.FTFData.calculateItemValue(a.item) * (a.item.quantity || 1);
                    const valB = window.FTFData.calculateItemValue(b.item) * (b.item.quantity || 1);
                    if (valA !== valB) return dir * (valB - valA);

                    const rarA = RARITY_ORDER[a.item.rarity] ?? 99;
                    const rarB = RARITY_ORDER[b.item.rarity] ?? 99;
                    if (rarA !== rarB) return rarA - rarB;

                    if (a.index !== b.index) return a.index - b.index;
                    return a.item.name.localeCompare(b.item.name);
                }).map(o => o.item);
            }
            case 'added order':
                return sortDescending ? arr : [...arr].reverse();
            default: return arr;
        }
    }

    function getSortedFilteredInventory() {
        const sorted = getSortedInventory();
        if (!invSearchQuery) return sorted;
        const q = invSearchQuery.toLowerCase();
        return sorted.filter(i => i.name.toLowerCase().includes(q));
    }

    function getSortLabel() {
        return SORT_LABELS[currentSort] || 'Value';
    }

    function updateSortDirButton() {
        const dirBtn = document.getElementById('inv-sort-dir');
        if (!dirBtn) return;
        dirBtn.classList.toggle('desc', !sortDescending);
    }

    const RARITY_COLORS = {
        Legendary: 'comp-legendary',
        Epic: 'comp-epic',
        Rare: 'comp-rare',
        Common: 'comp-common',
    };
    const RARITY_SEQUENCE = Object.keys(RARITY_ORDER).sort((a, b) => RARITY_ORDER[a] - RARITY_ORDER[b]);

    // --- GRID RENDERING ---
    function renderInventory() {
        inventoryGrid.innerHTML = '';
        const display = getSortedFilteredInventory();
        const actuallyEmpty = inventory.length === 0;
        const searchEmpty = !actuallyEmpty && display.length === 0;

        if (actuallyEmpty) {
            emptyState.style.display = 'flex';
            emptyState.querySelector('p').textContent = 'Your inventory is empty';
            emptyState.querySelector('span').textContent = 'Click "+ Add Items" to start tracking your collection';
        } else if (searchEmpty) {
            emptyState.style.display = 'flex';
            emptyState.querySelector('p').textContent = 'No items match your search';
            emptyState.querySelector('span').textContent = 'Try a different name';
        } else {
            emptyState.style.display = 'none';
        }

        if (currentSort === 'rarity') {
            const groups = {};
            RARITY_SEQUENCE.forEach(r => { groups[r] = []; });
            display.forEach(item => {
                if (groups[item.rarity]) groups[item.rarity].push(item);
                else groups['Common'].push(item);
            });
            const sequenceToRender = sortDescending ? [...RARITY_SEQUENCE].reverse() : RARITY_SEQUENCE;

            sequenceToRender.forEach(rarity => {
                const items = groups[rarity];
                if (!items.length) return;
                const groupEl = document.createElement('div');
                groupEl.className = 'inv-rarity-group';
                const header = document.createElement('div');
                header.className = `inv-rarity-header ${RARITY_COLORS[rarity] || ''}`;
                header.textContent = `${rarity} — ${items.length} item${items.length !== 1 ? 's' : ''}`;
                groupEl.appendChild(header);
                const grid = document.createElement('div');
                grid.className = 'inventory-grid-inner';
                items.forEach(item => grid.appendChild(createInventoryCard(item)));
                groupEl.appendChild(grid);
                inventoryGrid.appendChild(groupEl);
            });
        } else {
            const grid = document.createElement('div');
            grid.className = 'inventory-grid-inner';
            display.forEach(item => grid.appendChild(createInventoryCard(item)));
            inventoryGrid.appendChild(grid);
        }
        updateStats();
    }

    function createInventoryCard(item) {
        const card = document.createElement('div');
        card.className = 'inv-card';

        const stabilityType = item.stabilityType || window.FTFData.parseStabilityType(item.stability);
        if (stabilityType) card.dataset.stability = stabilityType;
        if (window.FTFData.shouldShowSHGBadge(item)) card.dataset.shg = item.shg;

        const updateCardValue = (qty) => {
            const val = window.FTFData.calculateItemValue(item) * (qty || 1);
            return window.FTFData.formatFV(val) + ' fv';
        };
        const initialValue = updateCardValue(item.quantity);
        const filename = encodeURIComponent(item.name + '.webp');

        card.innerHTML = `
            <button class="inv-card-remove" aria-label="Remove ${item.name}">&times;</button>
            <div class="inv-card-img">
                <img src="${IMG_BASE}${filename}"
                     loading="lazy"
                     onerror="this.src='${IMG_BASE}Default.webp'"
                     alt="${item.name}">
            </div>
            <div class="inv-card-info">
                <div class="inv-card-name" title="${item.name}">${item.name}</div>
                <div class="inv-card-value">${initialValue}</div>
            </div>
            <div class="inv-card-qty">
                <button class="qty-btn dec" aria-label="Decrease">−</button>
                <input class="qty-input" type="number" value="${item.quantity}" min="1" max="100" aria-label="Quantity">
                <button class="qty-btn inc" aria-label="Increase">+</button>
            </div>`;

        const valSpan = card.querySelector('.inv-card-value');

        card.querySelector('.inv-card-remove').onclick = (e) => {
            e.stopPropagation();
            const targetSHG = item.shg || null;
            const idx = inventory.findIndex(i => i.name === item.name && (i.shg || null) === targetSHG);
            if (idx !== -1) inventory.splice(idx, 1);
            saveInventory();
            renderInventory();
        };

        const input = card.querySelector('.qty-input');
        card.querySelector('.inc').onclick = () => {
            item.quantity = Math.min(100, (item.quantity || 1) + 1);
            if (normalizeInventory()) { saveInventory(); renderInventory(); } 
            else { input.value = item.quantity; valSpan.textContent = updateCardValue(item.quantity); saveInventory(); updateStats(); }
        };
        card.querySelector('.dec').onclick = () => {
            item.quantity = Math.max(1, (item.quantity || 1) - 1);
            if (normalizeInventory()) { saveInventory(); renderInventory(); }
            else { input.value = item.quantity; valSpan.textContent = updateCardValue(item.quantity); saveInventory(); updateStats(); }
        };
        input.oninput = (e) => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            e.target.value = val;
            if (val === '') return;
            const num = Math.min(100, Math.max(1, parseInt(val)));
            item.quantity = num; e.target.value = num;
            if (normalizeInventory()) { saveInventory(); renderInventory(); }
            else { valSpan.textContent = updateCardValue(item.quantity); saveInventory(); updateStats(); }
        };
        input.onblur = (e) => {
            if (!e.target.value || Number(e.target.value) < 1) {
                e.target.value = 1; item.quantity = 1;
                if (normalizeInventory()) { saveInventory(); renderInventory(); }
                else { valSpan.textContent = updateCardValue(item.quantity); saveInventory(); updateStats(); }
            }
        };
        input.onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };

        return card;
    }

    // --- STATS ---
    function normalizeInventory() {
        let changed = false;
        const groups = {};
        inventory.forEach(i => {
            if (i.quantity === undefined) i.quantity = 1;
            if (!groups[i.name]) groups[i.name] = { set: null, h: null, g: null };
            if (i.shg === 'h') groups[i.name].h = i;
            else if (i.shg === 'g') groups[i.name].g = i;
            else groups[i.name].set = i;
        });

        Object.keys(groups).forEach(name => {
            const hItem = groups[name].h;
            const gItem = groups[name].g;
            let setItem = groups[name].set;

            if (hItem && gItem && hItem.quantity > 0 && gItem.quantity > 0) {
                changed = true;
                const pairs = Math.min(hItem.quantity, gItem.quantity);
                
                if (!setItem) {
                    setItem = { ...hItem, shg: null, quantity: 0 };
                    inventory.push(setItem);
                }
                
                const room = Math.max(0, 100 - setItem.quantity);
                const toAdd = Math.min(pairs, room);
                
                setItem.quantity += toAdd;
                hItem.quantity -= pairs;
                gItem.quantity -= pairs;
            }
        });

        const lenBefore = inventory.length;
        inventory = inventory.filter(i => i.quantity > 0);
        if (inventory.length !== lenBefore) changed = true;

        return changed;
    }

    function updateStats() {
        const totalValue = inventory.reduce((s, i) => s + window.FTFData.calculateItemValue(i) * (i.quantity || 1), 0);
        if (statTotalValue) statTotalValue.textContent = window.FTFData.formatFV(totalValue) + ' fv';

        let totalUnique = 0;
        let totalQty = 0;
        const ownedNames = [];

        inventory.forEach(i => {
             if (i.shg === null) {
                 totalUnique += 1;
                 totalQty += (i.quantity || 1);
                 ownedNames.push(i.name);
             }
        });

        if (statUniqueItems) statUniqueItems.textContent = totalUnique.toLocaleString();
        if (statTotalQty) statTotalQty.textContent = totalQty.toLocaleString();

        RARITY_SEQUENCE.forEach(rarity => {
            const el = document.getElementById(`stat-${rarity.toLowerCase()}-value`);
            if (!el) return;
            const val = inventory.filter(i => (i.rarity || '').toLowerCase() === rarity.toLowerCase())
                .reduce((s, i) => s + window.FTFData.calculateItemValue(i) * (i.quantity || 1), 0);
            el.textContent = window.FTFData.formatFV(val) + ' fv';
        });

        const nameGroups = {};
        inventory.forEach(i => {
           if (i.shg === null) nameGroups[i.name] = { rarity: i.rarity };
        });

        updateRarityCompletion(ownedNames, nameGroups);
    }

    function updateRarityCompletion(ownedNames, nameGroups) {
        RARITY_SEQUENCE.forEach(rarity => {
            const total = allItems.filter(i => i.rarity === rarity).length;
            const owned = ownedNames.filter(name => nameGroups[name].rarity === rarity).length;
            const pct = total > 0 ? (owned / total) * 100 : 0;
            const el = document.getElementById(`completion-${rarity.toLowerCase()}`);
            if (!el) return;
            el.querySelector('.completion-bar-fill').style.width = pct + '%';
            el.querySelector('.completion-count').textContent = total > 0 ? `${owned} / ${total}` : `${owned} / \u2014`;
            el.querySelector('.completion-pct').textContent = Math.round(pct) + '%';
        });
    }

    // --- MODAL ---
    function openModal() {
        pendingAdds.clear();
        currentRarity = 'all';
        currentSHG = null;
        if (searchInput) searchInput.value = '';
        if (raritySidebar) {
            raritySidebar.querySelectorAll('.rarity-filter-btn').forEach(b => b.classList.remove('active'));
            raritySidebar.querySelector('[data-rarity="all"]')?.classList.add('active');
            raritySidebar.querySelectorAll('.shg-btn').forEach(b => b.classList.remove('active'));
        }
        updateDoneButton();
        if (modal) modal.style.display = 'flex';
        setTimeout(() => updateDisplayedItems(), 0);
        if (searchInput && window.innerWidth > 768) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    function updateDoneButton() {
        const btn = document.getElementById('inv-modal-done');
        if (!btn) return;
        const n = pendingAdds.size;
        if (n > 0) {
            btn.textContent = `Add ${n} Item${n !== 1 ? 's' : ''}`;
            btn.style.display = '';
        } else {
            btn.style.display = 'none';
        }
    }

    function commitAndClose() {
        // Store SHG value for each item
        pendingAdds.forEach((itemData, key) => {
            const itemSHG = itemData.shg || null;
            const existing = inventory.find(i => i.name === itemData.name && (i.shg || null) === itemSHG);
            if (existing) {
                existing.quantity = Math.min(100, (existing.quantity || 1) + 1);
            } else {
                inventory.push({ ...itemData, shg: itemSHG, quantity: 1 });
            }
        });
        pendingAdds.clear();
        normalizeInventory();
        saveInventory(); renderInventory();
        if (modal) modal.style.display = 'none';
        disconnectObserver();
    }

    function dismissWithoutAdding() {
        pendingAdds.clear();
        if (modal) modal.style.display = 'none';
        disconnectObserver();
    }

    function tryDismissModal() {
        if (pendingAdds.size > 0) {
            const n = pendingAdds.size;
            showConfirm({
                title: 'Discard selected items?',
                message: `You have ${n} item${n !== 1 ? 's' : ''} selected that won't be added. Press "Add ${n} Item${n !== 1 ? 's' : ''}" if you want ${n !== 1 ? 'them' : 'it'} added.`,
                confirmLabel: 'Discard',
                cancelLabel: 'Go Back',
                variant: 'danger',
                onConfirm: dismissWithoutAdding,
            });
        } else {
            dismissWithoutAdding();
        }
    }

    function disconnectObserver() {
        if (itemListObserver) { itemListObserver.disconnect(); itemListObserver = null; }
    }

    // --- LAZY LOAD ---
    function setupScrollObserver() {
        disconnectObserver();
        const sentinel = document.createElement('div');
        sentinel.id = 'item-list-sentinel';
        sentinel.style.cssText = 'height:1px;width:100%;grid-column:1/-1;';
        itemList.appendChild(sentinel);
        itemListObserver = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !isLoadingMore) loadNextBatch();
        }, { root: itemList, rootMargin: '100px' });
        itemListObserver.observe(sentinel);
    }

    function loadNextBatch() {
        if (renderedItemCount >= filteredItemCache.length) return;
        isLoadingMore = true;
        document.getElementById('item-list-sentinel')?.remove();
        const batch = filteredItemCache.slice(renderedItemCount, renderedItemCount + ITEM_PAGE_SIZE);
        const frag = document.createDocumentFragment();
        batch.forEach(item => frag.appendChild(createModalItem(item)));
        itemList.appendChild(frag);
        renderedItemCount += batch.length;
        if (renderedItemCount < filteredItemCache.length) setupScrollObserver();
        isLoadingMore = false;
    }

    function createModalItem(item) {
        const div = document.createElement('div');
        const shgStr = currentSHG || 'none';
        const key = `${item.name}-${shgStr}`;
        const isPending = pendingAdds.has(key);
        // Owned lookup uses name + current shg to reflect specific variant exactly
        const isOwned = inventory.some(i => i.name === item.name && (i.shg || 'none') === shgStr);
        div.className = `modal-item${isPending ? ' inv-pending' : ''}`;
        div.dataset.itemName = item.name;
        const filename = encodeURIComponent(item.name + '.webp');
        div.innerHTML = `
            <div class="modal-item-img">
                <img src="${IMG_BASE}${filename}" loading="lazy"
                     onerror="this.src='${IMG_BASE}Default.webp'" alt="${item.name}">
                ${isOwned ? '<div class="inv-owned-badge">Owned</div>' : ''}
            </div>
            <div class="modal-item-name">${item.name}</div>`;
        div.onclick = () => {
            const currentKey = `${item.name}-${currentSHG || 'none'}`;
            if (pendingAdds.has(currentKey)) {
                pendingAdds.delete(currentKey);
                div.classList.remove('inv-pending');
            } else {
                pendingAdds.set(currentKey, {
                    name: item.name,
                    rarity: item.rarity,
                    baseValue: item.value,   // always store raw base value
                    value: item.value,
                    stability: item.stability,
                    stabilityType: window.FTFData.parseStabilityType(item.stability),
                    shg: currentSHG || null,  // capture H/G at selection time, not commit time
                });
                div.classList.add('inv-pending');
            }
            updateDoneButton();
        };
        return div;
    }

    function updateDisplayedItems() {
        if (!itemList || !searchInput) return;
        disconnectObserver();
        itemList.innerHTML = '';
        renderedItemCount = 0; isLoadingMore = false;

        if (allItems.length === 0) {
            itemList.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:#999;">Loading items…</div>';
            return;
        }
        const query = searchInput.value.toLowerCase().trim();
        let filtered = allItems;
        if (currentRarity !== 'all') filtered = filtered.filter(i => i.rarity.toLowerCase() === currentRarity);
        if (query) filtered = filtered.filter(i => i.name.toLowerCase().includes(query));

        if (filtered.length === 0) {
            itemList.innerHTML = '<p style="color:#999;text-align:center;padding:2rem;grid-column:1/-1;">No items found</p>';
            return;
        }
        filteredItemCache = filtered;
        const frag = document.createDocumentFragment();
        filteredItemCache.slice(0, ITEM_PAGE_SIZE).forEach(i => frag.appendChild(createModalItem(i)));
        renderedItemCount = Math.min(ITEM_PAGE_SIZE, filteredItemCache.length);
        itemList.appendChild(frag);
        if (renderedItemCount < filteredItemCache.length) setupScrollObserver();
    }

    // =====================================================================
    // SCREENSHOT
    // =====================================================================
    const SS = {
        COLS: 8,
        ITEMS_PER_PAGE: 56,
        CANVAS_W: 1200,
        H_PAD: 22,
        CELL_GAP: 9,
        CELL_H: 148,
        HEADER_H: 68,
        NOTE_H: 36,
        FOOTER_H: 40,
        V_PAD: 14,
        RARITY_COLORS: {
            legendary: '#f59e0b',
            epic: '#a855f7',
            rare: '#3b82f6',
            common: '#6b7280',
        },
    };

    function cellW() {
        return Math.floor((SS.CANVAS_W - SS.H_PAD * 2 - (SS.COLS - 1) * SS.CELL_GAP) / SS.COLS);
    }

    async function takeScreenshots() {
        if (inventory.length === 0) {
            showAlert({ title: 'Nothing to screenshot', message: 'Your inventory is empty. Add some items first.' });
            return;
        }

        const btn = document.getElementById('screenshot-btn');
        btn.disabled = true;
        btn.textContent = 'Preparing…';

        // Read + sanitise note safely
        const rawNote = invNoteEl ? invNoteEl.value : '';
        const note = sanitizeNote(rawNote);

        const CW = cellW();
        const sorted = getSortedInventory();
        const pages = [];
        for (let i = 0; i < sorted.length; i += SS.ITEMS_PER_PAGE) {
            pages.push(sorted.slice(i, i + SS.ITEMS_PER_PAGE));
        }

        // Pre-load all images
        btn.textContent = `Loading images (0 / ${sorted.length})…`;
        const imgCache = new Map();

        const loadImg = (src) => new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });

        let loaded = 0;
        await Promise.all(sorted.map(async item => {
            let img = await loadImg(`${IMG_BASE}${encodeURIComponent(item.name + '.webp')}`);
            if (!img) img = await loadImg(`${IMG_BASE}Default.webp`);
            imgCache.set(item.name, img);
            loaded++;
            if (loaded % 15 === 0) btn.textContent = `Loading images (${loaded} / ${sorted.length})…`;
        }));

        for (let pi = 0; pi < pages.length; pi++) {
            const pageItems = pages[pi];
            const rows = Math.ceil(pageItems.length / SS.COLS);
            const noteOffset = note ? SS.NOTE_H : 0;
            const canvasH = SS.HEADER_H + noteOffset + SS.V_PAD
                + rows * SS.CELL_H + (rows - 1) * SS.CELL_GAP
                + SS.V_PAD + SS.FOOTER_H;

            const canvas = document.createElement('canvas');
            canvas.width = SS.CANVAS_W;
            canvas.height = canvasH;
            const ctx = canvas.getContext('2d');

            // ── Background ──────────────────────────────────────────────
            const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
            bgGrad.addColorStop(0, '#130826');
            bgGrad.addColorStop(1, '#08010f');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, SS.CANVAS_W, canvasH);

            // Subtle dot texture
            ctx.fillStyle = 'rgba(255,255,255,0.016)';
            for (let gx = SS.H_PAD; gx < SS.CANVAS_W - SS.H_PAD; gx += 20) {
                for (let gy = SS.HEADER_H + noteOffset; gy < canvasH - SS.FOOTER_H; gy += 20) {
                    ctx.fillRect(gx, gy, 1, 1);
                }
            }

            // ── Header ───────────────────────────────────────────────────
            const hGrad = ctx.createLinearGradient(0, 0, SS.CANVAS_W, 0);
            hGrad.addColorStop(0, '#2a0e5a'); hGrad.addColorStop(0.5, '#1e0845'); hGrad.addColorStop(1, '#2a0e5a');
            ctx.fillStyle = hGrad;
            ctx.fillRect(0, 0, SS.CANVAS_W, SS.HEADER_H);

            const lineGrad = ctx.createLinearGradient(0, 0, SS.CANVAS_W, 0);
            lineGrad.addColorStop(0, 'transparent'); lineGrad.addColorStop(0.15, '#7c3aed');
            lineGrad.addColorStop(0.85, '#7c3aed'); lineGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = lineGrad;
            ctx.fillRect(0, SS.HEADER_H - 2, SS.CANVAS_W, 2);

            ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
            ctx.font = 'bold 24px Arial, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('FTF Inventory', SS.H_PAD, SS.HEADER_H / 2 - 5);

            ctx.font = '12px Arial, sans-serif';
            ctx.fillStyle = '#9d7fd4';
            ctx.fillText(`Sorted by ${getSortLabel()}`, SS.H_PAD, SS.HEADER_H / 2 + 12);

            ctx.textAlign = 'right';
            ctx.font = 'bold 14px Arial, sans-serif';
            ctx.fillStyle = '#c4a0ff';
            const totalQty = pageItems.reduce((s, i) => s + (i.quantity || 1), 0);
            const totalVal = pageItems.reduce((s, i) => s + window.FTFData.calculateItemValue(i) * (i.quantity || 1), 0);
            ctx.fillText(`${totalQty} item${totalQty !== 1 ? 's' : ''} \u00B7 ${window.FTFData.formatFV(totalVal)} fv`, SS.CANVAS_W - SS.H_PAD, SS.HEADER_H / 2 - 6);
            if (pages.length > 1) {
                ctx.font = '12px Arial, sans-serif'; ctx.fillStyle = '#7a5faa';
                ctx.fillText(`Page ${pi + 1} of ${pages.length}`, SS.CANVAS_W - SS.H_PAD, SS.HEADER_H / 2 + 10);
            }

            // ── Note band ────────────────────────────────────────────────
            if (note) {
                const ny = SS.HEADER_H;
                ctx.fillStyle = 'rgba(124,58,237,0.11)';
                ctx.fillRect(0, ny, SS.CANVAS_W, SS.NOTE_H);
                ctx.fillStyle = 'rgba(124,58,237,0.7)';
                ctx.fillRect(0, ny, 3, SS.NOTE_H);
                ctx.fillStyle = 'rgba(124,58,237,0.2)';
                ctx.fillRect(0, ny + SS.NOTE_H - 1, SS.CANVAS_W, 1);
                ctx.font = '13px Arial, sans-serif';
                ctx.fillStyle = '#9d7fd4'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText('✎', SS.H_PAD, ny + SS.NOTE_H / 2);
                ctx.font = 'italic 13px Arial, sans-serif';
                ctx.fillStyle = '#e2d4ff';
                ctx.fillText(note, SS.H_PAD + 22, ny + SS.NOTE_H / 2);
            }

            // ── Item cells ───────────────────────────────────────────────
            const itemsTop = SS.HEADER_H + noteOffset + SS.V_PAD;
            pageItems.forEach((item, idx) => {
                const col = idx % SS.COLS;
                const row = Math.floor(idx / SS.COLS);
                const cx = SS.H_PAD + col * (CW + SS.CELL_GAP);
                const cy = itemsTop + row * (SS.CELL_H + SS.CELL_GAP);
                drawCell(ctx, cx, cy, CW, SS.CELL_H, item, imgCache.get(item.name));
            });

            // ── Footer ───────────────────────────────────────────────────
            const footerY = canvasH - SS.FOOTER_H;
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(0, footerY, SS.CANVAS_W, SS.FOOTER_H);
            const fGrad = ctx.createLinearGradient(0, 0, SS.CANVAS_W, 0);
            fGrad.addColorStop(0, 'transparent'); fGrad.addColorStop(0.2, 'rgba(124,58,237,0.3)');
            fGrad.addColorStop(0.8, 'rgba(124,58,237,0.3)'); fGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = fGrad; ctx.fillRect(0, footerY, SS.CANVAS_W, 1);
            ctx.font = '12px Arial, sans-serif'; ctx.fillStyle = '#5a3d8a';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText("Zarys's FTF Calculator", SS.CANVAS_W / 2, footerY + SS.FOOTER_H / 2);

            // ── Download ─────────────────────────────────────────────────
            btn.textContent = `Saving ${pi + 1} / ${pages.length}…`;
            try {
                const link = document.createElement('a');
                link.download = pages.length > 1
                    ? `ftf-inventory-${pi + 1}-of-${pages.length}.png`
                    : 'ftf-inventory.png';
                link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (err) {
                console.error('Canvas export failed:', err);
                showAlert({ title: 'Screenshot failed', message: 'Images may be blocked by cross-origin policy. Try refreshing and retrying.' });
                break;
            }
            if (pi < pages.length - 1) await new Promise(r => setTimeout(r, 500));
        }

        btn.disabled = false;
        btn.textContent = 'Save as Image';
    }

    // ── Draw one item cell ────────────────────────────────────────────────
    function drawCell(ctx, x, y, w, h, item, img) {
        const rarity = (item.rarity || '').toLowerCase();
        const rColor = SS.RARITY_COLORS[rarity] || '#6b7280';
        const stability = item.stabilityType || window.FTFData.parseStabilityType(item.stability);
        const stabColor = STABILITY_COLORS[stability];

        // Cell background
        ctx.fillStyle = 'rgba(255,255,255,0.038)';
        rrect(ctx, x, y, w, h, 7); ctx.fill();

        // Cell border — stability colour if present, otherwise subtle neutral
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 2, y + 3, w + 4, h - 1); // Clip out the top 3px so stroke isn't drawn there
        ctx.clip();
        ctx.strokeStyle = stabColor ? `rgba(${hexToRgb(stabColor)},0.65)` : 'rgba(255,255,255,0.07)';
        ctx.lineWidth = stabColor ? 1.5 : 1;
        rrect(ctx, x, y, w, h, 7); ctx.stroke();
        ctx.restore();

        // Rarity top stripe
        ctx.fillStyle = rColor; ctx.globalAlpha = 0.75;
        rrectTop(ctx, x, y, w, 3, 7); ctx.fill(); ctx.globalAlpha = 1;

        // Image
        const IMG_H = 90;
        const IMG_PAD = 8;
        const imgW = w - IMG_PAD * 2;
        const imgTop = y + 8;

        if (img) {
            const scale = Math.min(imgW / img.naturalWidth, IMG_H / img.naturalHeight);
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            ctx.drawImage(img, x + IMG_PAD + (imgW - dw) / 2, imgTop + (IMG_H - dh) / 2, dw, dh);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(x + IMG_PAD, imgTop, imgW, IMG_H);
        }

        // H/G badge — top-left corner, purple background
        if (item.shg && window.FTFData.shouldShowSHGBadge(item)) {
            const BADGE = 26;
            const bx = x + 4;
            const by = y + 5;
            ctx.fillStyle = 'rgba(90,30,160,0.88)';
            rrect(ctx, bx, by, BADGE, BADGE, 5); ctx.fill();
            ctx.strokeStyle = 'rgba(180,120,255,0.6)';
            ctx.lineWidth = 1;
            rrect(ctx, bx, by, BADGE, BADGE, 5); ctx.stroke();
            ctx.font = 'bold 15px Arial, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(item.shg.toUpperCase(), bx + BADGE / 2, by + BADGE / 2);
        }

        // Quantity badge — top-right
        const qty = item.quantity || 1;
        if (qty > 1) {
            const text = `×${qty}`;
            ctx.font = 'bold 14px Arial, sans-serif';
            const bw = ctx.measureText(text).width + 8;
            const bh = 22;
            const bx = x + w - bw - 4;
            const by = y + 5;

            ctx.fillStyle = 'rgba(90,30,160,0.88)';
            rrect(ctx, bx, by, bw, bh, 5); ctx.fill();
            ctx.strokeStyle = 'rgba(180,120,255,0.6)';
            ctx.lineWidth = 1;
            rrect(ctx, bx, by, bw, bh, 5); ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(text, bx + bw / 2, by + bh / 2 + 1);
        }

        // Item name
        const nameY = y + h - 30;
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        let name = item.name;
        const maxW = w - 8;
        while (name.length > 2 && ctx.measureText(name).width > maxW) name = name.slice(0, -1);
        if (name !== item.name) name = name.slice(0, -1) + '…';
        ctx.fillText(name, x + w / 2, nameY);

        // Effective value — soft lavender, always readable
        const formattedVal = window.FTFData.formatFV(window.FTFData.calculateItemValue(item) * (item.quantity || 1));
        ctx.font = '11px Arial, sans-serif';
        ctx.fillStyle = '#c8b4f0';
        ctx.globalAlpha = 1;
        ctx.fillText(`${formattedVal} fv`, x + w / 2, nameY + 16);
        ctx.globalAlpha = 1;
    }

    // ── Canvas shape helpers ──────────────────────────────────────────────
    function rrect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function rrectTop(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ── Hex color to RGB string helper ────────────────────────────────────
    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return [
            parseInt(h.substring(0, 2), 16),
            parseInt(h.substring(2, 4), 16),
            parseInt(h.substring(4, 6), 16),
        ].join(',');
    }

    // --- VALUE SYNC ---
    function syncInventoryValues() {
        let hasUpdates = false;
        inventory.forEach(invItem => {
            const itemData = allItems.find(item => item.name === invItem.name);
            if (itemData) {
                const oldValue = invItem.value || invItem.baseValue;
                const newValue = itemData.value;
                if (oldValue !== newValue) {
                    invItem.value = newValue;
                    invItem.baseValue = newValue;
                    hasUpdates = true;
                }
                // Also sync stability data in case it changed
                if (itemData.stability && itemData.stability !== invItem.stability) {
                    invItem.stability = itemData.stability;
                    invItem.stabilityType = window.FTFData.parseStabilityType(itemData.stability);
                    hasUpdates = true;
                }
            }
        });
        if (hasUpdates) {
            saveInventory();
        }
        return hasUpdates;
    }

    // --- INIT ---
    async function init() {
        if (!window.FTFData) {
            console.error('Essential data utility (utils.js) failed to load.');
            showAlert({
                title: 'Data Loading Error',
                message: 'The item database failed to load. Please check your internet connection or refresh the page.'
            });
            return;
        }

        loadSortOptions();
        loadInventory();
        loadNote();
        initSidebarToggle();
        renderInventory();

        try {
            await window.FTFData.init();
            allItems = window.FTFData.allItems;
            syncInventoryValues();
            renderInventory();
        } catch (e) { 
            console.error('Inventory init error:', e);
            showAlert({
                title: 'Database Sync Error',
                message: 'We could not sync the latest item values. Your local inventory is still visible but values may be outdated.'
            });
        }
    }

    // --- EVENT LISTENERS ---
    document.getElementById('open-modal-btn')?.addEventListener('click', openModal);
    document.getElementById('inv-modal-done')?.addEventListener('click', commitAndClose);
    document.getElementById('inv-modal-cancel')?.addEventListener('click', dismissWithoutAdding);
    document.getElementById('screenshot-btn')?.addEventListener('click', takeScreenshots);

    // --- SORT DROPDOWN ---
    sortTrigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        sortDropdown?.classList.toggle('open');
    });

    sortMenu?.addEventListener('click', (e) => {
        const opt = e.target.closest('.inv-sort-option');
        if (!opt) return;
        currentSort = opt.dataset.value;
        sortDescending = false; // reset to natural default when changing sort type
        updateSortDirButton();
        if (sortLabel) sortLabel.textContent = 'Sort: ' + (opt.textContent || 'Added Order');
        sortMenu.querySelectorAll('.inv-sort-option').forEach(b => b.classList.remove('active'));
        opt.classList.add('active');
        sortDropdown?.classList.remove('open');
        saveSortOptions();
        renderInventory();
    });

    // Direction toggle
    document.getElementById('inv-sort-dir')?.addEventListener('click', (e) => {
        e.stopPropagation();
        sortDescending = !sortDescending;
        updateSortDirButton();
        saveSortOptions();
        renderInventory();
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (sortDropdown && !sortDropdown.contains(e.target)) {
            sortDropdown.classList.remove('open');
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sortDropdown?.classList.contains('open')) {
            sortDropdown.classList.remove('open');
        }
    });

    // Inventory search
    invSearchEl?.addEventListener('input', () => {
        invSearchQuery = invSearchEl.value.trim();
        if (invSearchClear) invSearchClear.style.display = invSearchQuery ? 'block' : 'none';
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            renderInventory();
        }, 400);
    });
    invSearchClear?.addEventListener('click', () => {
        invSearchQuery = '';
        if (invSearchEl) invSearchEl.value = '';
        invSearchClear.style.display = 'none';
        renderInventory();
    });

    // Note: live strip (no trim) so spaces are preserved while typing
    invNoteEl?.addEventListener('input', () => {
        const clean = sanitizeLive(invNoteEl.value);
        // Only overwrite if something was actually stripped — preserves cursor position otherwise
        if (invNoteEl.value !== clean) {
            const sel = invNoteEl.selectionStart;
            invNoteEl.value = clean;
            invNoteEl.setSelectionRange(sel, sel);
        }
        const len = clean.length;
        if (invNoteCount) {
            invNoteCount.textContent = `${len} / ${NOTE_MAX}`;
            invNoteCount.classList.toggle('near-limit', len >= 100 && len < NOTE_MAX);
            invNoteCount.classList.toggle('at-limit', len >= NOTE_MAX);
        }
        saveNote();
    });

    if (closeModalBtn) closeModalBtn.onclick = tryDismissModal;
    if (modal) modal.onclick = (e) => { if (e.target === modal) tryDismissModal(); };

    document.addEventListener('keydown', (e) => {
        // Accessibility: Trap focus within open dialogs
        if (e.key === 'Tab') {
            let activeModal = null;
            if (confirmOverlay?.classList.contains('is-visible')) {
                activeModal = confirmOverlay;
            } else if (modal?.style.display === 'flex') {
                activeModal = modal;
            }
            if (activeModal) {
                const focusable = activeModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (focusable.length > 0) {
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        last.focus(); e.preventDefault();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        first.focus(); e.preventDefault();
                    }
                }
            }
        }

        // Escape to dismiss
        if (confirmOverlay?.classList.contains('is-visible')) return;
        if (e.key === 'Escape' && modal?.style.display === 'flex') tryDismissModal();
    });

    searchInput?.addEventListener('input', () => {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => updateDisplayedItems(), 150);
    });

    raritySidebar?.addEventListener('click', (e) => {
        const rarityBtn = e.target.closest('.rarity-filter-btn');
        if (rarityBtn) {
            raritySidebar.querySelectorAll('.rarity-filter-btn').forEach(b => b.classList.remove('active'));
            rarityBtn.classList.add('active');
            currentRarity = rarityBtn.dataset.rarity;
            setTimeout(() => updateDisplayedItems(), 0);
        }

        const shgBtn = e.target.closest('.shg-btn');
        if (shgBtn) {
            const val = shgBtn.dataset.shg;
            if (currentSHG === val) {
                currentSHG = null;
                raritySidebar.querySelectorAll('.shg-btn').forEach(b => b.classList.remove('active'));
            } else {
                raritySidebar.querySelectorAll('.shg-btn').forEach(b => b.classList.remove('active'));
                currentSHG = val;
                shgBtn.classList.add('active');
            }
        }
    });

    document.getElementById('clear-inventory-btn')?.addEventListener('click', () => {
        if (inventory.length === 0) return;
        const totalQty = inventory.reduce((s, i) => s + (i.quantity || 1), 0);
        showConfirm({
            title: 'Clear entire inventory?',
            message: `This will remove all ${totalQty} item${totalQty !== 1 ? 's' : ''} from your inventory. This cannot be undone.`,
            confirmLabel: 'Clear All',
            cancelLabel: 'Keep Items',
            variant: 'danger',
            onConfirm: () => {
                inventory = []; invSearchQuery = '';
                if (invSearchEl) invSearchEl.value = '';
                if (invSearchClear) invSearchClear.style.display = 'none';
                saveInventory(); renderInventory();
            },
        });
    });

    init();
});

