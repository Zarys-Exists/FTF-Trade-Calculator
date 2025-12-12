document.addEventListener('DOMContentLoaded', () => {
    const yourGrid = document.getElementById('your-offer-grid');
    const theirGrid = document.getElementById('their-offer-grid');
    const modal = document.getElementById('item-modal');
    const itemList = document.getElementById('item-list');
    const closeModalBtn = document.querySelector('.close-modal');
    const searchInput = document.getElementById('item-search');
    const resetBtn = document.getElementById('reset-trade-btn');
    const raritySidebar = document.querySelector('.rarity-sidebar');
    const navLinksContainer = document.querySelector('.nav-links'); // New: nav links container
    const calculatorPage = document.getElementById('calculator-page'); // New: Calculator content wrapper
    const guidePage = document.getElementById('guide-page'); // New: Guide content wrapper
    let guideContentLoaded = false; // New: Flag to track if guide content is loaded

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
            const response = await fetch('ftf_items.json');
            const data = await response.json();
            allItems = data.items;
            updateDisplayedItems();
            // load exceptions
            try {
                const exResp = await fetch('shg_exceptions.json');
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
            // Convert item name to lowercase for consistent image lookup
            const filename = encodeURIComponent(item.name.toLowerCase() + '.png');
            img.src = 'items/' + filename;
            img.alt = item.name;
            // Fallback if image fails to load, using a lowercase default
            img.onerror = () => {
                img.src = 'items/' + encodeURIComponent('default.png');
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

    // ROUTER LOGIC
    async function handleNavigation(path, pushState = true) {
        // Remove active class from all nav links
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

        // Determine current view and set active class
        if (path === '/' || path === '/index.html') { // Home page (Trade Calculator)
            calculatorPage.style.display = 'block';
            guidePage.style.display = 'none';
            document.querySelector('.nav-link[href="./"]').classList.add('active');
            if (pushState) history.pushState({ path: '/' }, '', './'); // Clean URL for home
        } else if (path === '/use-guide' || path === '/guide.html') { // Use Guide page
            calculatorPage.style.display = 'none';
            guidePage.style.display = 'block';
            document.querySelector('.nav-link[href="./use-guide"]').classList.add('active');

            if (!guideContentLoaded) {
                try {
                    const response = await fetch('guide.html'); // Fetch the content of guide.html
                    if (!response.ok) throw new Error('Failed to load guide.html');
                    const html = await response.text();
                    
                    // Extract relevant content from guide.html
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const guideMainContent = doc.querySelector('.guide-page-container'); // Assuming guide.html has a main content container with this class
                    if (guideMainContent) {
                        guidePage.innerHTML = guideMainContent.innerHTML;
                        guideContentLoaded = true;
                    } else {
                        guidePage.innerHTML = '<p style="color: red;">Failed to parse guide content.</p>';
                    }
                } catch (error) {
                    console.error("Failed to load guide content:", error);
                    guidePage.innerHTML = '<p style="color: red;">Could not load guide.</p>';
                }
            }
            if (pushState) history.pushState({ path: '/use-guide' }, '', './use-guide');
        } else {
            // Default to home if an unknown path is accessed
            handleNavigation('/', pushState);
            return;
        }
        // Scroll to top of page on navigation
        window.scrollTo(0, 0);
    }

    // Event listener for navigation links
    navLinksContainer.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link) {
            e.preventDefault(); // Prevent default link navigation
            const path = new URL(link.href).pathname.split('/').pop(); // Get 'index.html', 'use-guide', etc.
            
            // Adjust path for cleaner routing logic
            let cleanPath;
            if (path === '' || path === 'index.html') {
                cleanPath = '/';
            } else if (path === 'use-guide') {
                cleanPath = '/use-guide';
            } else {
                cleanPath = path; // Fallback for other paths, though not expected here
            }
            handleNavigation(cleanPath);
        }
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', (e) => {
        const currentPath = window.location.pathname.split('/').pop();
        let cleanPath;
        if (currentPath === '' || currentPath === 'index.html') {
            cleanPath = '/';
        } else if (currentPath === 'use-guide') {
            cleanPath = '/use-guide';
        } else {
            cleanPath = currentPath;
        }
        handleNavigation(cleanPath, false); // Don't push state again on popstate
    });

    // Initial setup
    createGridSlots(yourGrid);
    createGridSlots(theirGrid);
    fetchItems();
    renderFvHvSwitch();
    calculateAll();

    // Initial routing based on current URL
    const initialPath = window.location.pathname.split('/').pop();
    let cleanInitialPath;
    if (initialPath === '' || initialPath === 'index.html') {
        cleanInitialPath = '/';
    } else if (initialPath === 'use-guide') {
        cleanInitialPath = '/use-guide';
    } else {
        cleanInitialPath = initialPath;
    }
    handleNavigation(cleanInitialPath, true); // Push state initially to ensure clean URL on first load
});
