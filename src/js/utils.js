export const FTFData = {
  allItems: [],
  shgExceptions8020: new Set(),
  shgExceptionsFull: new Set(),
  isLoaded: false,

  init: async function () {
    if (this.isLoaded) return;
    try {
      const [itemResp, exResp] = await Promise.all([
        fetch("ftf_items.json"),
        fetch("shg_exceptions.json").catch(() => null),
      ]);

      if (!itemResp.ok) throw new Error("Failed to load items");

      const data = await itemResp.json();
      this.allItems = data.items;

      if (exResp && exResp.ok) {
        const exData = await exResp.json();
        this.shgExceptions8020 = new Set(
          (exData.exceptions_80_20 || []).map((s) => s.toLowerCase()),
        );
        this.shgExceptionsFull = new Set(
          (exData.exceptions_full || []).map((s) => s.toLowerCase()),
        );
      }
      this.isLoaded = true;
    } catch (e) {
      console.error("Data initialization error:", e);
      window.itemLoadError = e.message;
      throw e;
    }
  },

  parseStabilityType: function (stability) {
    if (!stability) return null;
    const s = stability.toLowerCase().replace(/_/g, " ");
    if (s === "stable") return null;
    if (s.includes("rising")) return "rising";
    if (s.includes("doing well")) return "doing-well";
    if (s.includes("improving")) return "improving";
    if (s.includes("dropping")) return "dropping";
    if (s.includes("struggling")) return "struggling";
    if (s.includes("fluctuating")) return "fluctuating";
    if (s.includes("receding")) return "receding";
    return null;
  },

  calculateItemValue: function (item) {
    if (item.isAdds) return item.quantity || 0;
    let baseVal = Number(item.baseValue) || Number(item.value) || 0;
    const nameKey = (item.name || "").toLowerCase();
    const rarity = (item.rarity || "").toLowerCase();
    const itemSHG = item.shg || null;

    if (this.shgExceptionsFull.has(nameKey)) return baseVal;

    if (rarity === "legendary" && itemSHG) {
      return itemSHG === "h" ? baseVal * 0.7 : baseVal * 0.3;
    }
    if (["epic", "rare", "common"].includes(rarity) && itemSHG) {
      if (this.shgExceptions8020.has(nameKey)) {
        return itemSHG === "g" ? baseVal * 0.8 : baseVal * 0.2;
      }
      return baseVal * 0.5;
    }
    return baseVal;
  },

  shouldShowSHGBadge: function (item) {
    if (item.isAdds) return false;
    if (item.shg && !item.rarity) return false;

    const nameKey = (item.name || "").toLowerCase();
    const rarity = (item.rarity || "").toLowerCase();

    if (this.shgExceptionsFull.has(nameKey)) return false;

    if (rarity === "legendary") return true;
    if (["epic", "rare", "common"].includes(rarity)) return true;

    return false;
  },

  formatFV: function (num) {
    if (num < 5 && Math.abs(num - Math.round(num)) > 0.001) {
      const rounded = Math.round(num * 10) / 10;
      if (rounded % 1 === 0) return rounded.toLocaleString();
      return rounded.toFixed(1);
    }
    return Math.round(num).toLocaleString();
  },

  _itemIdMap: {},
  _itemNameMap: {},

  buildItemMaps: function () {
    this._itemIdMap = {};
    this._itemNameMap = {};
    this.allItems.forEach(function (item) {
      if (item.id) {
        this._itemIdMap[item.name] = item.id;
        this._itemNameMap[item.id] = item;
      }
    }, this);
  },

  getIdByName: function (name) {
    return this._itemIdMap[name] || null;
  },

  getItemById: function (id) {
    return this._itemNameMap[id] || null;
  },
};

