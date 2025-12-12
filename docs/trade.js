document.addEventListener('DOMContentLoaded', () => {
    const yourGrid = document.getElementById('your-offer-grid');
    const theirGrid = document.getElementById('their-offer-grid');
    const modal = document.getElementById('item-modal');
    const itemList = document.getElementById('item-list');
    const closeModalBtn = document.querySelector('.close-modal');
    const searchInput = document.getElementById('item-search');
    const resetBtn = document.getElementById('reset-trade-btn');
    const raritySidebar = document.querySelector('.rarity-sidebar');

    let allItems = [];
    let activeSlot = null;
    let currentRarity = 'all';
    let currentSHG = null; // Track the active SHG button
    let shgExceptions8020 = new Set();
    let shgExceptionsFull = new Set();

    // Add HG buttons to rarity sidebar
    const shgButtons = document.createElement('div');
    shgButtons.className = 'shg-buttons';
    shgButtons.innerHTML = `
        <div class="shg-btn" data-shg="h">H</div>
        <div class="shg-btn" data-shg="g">G</div>
    `;
    raritySidebar.appendChild(shgButtons);

    // Add event listener for SHG buttons
    shgButtons.addEventListener('click', handleSHGChange);

    // Fetch item data
    async function fetchItems() {
        try {
            const response = await fetch('/ftf_items.json');
            const data = await response.json();
            allItems = data.items;
            updateDisplayedItems();
            // load exceptions
            try {
                const exResp = await fetch('/shg_exceptions.json');
                const exData = await exResp.json();
                if (Array.isArray(exData.exceptions_80_20)) {
                    shgExceptions8020 = new Set(exData.exceptions_80_20.map(s => s.toLowerCase()));
                }
                if (Array.isArray(exData.exceptions_full)) {
                    shgExceptionsFull = new Set(exData.exceptions_full.map(s => s.toLowerCase()));
                }
            } catch (e) {
                console.warn('Could not load shg_exceptions.json', e);
            }
        } catch (error) {
            console.error("Failed to load item list:", error);
            itemList.innerHTML = '<p style="color: red;">Could not load items.</p>';
        }
    }

    // Populate the modal with items
    function populateItemList(items) {
        itemList.innerHTML = '';
        items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.classList.add('modal-item');
            
            // Create image container
            const imgContainer = document.createElement('div');
            imgContainer.className = 'modal-item-img';
            
            // Create and set up image with corrected path
            const img = document.createElement('img');
            img.src = `/items/${item.name.toLowerCase().replace(/\s+/g, ' ')}.png`;
            img.alt = item.name;
            // Fallback if image fails to load
            img.onerror = () => {
                img.src = '/items/default.png';
            };
            
            // Create name element
            const nameEl = document.createElement('div');
            nameEl.className = 'modal-item-name';
            nameEl.textContent = item.name;
            
            // Assemble elements
            imgContainer.appendChild(img);
            itemEl.appendChild(imgContainer);
            itemEl.appendChild(nameEl);
            
            itemEl.dataset.name = item.name;
            itemEl.dataset.value = item.value;
            // store rarity so we can apply modifier rules later
            if (item.rarity) itemEl.dataset.rarity = item.rarity;
            itemList.appendChild(itemEl);
        });
    }

    // Update the displayed items based on current filters
    function updateDisplayedItems() {
        const searchQuery = searchInput.value.toLowerCase();
        
        let filteredItems = allItems;

        // Filter by rarity
        if (currentRarity !== 'all') {
            filteredItems = filteredItems.filter(item => item.rarity.toLowerCase() === currentRarity);
        }

        // Filter by search query
        if (searchQuery) {
            filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(searchQuery));
        }

        populateItemList(filteredItems);
    }

    // Create the 9 slots for a grid
    function createGridSlots(gridElement) {
        gridElement.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const slot = document.createElement('div');
            slot.classList.add('item-slot');
            slot.dataset.value = 0;
            slot.dataset.index = i;
            gridElement.appendChild(slot);
        }
    }

    // Open the modal to select an item
    function openModal(slot) {
        // Check if there are any empty slots before this one
        const grid = slot.parentElement;
        const slots = Array.from(grid.children);
        const currentIndex = parseInt(slot.dataset.index);
        
        // Find the first empty slot
        const firstEmptyIndex = slots.findIndex(s => !s.classList.contains('filled'));
        
        // If trying to fill a later slot when earlier ones are empty
        if (firstEmptyIndex !== -1 && currentIndex > firstEmptyIndex) {
            slot = slots[firstEmptyIndex]; // Target the first empty slot instead
        }
        
        activeSlot = slot;
        modal.style.display = 'flex';
    }

    // Close the modal
    function closeModal() {
        modal.style.display = 'none';
        searchInput.value = '';
        currentRarity = 'all'; // Reset rarity on close
        document.querySelector('.rarity-filter-btn.active').classList.remove('active');
        document.querySelector('.rarity-filter-btn[data-rarity="all"]').classList.add('active');
        updateDisplayedItems(); // Reset filter
    }

    // Handle item selection from the modal
    function selectItem(e) {
        e.preventDefault();
        e.stopPropagation();
        const modalItem = e.target.closest('.modal-item');
        if (modalItem && activeSlot) {
                const name = modalItem.dataset.name;
                const value = modalItem.dataset.value;
                const rarity = (modalItem.dataset.rarity || '').toLowerCase();
            const imgSrc = modalItem.querySelector('img').src;

            // compute displayed value based on rarity and current modifier
            let baseVal = Number(value) || 0;
            activeSlot.dataset.baseValue = String(baseVal);
            let displayedValue = baseVal;

            // Helper to check exceptions
            const nameKey = (name || '').toLowerCase();
            const isFull = shgExceptionsFull.has(nameKey);
            const is8020 = shgExceptions8020.has(nameKey);

            // Full-exception: always take 100% of base value regardless of modifier
            if (isFull) {
                displayedValue = baseVal;
            } else if (rarity === 'legendary' && currentSHG) {
                // Legendary: hammer 70% (h), gem 30% (g)
                if (currentSHG === 'h') displayedValue = computeAdjustedValue(baseVal, 0.7);
                else if (currentSHG === 'g') displayedValue = computeAdjustedValue(baseVal, 0.3);
            } else if (['epic', 'rare', 'common'].includes(rarity)) {
                // Default for epic/rare/common: 50:50 (hammer:gem) when modifier selected
                if (currentSHG) {
                    if (is8020) {
                        // exceptions: gem 80%, hammer 20% (gem first)
                        if (currentSHG === 'g') displayedValue = computeAdjustedValue(baseVal, 0.8);
                        else if (currentSHG === 'h') displayedValue = computeAdjustedValue(baseVal, 0.2);
                    } else {
                        // default 50:50 split
                        displayedValue = computeAdjustedValue(baseVal, 0.5);
                    }
                }
            }

            activeSlot.dataset.value = String(displayedValue);
            // default quantity
            activeSlot.dataset.quantity = '1';
            // Now render inner HTML with the computed displayed value and quantity control
            activeSlot.innerHTML = `
                <div class="item-slot-content">
                    <div class="item-slot-img">
                        <img src="${imgSrc}" alt="${name}">
                    </div>
                    <div class="qty-control" data-name="${name}">
                        <button class="qty-btn qty-decrease" type="button" aria-label="Decrease quantity">−</button>
                        <input class="qty-input" type="number" min="1" max="100" step="1" value="1" aria-label="Quantity">
                        <button class="qty-btn qty-increase" type="button" aria-label="Increase quantity">+</button>
                    </div>
                </div>
            `;
            activeSlot.classList.add('filled');
            
            // Add SHG indicator if a modifier (h or g only) is selected
            if (currentSHG && (currentSHG === 'h' || currentSHG === 'g')) {
                activeSlot.dataset.shg = currentSHG;
            } else {
                delete activeSlot.dataset.shg;
            }
            
            // Adjust font size for name if it exists (kept for backward compatibility)
            const nameEl = activeSlot.querySelector('.item-slot-name');
            if (nameEl) adjustTextSize(nameEl);

            // Close modal immediately and stop further propagation
            closeModal();
            // Refresh displays/totals to ensure mode (HV) is applied immediately
            calculateAll();
        }
    }

    // adjustValueSize removed — per-slot numeric values are not rendered and datasets are used for calculations

    // Add this new function
    function adjustTextSize(element) {
        const maxWidth = element.offsetWidth;
        const text = element.textContent;
        let fontSize = 0.7; // Start with default size (in rem)
        
        element.style.fontSize = `${fontSize}rem`;
        while (element.scrollWidth > maxWidth && fontSize > 0.4) {
            fontSize -= 0.05;
            element.style.fontSize = `${fontSize}rem`;
        }
    }

    // Set quantity for a slot (clamped 1..100) and refresh totals
    function setSlotQuantity(slot, qty) {
        const n = Math.max(1, Math.min(100, Math.round(Number(qty) || 1)));
        slot.dataset.quantity = String(n);
        const input = slot.querySelector('.qty-input');
        if (input) input.value = String(n);
        calculateAll();
    }

    // Compute adjusted displayed value according to rule:
    // - if raw value < 5 -> show 1 decimal place (rounded to 0.1)
    // - else -> round to nearest integer
    function computeAdjustedValue(base, multiplier) {
        const raw = base * multiplier;
        if (raw < 5) {
            return Math.round(raw * 10) / 10; // one decimal
        }
        return Math.round(raw);
    }

    // Remove trailing zeros from decimal numbers
    function removeTrailingZeros(numStr) {
        return numStr.replace(/\.?0+$/, '');
    }

    // Format numbers without trailing zeros
    function formatDisplayValue(n) {
        const num = Number(n) || 0;
        // Convert to string with up to 3 decimal places, then remove trailing zeros
        return removeTrailingZeros(num.toFixed(3));
    }

    // Format numbers for display: three decimals for HV mode, one decimal if <5 and not integer in FV mode
    function formatNumberForDisplay(n) {
        const num = Number(n) || 0;
        // In HV mode, show up to 3 decimal places, no trailing zeros
        if (modeHV) {
            return formatDisplayValue(num);
        }
        // FV mode: one decimal if <5 and not integer, else integer
        if (num < 5 && num !== Math.round(num)) {
            return num.toFixed(1);
        }
        return Math.round(num).toLocaleString();
    }

    // Calculate total value for a grid and update display (respect HV mode)
    function calculateTotal(gridElement, totalElement) {
        const slots = gridElement.querySelectorAll('.item-slot');
        let total = 0;
        slots.forEach(slot => {
            const raw = Number(slot.dataset.value) || 0;
            const qty = Math.max(1, Math.min(100, Number(slot.dataset.quantity) || 1));
            const v = applyModeToValue(raw) * qty;
            total += Number(v) || 0;
        });
        totalElement.textContent = formatNumberForDisplay(total);
        return total;
    }

    // Determine and display WFL result
    function calculateWFL(yourValue, theirValue) {
        const resultEl = document.getElementById('wfl-result');
        const fillBar = document.getElementById('wfl-bar-fill');
        const difference = theirValue - yourValue;
        
        // Clear all possible classes first
        resultEl.classList.remove('wfl-result-win', 'wfl-result-fair', 'wfl-result-lose');

        if (yourValue === 0 && theirValue === 0) {
            resultEl.textContent = '--';
            resultEl.classList.add('wfl-result-fair');
            fillBar.style.width = '50%';
            fillBar.classList.remove('active');
            return;
        }

        fillBar.classList.add('active');

        const totalTradeValue = yourValue + theirValue;
        const ratio = totalTradeValue > 0 ? yourValue / totalTradeValue : 0; // Changed to use yourValue directly
        const clampedRatio = Math.max(0, Math.min(1, ratio)); // Changed range to 0-1
        const fillPercentage = clampedRatio * 100; // Simplified percentage calculation
        fillBar.style.width = `${fillPercentage}%`;

        // Set data-difference attribute for CSS targeting
        resultEl.setAttribute('data-difference', difference);

        if (difference === 0) {
            resultEl.textContent = 'Fair';
            resultEl.classList.add('wfl-result-fair');
        } else if (difference > 0) {
            const winAmt = modeHV ? formatDisplayValue(theirValue-yourValue) : (theirValue-yourValue);
            const modeLabel = modeHV ? 'hv' : 'fv';
            // amount on first line, mode + Win on second line
            resultEl.innerHTML = `${winAmt}<br><span class="wfl-mode">${modeLabel} Win</span>`;
            resultEl.classList.add('wfl-result-win');
        } else {
            const lossAmt = modeHV ? formatDisplayValue(yourValue-theirValue) : (yourValue-theirValue);
            const modeLabel = modeHV ? 'hv' : 'fv';
            // amount on first line, mode + Loss on second line
            resultEl.innerHTML = `${lossAmt}<br><span class="wfl-mode">${modeLabel} Loss</span>`;
            resultEl.classList.add('wfl-result-lose');
        }
    }
    
    function refreshDisplays() {
        // Update numeric display on each populated slot to respect current mode
        document.querySelectorAll('.item-slot').forEach(slot => {
            // No visible per-slot numeric value is rendered anymore; values are stored in dataset
            // Ensure totals are still computed from dataset values only
            return;
        });
    }

    function calculateAll() {
        // refresh slot displays first so totals reflect current mode
        refreshDisplays();
        const yourTotal = calculateTotal(yourGrid, document.getElementById('your-total'));
        const theirTotal = calculateTotal(theirGrid, document.getElementById('their-total'));
        calculateWFL(yourTotal, theirTotal);
    }

    // Handle rarity filter clicks
    function handleRarityChange(e) {
        if (!e.target.matches('.rarity-filter-btn')) return;

        // Update active button style
        raritySidebar.querySelector('.active').classList.remove('active');
        e.target.classList.add('active');

        // Update state and filter items
        currentRarity = e.target.dataset.rarity;
        updateDisplayedItems();
    }
    
    // Reset the entire trade calculator
    function resetTrade() {
        createGridSlots(yourGrid);
        createGridSlots(theirGrid);
        calculateAll();
    }

    // Handle clicks on filled slots to remove items
    function handleSlotClick(e) {
        const slot = e.target.closest('.item-slot');
        if (!slot) return;

        // If the click originated from quantity controls, ignore so buttons/inputs handle it
        if (e.target.closest('.qty-control')) return;

        if (slot.classList.contains('filled')) {
            // Remove the item
            removeItemFromSlot(slot);
        } else {
            // Open modal for empty slot
            openModal(slot);
        }
    }

    // Remove item and reorder remaining items
    function removeItemFromSlot(slot) {
        const grid = slot.parentElement;
        const slots = Array.from(grid.children);
        const removedIndex = parseInt(slot.dataset.index);
        
        // Clear the slot
        slot.innerHTML = '';
        slot.classList.remove('filled');
        slot.dataset.value = '0';
        delete slot.dataset.shg;  // Remove SHG indicator

        // Get all filled slots after the removed one
        const filledSlots = slots.slice(removedIndex + 1)
            .filter(s => s.classList.contains('filled'));

        // Move each subsequent item forward, preserving shg and baseValue
        filledSlots.forEach((filledSlot, i) => {
            const targetSlot = slots[removedIndex + i];

            // Move the content
            targetSlot.innerHTML = filledSlot.innerHTML;
            targetSlot.dataset.value = filledSlot.dataset.value || '0';
            if (filledSlot.dataset.shg) targetSlot.dataset.shg = filledSlot.dataset.shg;
            if (filledSlot.dataset.baseValue) targetSlot.dataset.baseValue = filledSlot.dataset.baseValue;
            targetSlot.classList.add('filled');

            // No visible per-slot numeric value to adjust

            // Clear the original slot
            filledSlot.innerHTML = '';
            filledSlot.classList.remove('filled');
            filledSlot.dataset.value = '0';
            delete filledSlot.dataset.shg;
            delete filledSlot.dataset.baseValue;
        });

        calculateAll();
    }

    // Handle SHG button clicks
    function handleSHGChange(e) {
        const shgBtn = e.target.closest('.shg-btn');
        if (!shgBtn) return;

        const shgValue = shgBtn.dataset.shg;

        // Deactivate the previously active button
        if (currentSHG) {
            shgButtons.querySelector(`.shg-btn[data-shg="${currentSHG}"]`).classList.remove('active');
        }

        // Activate the clicked button
        if (currentSHG !== shgValue) {
            shgBtn.classList.add('active');
            currentSHG = shgValue;
        } else {
            currentSHG = null;
        }

        updateDisplayedItems();
    }

    // Event Listeners
    yourGrid.addEventListener('click', handleSlotClick);
    theirGrid.addEventListener('click', handleSlotClick);
    // Quantity controls delegation
    [yourGrid, theirGrid].forEach(grid => {
        grid.addEventListener('click', (e) => {
            const dec = e.target.closest('.qty-decrease');
            const inc = e.target.closest('.qty-increase');
            if (!dec && !inc) return;
            const slot = e.target.closest('.item-slot');
            if (!slot) return;
            const input = slot.querySelector('.qty-input');
            const current = Number(input?.value) || 1;
            if (dec) setSlotQuantity(slot, current - 1);
            if (inc) setSlotQuantity(slot, current + 1);
        });

        grid.addEventListener('input', (e) => {
            const input = e.target.closest('.qty-input');
            if (!input) return;
            const slot = e.target.closest('.item-slot');
            if (!slot) return;
            // allow typing but clamp on blur via setSlotQuantity
            const val = Number(input.value);
            if (Number.isNaN(val)) return;
            if (val > 100) input.value = '100';
            if (val < 1) input.value = '1';
            setSlotQuantity(slot, input.value);
        });
    });
    
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });
    
    itemList.addEventListener('click', selectItem);
    searchInput.addEventListener('input', updateDisplayedItems);
    raritySidebar.addEventListener('click', handleRarityChange);
    resetBtn.addEventListener('click', resetTrade);

    // FV/HV mode: fv = full values (default), hv = divide displayed values by 40
    let modeHV = false; // false = fv, true = hv

    function renderFvHvSwitch() {
        // append switch to trade container (assume .trade-layout parent exists)
        const tradeLayout = document.querySelector('.trade-layout') || document.body;
        const wrapper = document.createElement('div');
        wrapper.className = 'fv-hv-switch';
        wrapper.innerHTML = `
            <div class="label">Mode</div>
            <div class="fv-hv-toggle" id="fv-hv-toggle" title="Toggle FV/HV">
                <div class="option">fv</div>
                <div class="option">hv</div>
                <div class="knob">fv</div>
            </div>
        `;
        tradeLayout.appendChild(wrapper);

        const toggle = wrapper.querySelector('.fv-hv-toggle');
        const knob = toggle.querySelector('.knob');
        toggle.addEventListener('click', () => {
            modeHV = !modeHV;
            toggle.classList.toggle('hv', modeHV);
            knob.textContent = modeHV ? 'hv' : 'fv';
            // recalc and re-render totals
            calculateAll();
        });
    }

    // helper to apply mode adjustment: when in HV, divide displayed numeric values by 40
    function applyModeToValue(val) {
        const num = Number(val);
        if (isNaN(num)) return val;
        if (!modeHV) return num;
        // hv mode: divide by 40 and keep full precision
        return num / 40;
        // Note: formatting is now handled by formatNumberForDisplay
    }

    // Initial setup
    createGridSlots(yourGrid);
    createGridSlots(theirGrid);
    fetchItems();
    renderFvHvSwitch();
    calculateAll();
});
