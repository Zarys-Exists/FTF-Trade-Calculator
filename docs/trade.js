document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTS ---
    const LAST_UPDATED = '29 April';
    const HV_DIVISOR = 40;
    const MAX_SLOTS = 27;
    const MAX_QUANTITY = 100;
    const ITEM_PAGE_SIZE = 40; 

    // --- STATE MANAGEMENT
    let allItems = [];
    let yourTrade = []; 
    let theirTrade = [];
    let modeHV = false;
    let currentSHG = null;
    let currentRarity = 'all';

    // Lazy loading state
    let filteredItemCache = [];
    let renderedItemCount = 0;
    let isLoadingMore = false;
    let itemListObserver = null;

    // --- DOM ELEMENTS ---
    const themeToggle = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;
    const yourGrid = document.getElementById('your-offer-grid');
    const theirGrid = document.getElementById('their-offer-grid');
    const modal = document.getElementById('item-modal');
    const itemList = document.getElementById('item-list');
    const closeModalBtn = document.querySelector('.close-modal');
    const searchInput = document.getElementById('item-search');
    const resetBtn = document.getElementById('reset-trade-btn');
    const raritySidebar = document.querySelector('.rarity-sidebar');
    
    if (!yourGrid || !theirGrid || !modal || !itemList || !searchInput || !resetBtn || !raritySidebar) {
        console.error('Critical DOM elements missing. Check HTML structure.');
    }

    

    // --- INFO LINES (Last Updated) ---
    const lastUpdatedElement = document.getElementById('last-updated');
    if (lastUpdatedElement) {
        lastUpdatedElement.textContent = LAST_UPDATED;
    }



    function formatNumberForDisplay(n, isAdds = false) {
        if (modeHV && !isAdds) {
            const num = n / HV_DIVISOR;
            return num.toFixed(3).replace(/\.?0+$/, '');
        }
        return window.FTFData.formatFV(n);
    }

    // --- SMART RENDERING ---
    function renderGrid(gridElement, dataArray) {
        gridElement.innerHTML = '';
        for (let i = 0; i < MAX_SLOTS; i++) {
            const slot = document.createElement('div');
            slot.classList.add('item-slot');
            slot.dataset.index = i;
            const item = dataArray[i];

            if (item) {
                slot.classList.add('filled');
                
                if (item.isAdds) {
                    slot.innerHTML = `
                        <div class="item-slot-content">
                            <div class="item-slot-img" style="display: flex; align-items: center; justify-content: center;">
                                <svg viewBox="0 0 24 24" style="width: 70%; height: 70%; min-width: 0;" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </div>
                            <div class="qty-control" style="justify-content: center;">
                                <input class="qty-input" type="number" value="${item.quantity}" min="0" max="10000" aria-label="Adds value" style="text-align: center;">
                            </div>
                        </div>`;
                    
                    const input = slot.querySelector('.qty-input');
                    
                    input.oninput = (e) => {
                        let val = e.target.value.replace(/[^0-9]/g, '');
                        e.target.value = val;
                        if (val === '') { updateTotalsOnly(); return; }
                        let num = Math.min(10000, Math.max(0, parseInt(val)));
                        e.target.value = num;
                        item.quantity = num;
                        updateTotalsOnly();
                    };
                    
                    input.onblur = (e) => {
                        if (e.target.value === '') {
                            e.target.value = '0';
                            item.quantity = 0;
                            updateTotalsOnly();
                        }
                    };
                    
                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') {
                            if (e.target.value === '') { e.target.value = '0'; item.quantity = 0; }
                            e.target.blur();
                        }
                    };
                    
                    slot.onclick = (e) => {
                        if (!['INPUT'].includes(e.target.tagName)) {
                            dataArray.splice(i, 1);
                            setTimeout(() => updateAll(), 0);
                        }
                    };
                } else {
                    if (item.stabilityType) {
                        slot.dataset.stability = item.stabilityType;
                    }
                    if (item.shg && window.FTFData.shouldShowSHGBadge(item)) {
                        slot.dataset.shg = item.shg;
                    }

                    const filename = encodeURIComponent(item.name + '.webp');
                    slot.innerHTML = `
                        <div class="item-slot-content">
                            <div class="item-slot-img">
                                <img src="items/${filename}" onerror="this.src='items/Default.webp'" alt="${item.name}">
                            </div>
                            <div class="qty-control">
                                <button class="qty-btn dec" aria-label="Decrease quantity">−</button>
                                <input class="qty-input" type="number" value="${item.quantity}" min="1" max="${MAX_QUANTITY}" aria-label="Item quantity">
                                <button class="qty-btn inc" aria-label="Increase quantity">+</button>
                            </div>
                        </div>`;

                    const input = slot.querySelector('.qty-input');
                    
                    input.oninput = (e) => {
                        let val = e.target.value.replace(/[^0-9]/g, '');
                        e.target.value = val;
                        if (val === '') { updateTotalsOnly(); return; }
                        let num = Math.min(MAX_QUANTITY, Math.max(1, parseInt(val)));
                        e.target.value = num;
                        item.quantity = num;
                        updateTotalsOnly();
                    };
                    
                    input.onblur = (e) => {
                        if (e.target.value === '' || Number(e.target.value) < 1) {
                            e.target.value = '1';
                            item.quantity = 1;
                            updateTotalsOnly();
                        }
                    };
                    
                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') {
                            if (e.target.value === '' || Number(e.target.value) < 1) {
                                e.target.value = '1';
                                item.quantity = 1;
                            }
                            e.target.blur();
                        }
                    };
                    
                    // FIX: update DOM directly for +/- buttons, skip full grid re-render
                    slot.querySelector('.inc').onclick = (e) => {
                        e.stopPropagation();
                        item.quantity = Math.min(MAX_QUANTITY, item.quantity + 1);
                        input.value = item.quantity;
                        setTimeout(() => updateTotalsOnly(), 0);
                    };
                    
                    slot.querySelector('.dec').onclick = (e) => {
                        e.stopPropagation();
                        item.quantity = Math.max(1, item.quantity - 1);
                        input.value = item.quantity;
                        setTimeout(() => updateTotalsOnly(), 0);
                    };
                    
                    slot.onclick = (e) => {
                        if (!['INPUT', 'BUTTON'].includes(e.target.tagName)) {
                            dataArray.splice(i, 1);
                            setTimeout(() => updateAll(), 0);
                        }
                    };
                }
            } else {
                slot.onclick = () => openModal(dataArray);
            }
            gridElement.appendChild(slot);
        }
    }

    // --- CORE CALCULATIONS ---
    function scrollGridsToTop() {
        yourGrid.scrollTop = 0;
        theirGrid.scrollTop = 0;
    }

    function updateTotalsOnly() {
        const yourTradeValue = yourTrade.reduce((sum, item) => {
            if (item.isAdds) return sum;
            return sum + (window.FTFData.calculateItemValue(item) * item.quantity);
        }, 0);
        const yourAddsValue = yourTrade.reduce((sum, item) => {
            if (!item.isAdds) return sum;
            return sum + (item.quantity || 0);
        }, 0);
        
        const theirTradeValue = theirTrade.reduce((sum, item) => {
            if (item.isAdds) return sum;
            return sum + (window.FTFData.calculateItemValue(item) * item.quantity);
        }, 0);
        const theirAddsValue = theirTrade.reduce((sum, item) => {
            if (!item.isAdds) return sum;
            return sum + (item.quantity || 0);
        }, 0);
        
        const modeLabel = modeHV ? 'hv' : 'fv';
        const yourTotalEl = document.getElementById('your-total');
        const theirTotalEl = document.getElementById('their-total');
        
        const yourTradeDisplay = formatNumberForDisplay(yourTradeValue);
        const yourAddsDisplay = yourAddsValue > 0 ? ` + ${formatNumberForDisplay(yourAddsValue, true)}` : '';
        const theirTradeDisplay = formatNumberForDisplay(theirTradeValue);
        const theirAddsDisplay = theirAddsValue > 0 ? ` + ${formatNumberForDisplay(theirAddsValue, true)}` : '';
        
        if (yourTotalEl) yourTotalEl.textContent = `${yourTradeDisplay}${yourAddsDisplay} ${modeLabel}`;
        if (theirTotalEl) theirTotalEl.textContent = `${theirTradeDisplay}${theirAddsDisplay} ${modeLabel}`;
        updateWFL(yourTradeValue, theirTradeValue, yourAddsValue, theirAddsValue);
        saveTradeToLocalStorage();
    }

    function updateAll() {
        renderGrid(yourGrid, yourTrade);
        renderGrid(theirGrid, theirTrade);
        updateTotalsOnly();
        saveTradeToLocalStorage();
    }

    function updateWFL(yourTradeVal, theirTradeVal, yourAddsVal, theirAddsVal) {
        const resultEl = document.getElementById('wfl-result');
        const fillBar = document.getElementById('wfl-bar-fill');
        
        const yourTradeFormatted = modeHV ? yourTradeVal / HV_DIVISOR : yourTradeVal;
        const theirTradeFormatted = modeHV ? theirTradeVal / HV_DIVISOR : theirTradeVal;
        
        const diff = (theirTradeFormatted + theirAddsVal) - (yourTradeFormatted + yourAddsVal);
        
        const yourTotal = yourTradeVal + yourAddsVal;
        const theirTotal = theirTradeVal + theirAddsVal;

        resultEl.classList.remove('wfl-result-win', 'wfl-result-fair', 'wfl-result-lose');
        
        if (yourTotal === 0 && theirTotal === 0) {
            resultEl.textContent = '--';
            fillBar.style.width = '50%';
            fillBar.classList.remove('active');
            return;
        }

        fillBar.classList.add('active');
        const yourFormattedTotal = yourTradeFormatted + yourAddsVal;
        const theirFormattedTotal = theirTradeFormatted + theirAddsVal;
        fillBar.style.width = `${(yourFormattedTotal / (yourFormattedTotal + theirFormattedTotal)) * 100}%`;
        
        const absDiff = Math.abs(diff);
        const displayDiffValue = modeHV ? Number(absDiff.toFixed(3)) : absDiff;
        
        if (displayDiffValue === 0) {
            resultEl.textContent = 'Fair';
            resultEl.classList.add('wfl-result-fair');
        } else {
            const isWin = diff > 0;
            const modeLabel = modeHV ? 'hv' : 'fv';
            const displayDiffStr = modeHV ? displayDiffValue.toString() : window.FTFData.formatFV(displayDiffValue);
            resultEl.innerHTML = `${displayDiffStr}<br><span class="wfl-mode">${modeLabel} ${isWin ? 'Win' : 'Loss'}</span>`;
            resultEl.classList.add(isWin ? 'wfl-result-win' : 'wfl-result-lose');
        }
    }

    // --- MODAL & LAZY LOADING ---
    let activeArray = null;
    let searchDebounceTimer = null;

    // Sentinel element watched by IntersectionObserver to trigger next batch
    function setupScrollObserver() {
        if (itemListObserver) {
            itemListObserver.disconnect();
            itemListObserver = null;
        }

        const sentinel = document.createElement('div');
        sentinel.id = 'item-list-sentinel';
        sentinel.style.cssText = 'height:1px;width:100%;grid-column:1/-1;';
        itemList.appendChild(sentinel);

        itemListObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !isLoadingMore) {
                loadNextItemBatch();
            }
        }, { root: itemList, rootMargin: '100px' });

        itemListObserver.observe(sentinel);
    }

    function loadNextItemBatch() {
        if (renderedItemCount >= filteredItemCache.length) return;

        isLoadingMore = true;

        // Remove sentinel before appending so it stays at the bottom
        const sentinel = document.getElementById('item-list-sentinel');
        if (sentinel) sentinel.remove();

        const batch = filteredItemCache.slice(renderedItemCount, renderedItemCount + ITEM_PAGE_SIZE);
        const fragment = document.createDocumentFragment();

        batch.forEach(item => fragment.appendChild(createModalItemEl(item)));
        itemList.appendChild(fragment);
        renderedItemCount += batch.length;

        // Re-attach sentinel if more items remain
        if (renderedItemCount < filteredItemCache.length) {
            setupScrollObserver();
        }

        isLoadingMore = false;
    }

    function createModalItemEl(item) {
        const div = document.createElement('div');
        div.className = 'modal-item';
        div.innerHTML = `
            <div class="modal-item-img">
                <img src="items/${encodeURIComponent(item.name)}.webp"
                     loading="lazy"
                     onerror="this.src='items/Default.webp'"
                     alt="${item.name}">
            </div>
            <div class="modal-item-name">${item.name}</div>`;
        
        div.onclick = () => {
            const stabilityType = window.FTFData.parseStabilityType(item.stability);
            activeArray.push({ 
                ...item, 
                baseValue: item.value, 
                quantity: 1,
                stabilityType: stabilityType,
                shg: currentSHG || null
            });
            if (modal) modal.style.display = 'none';
            setTimeout(() => updateAll(), 0);
        };
        return div;
    }

    function openModal(targetArray) {
        if (targetArray.length >= MAX_SLOTS) {
            alert(`All ${MAX_SLOTS} slots are full! Remove an item first.`);
            return;
        }
        
        activeArray = targetArray;
        currentRarity = 'all';
        currentSHG = null;
        if (searchInput) searchInput.value = '';
        
        if (raritySidebar) {
            const activeBtn = raritySidebar.querySelector('.rarity-filter-btn.active');
            if (activeBtn) activeBtn.classList.remove('active');
            const allBtn = raritySidebar.querySelector('.rarity-filter-btn[data-rarity="all"]');
            if (allBtn) allBtn.classList.add('active');
            const activeShgBtn = raritySidebar.querySelector('.shg-btn.active');
            if (activeShgBtn) activeShgBtn.classList.remove('active');
        }
        
        if (modal) modal.style.display = 'flex';
        // Defer item list build so modal paint happens first
        setTimeout(() => updateDisplayedItems(), 0);
        
        if (searchInput && window.innerWidth > 768) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    function updateDisplayedItems() {
        if (!itemList || !searchInput) return;

        // Disconnect existing observer
        if (itemListObserver) {
            itemListObserver.disconnect();
            itemListObserver = null;
        }

        itemList.innerHTML = '';
        renderedItemCount = 0;
        isLoadingMore = false;

        if (window.itemLoadError || allItems.length === 0) {
            itemList.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #999;">No items found</div>`;
            return;
        }
        
        const query = searchInput.value.toLowerCase();
        let filtered = allItems;
        if (currentRarity !== 'all') filtered = filtered.filter(i => i.rarity.toLowerCase() === currentRarity);
        if (query) filtered = filtered.filter(i => i.name.toLowerCase().includes(query));

        const fragment = document.createDocumentFragment();

        // Always show Adds item first
        const showAdds = !query || 'adds'.toLowerCase().includes(query);
        if (showAdds) {
            const div = document.createElement('div');
            div.className = 'modal-item';
            div.innerHTML = `
                <div class="modal-item-img" style="display: flex; align-items: center; justify-content: center; background: transparent;">
                    <svg viewBox="0 0 24 24" style="width: 80%; height: 80%;" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </div>
                <div class="modal-item-name">Adds</div>`;
            
            div.onclick = () => {
                activeArray.push({ 
                    name: 'Adds',
                    baseValue: 0,
                    quantity: 0,
                    rarity: 'special',
                    stability: null,
                    stabilityType: null,
                    shg: null,
                    isAdds: true
                });
                if (modal) modal.style.display = 'none';
                setTimeout(() => updateAll(), 0);
            };
            fragment.appendChild(div);
        }

        if (filtered.length === 0) {
            itemList.appendChild(fragment);
            if (!showAdds) {
                const msg = document.createElement('p');
                msg.style.cssText = 'color:#999;text-align:center;padding:2rem;grid-column:1/-1;';
                msg.textContent = 'No items found';
                itemList.appendChild(msg);
            }
            return;
        }

        // Cache the full filtered list for lazy loading
        filteredItemCache = filtered;

        // Render first batch immediately
        const firstBatch = filteredItemCache.slice(0, ITEM_PAGE_SIZE);
        firstBatch.forEach(item => fragment.appendChild(createModalItemEl(item)));
        renderedItemCount = firstBatch.length;

        itemList.appendChild(fragment);

        // Set up scroll observer for subsequent batches if needed
        if (renderedItemCount < filteredItemCache.length) {
            setupScrollObserver();
        }
    }

    function closeModalHandler() {
        if (modal) modal.style.display = 'none';
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        if (itemListObserver) {
            itemListObserver.disconnect();
            itemListObserver = null;
        }
    }

    // --- LOCALSTORAGE PERSISTENCE ---
    function saveTradeToLocalStorage() {
        try {
            localStorage.setItem('ftf-your-trade', JSON.stringify(yourTrade));
            localStorage.setItem('ftf-their-trade', JSON.stringify(theirTrade));
        } catch (e) {
            console.error('Failed to save trades to localStorage:', e);
        }
    }

    function loadTradeFromLocalStorage() {
        try {
            const savedYourTrade = localStorage.getItem('ftf-your-trade');
            const savedTheirTrade = localStorage.getItem('ftf-their-trade');
            if (savedYourTrade) yourTrade = JSON.parse(savedYourTrade);
            if (savedTheirTrade) theirTrade = JSON.parse(savedTheirTrade);
        } catch (e) {
            console.error('Failed to load trades from localStorage:', e);
            yourTrade = [];
            theirTrade = [];
        }
    }

    // --- INITIALIZATION ---
    async function init() {
        if (!yourGrid || !theirGrid) return;
        
        loadTradeFromLocalStorage();
        renderFvHvSwitch();
        scrollGridsToTop();
        updateAll();
        
        try {
            await window.FTFData.init();
            allItems = window.FTFData.allItems;
            updateAll();
        } catch (e) { 
            console.error('Initialization error:', e);
        }
    }

    function renderFvHvSwitch() {
        const tradeLayout = document.querySelector('.trade-layout') || document.body;
        const toggle = document.createElement('div');
        toggle.className = 'fv-hv-switch';
        toggle.innerHTML = `
            <div class="label">Mode</div>
            <div class="fv-hv-toggle" id="fv-hv-toggle" title="Toggle between Full Value (FV) and Huge Value (HV) modes">
                <div class="option">fv</div><div class="option">hv</div>
                <div class="knob">fv</div>
            </div>`;
        tradeLayout.appendChild(toggle);

        toggle.onclick = () => {
            modeHV = !modeHV;
            toggle.querySelector('.fv-hv-toggle').classList.toggle('hv', modeHV);
            toggle.querySelector('.knob').textContent = modeHV ? 'hv' : 'fv';
            updateAll();
        };
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'trade-info';
        infoDiv.innerHTML = `
            <div><span class="label">Last updated:</span> <span class="value">${LAST_UPDATED}</span></div>
            <div><span class="label">Values source:</span> <a href="https://ftf-values.base44.app/home" target="_blank" rel="noopener noreferrer">Official FTF values</a></div>`;
        tradeLayout.appendChild(infoDiv);
    }

    // --- EVENT LISTENERS ---
    if (closeModalBtn) closeModalBtn.onclick = closeModalHandler;
    
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) closeModalHandler();
        };
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeModalHandler();
        }
    });
    
    if (searchInput) {
        searchInput.oninput = () => {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                updateDisplayedItems();
            }, 150);
        };
    }
    
    if (resetBtn) {
        resetBtn.onclick = () => { 
            yourTrade = []; 
            theirTrade = []; 
            scrollGridsToTop();
            setTimeout(() => updateAll(), 0);
            localStorage.removeItem('ftf-your-trade');
            localStorage.removeItem('ftf-their-trade');
        };
    }
    
    if (raritySidebar) {
        raritySidebar.onclick = (e) => {
            if (e.target.classList.contains('rarity-filter-btn')) {
                const activeBtn = raritySidebar.querySelector('.rarity-filter-btn.active');
                if (activeBtn) activeBtn.classList.remove('active');
                e.target.classList.add('active');
                currentRarity = e.target.dataset.rarity;
                // Defer repaint so button active state renders first
                setTimeout(() => updateDisplayedItems(), 0);
            }
            
            const shgBtn = e.target.closest('.shg-btn');
            if (shgBtn) {
                const val = shgBtn.dataset.shg;
                const activeShgBtn = raritySidebar.querySelector('.shg-btn.active');
                
                if (currentSHG === val) {
                    currentSHG = null;
                    if (activeShgBtn) activeShgBtn.classList.remove('active');
                } else {
                    if (activeShgBtn) activeShgBtn.classList.remove('active');
                    currentSHG = val;
                    shgBtn.classList.add('active');
                }
                
                updateAll();
            }
        };
    }

    init();
});