export const FTFModalSort = {
  RARITY_ORDER: { Legendary: 0, Epic: 1, Rare: 2, Common: 3 },

  sortItems(items, sortBy = "rarity", reverse = false, currentSHG = null) {
    const sorted = [...items];
    const dir = reverse ? -1 : 1;

    if (sortBy === "rarity") {
      return sorted.sort((a, b) => {
        const rarA = FTFModalSort.RARITY_ORDER[a.rarity] ?? 99;
        const rarB = FTFModalSort.RARITY_ORDER[b.rarity] ?? 99;
        if (rarA !== rarB) return dir * (rarA - rarB);
        
        const valA = FTFData.calculateItemValue({...a, shg: currentSHG}) ?? 0;
        const valB = FTFData.calculateItemValue({...b, shg: currentSHG}) ?? 0;
        return -1 * (valA - valB);
      });
    }

    if (sortBy === "value") {
      return sorted.sort((a, b) => {
        const valA = FTFData.calculateItemValue({...a, shg: currentSHG}) ?? 0;
        const valB = FTFData.calculateItemValue({...b, shg: currentSHG}) ?? 0;
        return dir * (valB - valA);
      });
    }

    if (sortBy === "alphabetic") {
      return sorted.sort((a, b) => dir * a.name.localeCompare(b.name));
    }

    return sorted;
  },

  setup({
    dropdown,
    label,
    menu,
    reverseBtn,
    defaultSort = "rarity",
    onChange,
    storageKey = null,
  }) {
    const labels = { rarity: "Rarity", value: "Value", alphabetic: "Name" };

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
      } catch (e) {}
    }

    let sortBy = savedSort;
    let reverse = savedReverse;

    const persist = () => {
      if (!storageKey) return;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ sort: sortBy, reverse }),
        );
      } catch (e) {}
    };

    const setActiveOption = () => {
      if (!menu) return;
      menu.querySelectorAll(".modal-sort-option").forEach((button) => {
        button.classList.toggle("active", button.dataset.sortValue === sortBy);
      });
    };

    const updateLabel = () => {
      if (label) label.textContent = labels[sortBy] || "Rarity";
    };

    const updateReverseState = () => {
      if (reverseBtn) reverseBtn.classList.toggle("reversed", reverse);
    };

    const setState = (newSort, newReverse = false) => {
      sortBy = newSort;
      reverse = newReverse;
      updateLabel();
      setActiveOption();
      updateReverseState();
    };

    const reset = () => setState(defaultSort, false);
    const closeDropdown = () => {
      if (dropdown) dropdown.classList.remove("open");
    };

    dropdown?.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });

    menu?.addEventListener("click", (e) => {
      const opt = e.target.closest(".modal-sort-option");
      if (!opt) return;
      setState(opt.dataset.sortValue, reverse);
      closeDropdown();
      persist();
      if (onChange) onChange(sortBy, reverse);
    });

    reverseBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      reverse = !reverse;
      updateReverseState();
      persist();
      if (onChange) onChange(sortBy, reverse);
    });

    document.addEventListener("click", (e) => {
      if (
        dropdown &&
        !dropdown.contains(e.target) &&
        !reverseBtn?.contains(e.target)
      ) {
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
  },
};

export class FTFModalController {
  constructor(config) {
    this.allItems = config.allItems || [];
    this.renderItem = config.renderItem;
    this.showAddsItem = config.showAddsItem || false;
    this.onAddsClick = config.onAddsClick || null;
    this.pageSize = config.pageSize || 40;
    this.onCloseRequest = config.onCloseRequest || (() => true);
    this.onOpen = config.onOpen || (() => {});
    this.onClose = config.onClose || (() => {});

    this.modal = document.getElementById("item-modal");
    this.itemList = document.getElementById("item-list");
    this.searchInput = document.getElementById("item-search");
    this.raritySidebar = document.querySelector(".rarity-sidebar");
    this.closeBtn = document.querySelector(".close-modal");

    this.sortController = config.sortController;

    this.currentRarity = "all";
    this.currentSHG = null;
    this.filteredItemCache = [];
    this.renderedItemCount = 0;
    this.isLoadingMore = false;
    this.itemListObserver = null;
    this.searchDebounceTimer = null;

    this.initEvents();
  }

  initEvents() {
    if (this.closeBtn) {
      this.closeBtn.onclick = () => this.tryClose();
    }
    if (this.modal) {
      this.modal.onclick = (e) => {
        if (e.target === this.modal) this.tryClose();
      };
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.modal && this.modal.style.display === "flex") {
        this.tryClose();
      }
    });

    if (this.searchInput) {
      this.searchInput.oninput = () => {
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.updateDisplayedItems();
        }, 150);
      };
    }

    if (this.raritySidebar) {
      this.raritySidebar.onclick = (e) => {
        if (e.target.classList.contains("rarity-filter-btn")) {
          const activeBtn = this.raritySidebar.querySelector(".rarity-filter-btn.active");
          if (activeBtn) activeBtn.classList.remove("active");
          e.target.classList.add("active");
          this.currentRarity = e.target.dataset.rarity;
          setTimeout(() => this.updateDisplayedItems(), 0);
        }

        const shgBtn = e.target.closest(".shg-btn");
        if (shgBtn) {
          const val = shgBtn.dataset.shg;
          const activeShgBtn = this.raritySidebar.querySelector(".shg-btn.active");

          if (this.currentSHG === val) {
            this.currentSHG = null;
            if (activeShgBtn) activeShgBtn.classList.remove("active");
          } else {
            if (activeShgBtn) activeShgBtn.classList.remove("active");
            this.currentSHG = val;
            shgBtn.classList.add("active");
          }

          setTimeout(() => this.updateDisplayedItems(), 0);
        }
      };
    }
  }

  tryClose() {
    if (this.onCloseRequest()) {
      this.close();
    }
  }

  open() {
    this.currentRarity = "all";
    this.currentSHG = null;
    if (this.searchInput) this.searchInput.value = "";

    if (this.raritySidebar) {
      const activeBtn = this.raritySidebar.querySelector(".rarity-filter-btn.active");
      if (activeBtn) activeBtn.classList.remove("active");
      const allBtn = this.raritySidebar.querySelector('.rarity-filter-btn[data-rarity="all"]');
      if (allBtn) allBtn.classList.add("active");
      const activeShgBtn = this.raritySidebar.querySelector(".shg-btn.active");
      if (activeShgBtn) activeShgBtn.classList.remove("active");
    }

    this.onOpen();

    if (this.modal) this.modal.style.display = "flex";

    setTimeout(() => this.updateDisplayedItems(), 0);

    if (this.searchInput && window.innerWidth > 768) {
      setTimeout(() => this.searchInput.focus(), 100);
    }
  }

  close() {
    if (this.modal) this.modal.style.display = "none";
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.disconnectObserver();
    this.onClose();
  }

  disconnectObserver() {
    if (this.itemListObserver) {
      this.itemListObserver.disconnect();
      this.itemListObserver = null;
    }
  }

  setupScrollObserver() {
    this.disconnectObserver();
    const existingSentinel = document.getElementById("item-list-sentinel");
    if (existingSentinel) existingSentinel.remove();

    const sentinel = document.createElement("div");
    sentinel.id = "item-list-sentinel";
    sentinel.style.cssText = "height:1px;width:100%;grid-column:1/-1;";
    this.itemList.appendChild(sentinel);
    
    this.itemListObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !this.isLoadingMore) this.loadNextBatch();
      },
      { root: this.itemList, rootMargin: "100px" }
    );
    this.itemListObserver.observe(sentinel);
  }

  loadNextBatch() {
    if (this.renderedItemCount >= this.filteredItemCache.length) return;
    
    this.isLoadingMore = true;
    const existingSentinel = document.getElementById("item-list-sentinel");
    if (existingSentinel) existingSentinel.remove();

    const batch = this.filteredItemCache.slice(
      this.renderedItemCount,
      this.renderedItemCount + this.pageSize
    );
    
    const fragment = document.createDocumentFragment();
    batch.forEach((item) => fragment.appendChild(this.renderItem(item, this.currentSHG)));
    
    this.itemList.appendChild(fragment);
    this.renderedItemCount += batch.length;
    
    if (this.renderedItemCount < this.filteredItemCache.length) {
      this.setupScrollObserver();
    }
    
    this.isLoadingMore = false;
  }

  updateDisplayedItems() {
    if (!this.itemList || !this.searchInput) return;

    this.disconnectObserver();
    this.itemList.innerHTML = "";
    this.renderedItemCount = 0;
    this.isLoadingMore = false;

    if (window.itemLoadError || this.allItems.length === 0) {
      this.itemList.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #999;">No items found</div>';
      return;
    }

    const query = this.searchInput.value.toLowerCase().trim();
    let filtered = this.allItems;
    
    if (this.currentRarity !== "all") {
      filtered = filtered.filter((i) => i.rarity.toLowerCase() === this.currentRarity);
    }
    if (query) {
      filtered = filtered.filter((i) => i.name.toLowerCase().includes(query));
    }

    const fragment = document.createDocumentFragment();

    const willShowAdds = this.showAddsItem && (!query || "adds".toLowerCase().includes(query));
    if (willShowAdds && this.onAddsClick) {
      const div = document.createElement("div");
      div.className = "modal-item";
      div.innerHTML = `
          <div class="modal-item-img" style="display: flex; align-items: center; justify-content: center; background: transparent;">
              <svg viewBox="0 0 24 24" style="width: 80%; height: 80%;" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
          </div>
          <div class="modal-item-info">
              <div class="modal-item-name">Adds</div>
              <div class="modal-item-value">&nbsp;</div>
          </div>`;
      div.onclick = this.onAddsClick;
      fragment.appendChild(div);
    }

    if (filtered.length === 0) {
      this.itemList.appendChild(fragment);
      if (!willShowAdds) {
        const msg = document.createElement("p");
        msg.style.cssText = "color:#999;text-align:center;padding:2rem;grid-column:1/-1;";
        msg.textContent = "No items found";
        this.itemList.appendChild(msg);
      }
      return;
    }

    filtered = FTFModalSort.sortItems(
      filtered,
      this.sortController?.getSort() ?? "rarity",
      this.sortController?.getReverse() ?? false,
      this.currentSHG
    );

    this.filteredItemCache = filtered;

    const firstBatch = this.filteredItemCache.slice(0, this.pageSize);
    firstBatch.forEach((item) => fragment.appendChild(this.renderItem(item, this.currentSHG)));
    
    this.renderedItemCount = firstBatch.length;
    this.itemList.appendChild(fragment);

    if (this.renderedItemCount < this.filteredItemCache.length) {
      this.setupScrollObserver();
    }
  }
}
