document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTS ---
    const LAST_UPDATED = '05 February';
    const HV_DIVISOR = 40;
    const MAX_SLOTS = 27;
    const MAX_QUANTITY = 100;

    // --- STATE MANAGEMENT
    let allItems = [];
    let yourTrade = []; 
    let theirTrade = [];
    let modeHV = false;
    let currentSHG = null;
    let currentRarity = 'all';
    let shgExceptions8020 = new Set();
    let shgExceptionsFull = new Set();

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
    
    // Validate critical DOM elements
    if (!yourGrid || !theirGrid || !modal || !itemList || !searchInput || !resetBtn || !raritySidebar) {
        console.error('Critical DOM elements missing. Check HTML structure.');
    }

    // --- THEME LOGIC ---
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        htmlElement.classList.add('dark-theme');
        if (themeToggle) themeToggle.textContent = 'Light Mode';
    }
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = htmlElement.classList.toggle('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            themeToggle.textContent = isDark ? 'Light Mode' : 'Dark Mode';
        });
    }

    // --- INFO LINES (Last Updated) ---
    const lastUpdatedElement = document.getElementById('last-updated');
    if (lastUpdatedElement) {
        lastUpdatedElement.textContent = LAST_UPDATED;
    }

    // --- UTILITY FUNCTIONS ---
    function parseStabilityType(stability) {
        if (!stability) return null;
        const stabilityLower = stability.toLowerCase();
        
        if (stabilityLower === 'stable') return null;
        if (stabilityLower.includes('doing well')) return 'doing-well';
        if (stabilityLower.includes('dropping')) return 'dropping';
        if (stabilityLower.includes('struggling')) return 'struggling';
        if (stabilityLower.includes('fluctuating')) return 'fluctuating';
        if (stabilityLower.includes('receding')) return 'receding';
        
        return null;
    }

    function scrollGridsToTop() {
        yourGrid.scrollTop = 0;
        theirGrid.scrollTop = 0;
    }

    // --- CORE CALCULATIONS ---
    function calculateItemValue(item) {
        if (item.isAdds) {
            return item.quantity || 0;
        }
        
        let baseVal = Number(item.baseValue) || 0;
        const nameKey = (item.name || '').toLowerCase();
        const rarity = (item.rarity || '').toLowerCase();
        const itemSHG = item.shg || null; // Use item's own SHG state, not global
        
        if (shgExceptionsFull.has(nameKey)) return baseVal;

        if (rarity === 'legendary' && itemSHG) {
            return itemSHG === 'h' ? baseVal * 0.7 : baseVal * 0.3;
        }
        if (['epic', 'rare', 'common'].includes(rarity) && itemSHG) {
            if (shgExceptions8020.has(nameKey)) {
                return itemSHG === 'g' ? baseVal * 0.8 : baseVal * 0.2;
            }
            return baseVal * 0.5;
        }
        return baseVal;
    }

    function formatNumberForDisplay(n, isAdds = false) {
        const num = (modeHV && !isAdds) ? n / HV_DIVISOR : n;
        if (modeHV && !isAdds) return num.toFixed(3).replace(/\.?0+$/, '');
        if (num < 5 && num % 1 !== 0) return num.toFixed(1);
        return Math.round(num).toLocaleString();
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
                
                // Special rendering for Adds items
                if (item.isAdds) {
                    slot.innerHTML = `
                        <div class="item-slot-content">
                            <div class="item-slot-img" style="display: flex; align-items: center; justify-content: center;">
                                <svg viewBox="0 0 24 24" style="width: 70%; height: 70%;" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
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
                        
                        if (val === '') {
                            updateTotalsOnly();
                            return;
                        }
                        
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
                            if (e.target.value === '') {
                                e.target.value = '0';
                                item.quantity = 0;
                            }
                            e.target.blur();
                        }
                    };
                    
                    slot.onclick = (e) => {
                        if (!['INPUT'].includes(e.target.tagName)) {
                            dataArray.splice(i, 1);
                            updateAll();
                        }
                    };
                } else {

                    if (item.stabilityType) {
                        slot.dataset.stability = item.stabilityType;
                    }
                    
                    if (item.shg && shouldShowSHGIndicator(item)) {
                        slot.dataset.shg = item.shg;
                    }

                    const filename = encodeURIComponent(item.name + '.png');
                    slot.innerHTML = `
                        <div class="item-slot-content">
                            <div class="item-slot-img">
                                <img src="items/${filename}" onerror="this.src='items/Default.png'" alt="${item.name}">
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
                        
                        if (val === '') {
                            updateTotalsOnly();
                            return;
                        }
                        
                        let num = Math.min(MAX_QUANTITY, Math.max(1, parseInt(val)));
                        e.target.value = num;
                        item.quantity = num;
                        updateTotalsOnly(); // Don't redraw grid while typing!
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
                    
                    slot.querySelector('.inc').onclick = () => { 
                        item.quantity = Math.min(MAX_QUANTITY, item.quantity + 1); 
                        updateAll(); 
                    };
                    
                    slot.querySelector('.dec').onclick = () => { 
                        item.quantity = Math.max(1, item.quantity - 1); 
                        updateAll(); 
                    };
                    
                    slot.onclick = (e) => {
                        if (!['INPUT', 'BUTTON'].includes(e.target.tagName)) {
                            dataArray.splice(i, 1);
                            updateAll();
                        }
                    };
                }
            } else {
                slot.onclick = () => openModal(dataArray);
            }
            gridElement.appendChild(slot);
        }
    }

    function shouldShowSHGIndicator(item) {
        const nameKey = (item.name || '').toLowerCase();
        const rarity = (item.rarity || '').toLowerCase();
        
        // Don't show for full exceptions
        if (shgExceptionsFull.has(nameKey)) return false;
        
        // Show for legendaries or non-legendary with modifier active
        if (rarity === 'legendary') return true;
        if (['epic', 'rare', 'common'].includes(rarity)) return true;
        
        return false;
    }

    function updateTotalsOnly() {
        // Separate adds value from regular trade value
        const yourTradeValue = yourTrade.reduce((sum, item) => {
            if (item.isAdds) return sum;
            return sum + (calculateItemValue(item) * item.quantity);
        }, 0);
        const yourAddsValue = yourTrade.reduce((sum, item) => {
            if (!item.isAdds) return sum;
            return sum + (item.quantity || 0);
        }, 0);
        
        const theirTradeValue = theirTrade.reduce((sum, item) => {
            if (item.isAdds) return sum;
            return sum + (calculateItemValue(item) * item.quantity);
        }, 0);
        const theirAddsValue = theirTrade.reduce((sum, item) => {
            if (!item.isAdds) return sum;
            return sum + (item.quantity || 0);
        }, 0);
        
        // Combine for total comparison, but display shows adds separately
        const yourTotal = yourTradeValue + yourAddsValue;
        const theirTotal = theirTradeValue + theirAddsValue;
        
        const modeLabel = modeHV ? 'hv' : 'fv';
        const yourTotalEl = document.getElementById('your-total');
        const theirTotalEl = document.getElementById('their-total');
        
        // Format trade value with HV/FV conversion, adds value stays constant
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
        
        // Only trade value gets HV/FV conversion, adds stay constant
        const yourTradeFormatted = modeHV ? yourTradeVal / HV_DIVISOR : yourTradeVal;
        const theirTradeFormatted = modeHV ? theirTradeVal / HV_DIVISOR : theirTradeVal;
        
        // Calculate difference with proper formatting
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
        
        if (Math.abs(diff) < 0.01) { // Use small epsilon for floating point comparison
            resultEl.textContent = 'Fair';
            resultEl.classList.add('wfl-result-fair');
            resultEl.setAttribute('data-difference', '0');
        } else {
            const isWin = diff > 0;
            const modeLabel = modeHV ? 'hv' : 'fv';
            const displayDiff = modeHV ? Math.abs(diff).toFixed(3).replace(/\.?0+$/, '') : Math.round(Math.abs(diff)).toLocaleString();
            resultEl.innerHTML = `${displayDiff}<br><span class="wfl-mode">${modeLabel} ${isWin ? 'Win' : 'Loss'}</span>`;
            resultEl.classList.add(isWin ? 'wfl-result-win' : 'wfl-result-lose');
        }
        
        resultEl.setAttribute('data-difference', diff);
    }

    // --- MODAL & SEARCH ---
    let activeArray = null;
    let searchDebounceTimer = null;

    function openModal(targetArray) {
        if (targetArray.length >= MAX_SLOTS) {
            alert(`All ${MAX_SLOTS} slots are full! Remove an item first.`);
            return;
        }
        
        activeArray = targetArray;
        
        // Reset filters on open
        currentRarity = 'all';
        currentSHG = null;
        if (searchInput) searchInput.value = '';
        
        // Reset rarity filter buttons
        if (raritySidebar) {
            const activeBtn = raritySidebar.querySelector('.rarity-filter-btn.active');
            if (activeBtn) activeBtn.classList.remove('active');
            const allBtn = raritySidebar.querySelector('.rarity-filter-btn[data-rarity="all"]');
            if (allBtn) allBtn.classList.add('active');
            
            // Reset SHG buttons
            const activeShgBtn = raritySidebar.querySelector('.shg-btn.active');
            if (activeShgBtn) activeShgBtn.classList.remove('active');
        }
        
        if (modal) modal.style.display = 'flex';
        updateDisplayedItems();
        
        // Focus search input for accessibility
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    function updateDisplayedItems() {
        if (!itemList || !searchInput) return;
        
        // Show error if items failed to load
        if (window.itemLoadError || allItems.length === 0) {
            itemList.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #999;">No items found</div>`;
            return;
        }
        
        const query = searchInput.value.toLowerCase();
        let filtered = allItems;
        if (currentRarity !== 'all') filtered = filtered.filter(i => i.rarity.toLowerCase() === currentRarity);
        if (query) filtered = filtered.filter(i => i.name.toLowerCase().includes(query));
        
        itemList.innerHTML = '';
        
        // Add 'Adds' item always, or if search matches "adds"
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
                    isAdds: true // Special flag to identify Adds items
                });
                if (modal) modal.style.display = 'none';
                updateAll();
            };
            itemList.appendChild(div);
        }
        
        if (filtered.length === 0) {
            if (itemList.children.length === 0) {
                itemList.innerHTML = '<p style="color: #999; text-align: center; padding: 2rem;">No items found</p>';
            }
            return;
        }
        
        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'modal-item';
            div.innerHTML = `
                <div class="modal-item-img">
                    <img src="items/${encodeURIComponent(item.name)}.png" 
                         onerror="this.src='items/Default.png'" 
                         alt="${item.name}">
                </div>
                <div class="modal-item-name">${item.name}</div>`;
            
            div.onclick = () => {
                const stabilityType = parseStabilityType(item.stability);
                activeArray.push({ 
                    ...item, 
                    baseValue: item.value, 
                    quantity: 1,
                    stabilityType: stabilityType,
                    shg: currentSHG || null // Store the current SHG mode with this item
                });
                if (modal) modal.style.display = 'none';
                updateAll();
            };
            itemList.appendChild(div);
        });
    }

    function closeModalHandler() {
        if (modal) modal.style.display = 'none';
        // Clear any pending debounce timer
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
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
        // Only initialize calculator if we're on the calculator page
        // Check if required calculator elements exist
        if (!yourGrid || !theirGrid) {
            // We're on the guide page or another page - skip calculator initialization
            return;
        }
        
        // Load previously saved trades from localStorage
        loadTradeFromLocalStorage();
        
        // Render empty grid and UI immediately
        renderFvHvSwitch();
        scrollGridsToTop();
        updateAll();
        
        try {
            const [itemResp, exResp] = await Promise.all([
                fetch('ftf_items.json'),
                fetch('shg_exceptions.json').catch(() => null)
            ]);
            
            if (!itemResp.ok) {
                throw new Error('Failed to load items');
            }
            
            const data = await itemResp.json();
            allItems = data.items;

            if (exResp && exResp.ok) {
                const exData = await exResp.json();
                shgExceptions8020 = new Set(exData.exceptions_80_20.map(s => s.toLowerCase()));
                shgExceptionsFull = new Set(exData.exceptions_full.map(s => s.toLowerCase()));
            }
            
            // Update grid with loaded items
            updateAll();
        } catch (e) { 
            console.error('Initialization error:', e);
            // Store error to show in modal when opened
            window.itemLoadError = e.message;
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
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeModalHandler();
        }
    });
    
    // Debounced search input
    if (searchInput) {
        searchInput.oninput = () => {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                updateDisplayedItems();
            }, 150); // 150ms debounce
        };
    }
    
    if (resetBtn) {
        resetBtn.onclick = () => { 
            yourTrade = []; 
            theirTrade = []; 
            scrollGridsToTop();
            updateAll();
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
            updateDisplayedItems();
        }
        
        const shgBtn = e.target.closest('.shg-btn');
        if (shgBtn) {
            const val = shgBtn.dataset.shg;
            const activeShgBtn = raritySidebar.querySelector('.shg-btn.active');
            
            if (currentSHG === val) {
                // Toggle off
                currentSHG = null;
                if (activeShgBtn) activeShgBtn.classList.remove('active');
            } else {
                // Toggle on
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