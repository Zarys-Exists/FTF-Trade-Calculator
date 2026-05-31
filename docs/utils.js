// docs/utils.js
window.FTFData = {
    allItems: [],
    shgExceptions8020: new Set(),
    shgExceptionsFull: new Set(),
    isLoaded: false,

    init: async function() {
        if (this.isLoaded) return;
        try {
            const [itemResp, exResp] = await Promise.all([
                fetch('ftf_items.json'),
                fetch('shg_exceptions.json').catch(() => null)
            ]);
            
            if (!itemResp.ok) throw new Error('Failed to load items');
            
            const data = await itemResp.json();
            this.allItems = data.items;

            if (exResp && exResp.ok) {
                const exData = await exResp.json();
                this.shgExceptions8020 = new Set((exData.exceptions_80_20 || []).map(s => s.toLowerCase()));
                this.shgExceptionsFull = new Set((exData.exceptions_full || []).map(s => s.toLowerCase()));
            }
            this.isLoaded = true;
        } catch (e) {
            console.error('Data initialization error:', e);
            window.itemLoadError = e.message;
            throw e;
        }
    },

    parseStabilityType: function(stability) {
        if (!stability) return null;
        const s = stability.toLowerCase().replace(/_/g, ' ');
        if (s === 'stable') return null;
        if (s.includes('rising'))      return 'rising';
        if (s.includes('doing well'))  return 'doing-well';
        if (s.includes('improving'))   return 'improving';
        if (s.includes('dropping'))    return 'dropping';
        if (s.includes('struggling'))  return 'struggling';
        if (s.includes('fluctuating')) return 'fluctuating';
        if (s.includes('receding'))    return 'receding';
        return null;
    },

    calculateItemValue: function(item) {
        if (item.isAdds) return item.quantity || 0;
        let baseVal = Number(item.baseValue) || Number(item.value) || 0;
        const nameKey = (item.name || '').toLowerCase();
        const rarity = (item.rarity || '').toLowerCase();
        const itemSHG = item.shg || null;

        if (this.shgExceptionsFull.has(nameKey)) return baseVal;

        if (rarity === 'legendary' && itemSHG) {
            return itemSHG === 'h' ? baseVal * 0.7 : baseVal * 0.3;
        }
        if (['epic', 'rare', 'common'].includes(rarity) && itemSHG) {
            if (this.shgExceptions8020.has(nameKey)) {
                return itemSHG === 'g' ? baseVal * 0.8 : baseVal * 0.2;
            }
            return baseVal * 0.5;
        }
        return baseVal;
    },

    shouldShowSHGBadge: function(item) {
        if (item.isAdds) return false;
        if (item.shg && !item.rarity) return false; 
        
        const nameKey = (item.name || '').toLowerCase();
        const rarity = (item.rarity || '').toLowerCase();
        
        if (this.shgExceptionsFull.has(nameKey)) return false;
        
        if (rarity === 'legendary') return true;
        if (['epic', 'rare', 'common'].includes(rarity)) return true;
        
        return false;
    },

    formatFV: function(num) {
        if (num < 5 && Math.abs(num - Math.round(num)) > 0.001) {
            const rounded = Math.round(num * 10) / 10;
            if (rounded % 1 === 0) return rounded.toLocaleString();
            return rounded.toFixed(1);
        }
        return Math.round(num).toLocaleString();
    },

    // --- ITEM ID MAPS ---
    _itemIdMap: {},
    _itemNameMap: {},

    buildItemMaps: function() {
        this._itemIdMap = {};
        this._itemNameMap = {};
        this.allItems.forEach(function(item) {
            if (item.id) {
                this._itemIdMap[item.name] = item.id;
                this._itemNameMap[item.id] = item;
            }
        }, this);
    },

    getIdByName: function(name) {
        return this._itemIdMap[name] || null;
    },

    getItemById: function(id) {
        return this._itemNameMap[id] || null;
    }
};

window.FTFModalSort = {
    RARITY_ORDER: { Legendary: 0, Epic: 1, Rare: 2, Common: 3 },

    sortItems(items, sortBy = 'rarity', reverse = false) {
        const sorted = [...items];
        const dir = reverse ? -1 : 1;

        if (sortBy === 'rarity') {
            return sorted.sort((a, b) => {
                const rarA = (window.FTFModalSort.RARITY_ORDER[a.rarity] ?? 99);
                const rarB = (window.FTFModalSort.RARITY_ORDER[b.rarity] ?? 99);
                if (rarA !== rarB) return dir * (rarA - rarB);
                const valA = a.value ?? 0;
                const valB = b.value ?? 0;
                return -1 * (valA - valB);
            });
        }

        if (sortBy === 'value') {
            return sorted.sort((a, b) => {
                const valA = a.value ?? 0;
                const valB = b.value ?? 0;
                return dir * (valB - valA);
            });
        }

        if (sortBy === 'alphabetic') {
            return sorted.sort((a, b) => dir * a.name.localeCompare(b.name));
        }

        return sorted;
    },

    setup({ dropdown, label, menu, reverseBtn, defaultSort = 'rarity', onChange, storageKey = null }) {
        const labels = { rarity: 'Rarity', value: 'Value', alphabetic: 'Name' };

        // Load persisted state or fall back to defaults
        let savedSort = defaultSort;
        let savedReverse = false;
        if (storageKey) {
            try {
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    savedSort = parsed.sort || defaultSort;
                    savedReverse = parsed.reverse === true;
                }
            } catch (e) { /* ignore */ }
        }

        let sortBy = savedSort;
        let reverse = savedReverse;

        const persist = () => {
            if (!storageKey) return;
            try {
                localStorage.setItem(storageKey, JSON.stringify({ sort: sortBy, reverse }));
            } catch (e) { /* ignore */ }
        };

        const setActiveOption = () => {
            if (!menu) return;
            menu.querySelectorAll('.modal-sort-option').forEach(button => {
                button.classList.toggle('active', button.dataset.sortValue === sortBy);
            });
        };

        const updateLabel = () => {
            if (label) label.textContent = labels[sortBy] || 'Rarity';
        };

        const updateReverseState = () => {
            if (reverseBtn) reverseBtn.classList.toggle('reversed', reverse);
        };

        const setState = (newSort, newReverse = false) => {
            sortBy = newSort;
            reverse = newReverse;
            updateLabel();
            setActiveOption();
            updateReverseState();
        };

        const reset = () => setState(defaultSort, false);
        const closeDropdown = () => { if (dropdown) dropdown.classList.remove('open'); };

        dropdown?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        menu?.addEventListener('click', (e) => {
            const opt = e.target.closest('.modal-sort-option');
            if (!opt) return;
            setState(opt.dataset.sortValue, reverse);
            closeDropdown();
            persist();
            if (onChange) onChange(sortBy, reverse);
        });

        reverseBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            reverse = !reverse;
            updateReverseState();
            persist();
            if (onChange) onChange(sortBy, reverse);
        });

        document.addEventListener('click', (e) => {
            if (dropdown && !dropdown.contains(e.target) && !reverseBtn?.contains(e.target)) {
                closeDropdown();
            }
        });

        setActiveOption();
        updateLabel();
        updateReverseState();

        return {
            getSort: () => sortBy,
            getReverse: () => reverse,
            reset,
            setState,
        };
    }
};