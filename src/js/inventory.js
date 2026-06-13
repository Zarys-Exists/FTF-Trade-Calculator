import { FTFData, FTFModalSort, FTFModalController } from "./utils.js";
import { FTFAuth } from "./auth.js";
import "./nav.js";

FTFAuth.init();

const IMG_BASE = "items/";
const ITEM_PAGE_SIZE = 40;

let allItems = [];
let inventory = [];
let pendingAdds = new Map();
let currentRarity = "all";
let currentSort = "default";
let currentSHG = null;
let invSearchQuery = "";
let searchDebounceTimer = null;
let invSearchDebounceTimer = null;
let sortDescending = false;
let modalController = null;
let modalSortController = null;
let filteredItemCache = []; // Keep around or let controller manage
let _rawSavedInventory = null;

const RARITY_ORDER = { Legendary: 0, Epic: 1, Rare: 2, Common: 3 };
const SORT_LABELS = {
  default: "Value",
  rarity: "Rarity",
  name: "Name",
  "added order": "Added Order",
};

const STABILITY_COLORS = {
  rising: "#34d399",
  improving: "#46d27a",
  "doing-well": "#a3e635",
  fluctuating: "#facc15",
  struggling: "#fb923c",
  receding: "#f87171",
  dropping: "#ef4444",
};

const modal = document.getElementById("item-modal");
const itemList = document.getElementById("item-list");
const closeModalBtn = document.querySelector(".close-modal");
const searchInput = document.getElementById("item-search");
const raritySidebar = document.querySelector(".rarity-sidebar");
const inventoryGrid = document.getElementById("inventory-grid");
const emptyState = document.getElementById("inventory-empty");
const statTotalValue = document.getElementById("stat-total-value");
const statUniqueItems = document.getElementById("stat-unique-items");
const statTotalQty = document.getElementById("stat-total-qty");
const invSearchEl = document.getElementById("inv-search");
const invSearchClear = document.getElementById("inv-search-clear");
const confirmOverlay = document.getElementById("confirm-dialog");

const sortDropdown = document.getElementById("inv-sort-dropdown");
const sortTrigger = document.getElementById("inv-sort-trigger");
const sortLabel = document.getElementById("inv-sort-label");
const sortMenu = document.getElementById("inv-sort-menu");

const modalSortDropdown = document.getElementById("modal-sort-dropdown");
const modalSortLabel = document.getElementById("modal-sort-label");
const modalSortMenu = document.getElementById("modal-sort-menu");
const modalSortReversBtn = document.getElementById("modal-sort-reverse");

const inventorySidebar = document.getElementById("inventory-sidebar");
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");

function initSidebarToggle() {
  const isMinimized = localStorage.getItem("inv-sidebar-minimized") === "true";
  if (isMinimized) {
    inventorySidebar.classList.add("minimized");
    sidebarToggleBtn.classList.add("minimized");
    document.querySelector(".sidebar-wrapper").classList.add("minimized");
    document.documentElement.setAttribute("data-sidebar-minimized", "true");
  }
  sidebarToggleBtn.addEventListener("click", toggleSidebar);
}

function toggleSidebar() {
  inventorySidebar.classList.toggle("minimized");
  sidebarToggleBtn.classList.toggle("minimized");
  document.querySelector(".sidebar-wrapper").classList.toggle("minimized");
  const isMinimized = inventorySidebar.classList.contains("minimized");
  localStorage.setItem("inv-sidebar-minimized", isMinimized);

  if (isMinimized) {
    document.documentElement.setAttribute("data-sidebar-minimized", "true");
  } else {
    document.documentElement.removeAttribute("data-sidebar-minimized");
  }
}

function showConfirm({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  variant,
}) {
  if (!confirmOverlay) return;
  document.getElementById("confirm-icon").style.display = "none";
  document.getElementById("confirm-title").textContent =
    title || "Are you sure?";
  document.getElementById("confirm-msg").textContent = message || "";
  const actions = document.getElementById("confirm-actions");
  actions.innerHTML = "";

  const btnCancel = document.createElement("button");
  btnCancel.className = "confirm-btn-secondary";
  btnCancel.textContent = cancelLabel || "Cancel";
  btnCancel.onclick = () => confirmOverlay.classList.remove("is-visible");
  actions.appendChild(btnCancel);

  const btnConfirm = document.createElement("button");
  btnConfirm.className =
    variant === "danger" ? "confirm-btn-danger" : "confirm-btn-primary";
  btnConfirm.textContent = confirmLabel || "Confirm";
  btnConfirm.onclick = () => {
    confirmOverlay.classList.remove("is-visible");
    if (onConfirm) onConfirm();
  };
  actions.appendChild(btnConfirm);

  confirmOverlay.classList.add("is-visible");
  btnCancel.focus();
}

function showAlert({ title, message }) {
  if (!confirmOverlay) return;
  document.getElementById("confirm-icon").style.display = "none";
  document.getElementById("confirm-title").textContent = title || "Notice";
  document.getElementById("confirm-msg").textContent = message || "";
  const actions = document.getElementById("confirm-actions");
  actions.innerHTML = "";

  const btnOk = document.createElement("button");
  btnOk.className = "confirm-btn-primary";
  btnOk.textContent = "OK";
  btnOk.onclick = () => confirmOverlay.classList.remove("is-visible");
  actions.appendChild(btnOk);

  confirmOverlay.classList.add("is-visible");
  btnOk.focus();
}

function saveInventory() {
  try {
    const compact = inventory.map((item) => ({
      id: item.id,
      qty: item.quantity,
      shg: item.shg || null,
    }));
    localStorage.setItem("ftf-inventory", JSON.stringify(compact));
  } catch (e) {
    console.error("Failed to save inventory:", e);
  }
  if (FTFAuth?.user && FTFAuth?.profile) {
    FTFAuth.saveInventoryToCloud(inventory);
  }
}
function loadInventory() {
  try {
    const saved = localStorage.getItem("ftf-inventory");
    if (saved) _rawSavedInventory = JSON.parse(saved);
    else _rawSavedInventory = [];
  } catch (e) {
    _rawSavedInventory = [];
  }
}
function hydrateInventoryFromRaw() {
  if (!_rawSavedInventory) return;

  const nameMap = FTFData?._itemNameMap || {};
  const idMap = FTFData?._itemIdMap || {};
  inventory = _rawSavedInventory
    .map((entry) => {
      if (entry.id) {
        const item = nameMap[entry.id];
        if (!item) return null;
        return {
          ...item,
          baseValue: item.value,
          quantity: Math.max(1, entry.qty ?? 1),
          shg: entry.shg || null,
          stabilityType: FTFData.parseStabilityType(item.stability),
        };
      }

      if (entry.name) {
        const itemId = idMap[entry.name];
        const item = itemId ? nameMap[itemId] : null;
        if (!item) return null;
        return {
          ...item,
          baseValue: item.value,
          quantity: Math.max(1, entry.quantity ?? entry.qty ?? 1),
          shg: entry.shg || null,
          stabilityType: FTFData.parseStabilityType(item.stability),
        };
      }
      return null;
    })
    .filter(Boolean);
  _rawSavedInventory = null;
}

async function loadInventoryFromCloud() {
  if (!FTFAuth?.user || !FTFAuth?.profile) return false;
  try {
    const cloud = await FTFAuth.loadInventoryFromCloud();
    if (cloud && cloud.length > 0) {
      inventory = cloud;
      const compact = inventory.map((item) => ({
        id: item.id,
        qty: item.quantity,
        shg: item.shg || null,
      }));
      localStorage.setItem("ftf-inventory", JSON.stringify(compact));
      return true;
    }
  } catch (e) {
    console.error("Cloud load failed:", e);
  }
  return false;
}

function saveSortOptions() {
  try {
    localStorage.setItem(
      "ftf-inv-sort",
      JSON.stringify({ sort: currentSort, desc: sortDescending }),
    );
  } catch (e) {
    console.error("Failed to save sort options:", e);
  }
}
function loadSortOptions() {
  try {
    const savedSort = localStorage.getItem("ftf-inv-sort");
    if (savedSort) {
      const data = JSON.parse(savedSort);
      currentSort = data.sort || "default";
      sortDescending = data.desc !== undefined ? data.desc : false;
      if (sortLabel) {
        sortLabel.textContent =
          "Sort: " + (SORT_LABELS[currentSort] || "Value");
      }
      updateSortDirButton();

      if (sortMenu) {
        sortMenu
          .querySelectorAll(".inv-sort-option")
          .forEach((b) => b.classList.remove("active"));
        const opt = sortMenu.querySelector(
          `.inv-sort-option[data-value="${currentSort}"]`,
        );
        if (opt) opt.classList.add("active");
      }
    }
  } catch (e) {
    console.error("Failed to load sort options:", e);
  }
}

function getSortedInventory() {
  const arr = [...inventory];
  switch (currentSort) {
    case "rarity": {
      const dir = sortDescending ? -1 : 1;
      return arr.sort(
        (a, b) =>
          dir *
          ((RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99)) ||
          a.name.localeCompare(b.name),
      );
    }
    case "name":
      return sortDescending
        ? arr.sort((a, b) => b.name.localeCompare(a.name))
        : arr.sort((a, b) => a.name.localeCompare(b.name));
    case "default": {
      const dir = sortDescending ? -1 : 1;
      return arr
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
          const valA =
            FTFData.calculateItemValue(a.item) * (a.item.quantity || 1);
          const valB =
            FTFData.calculateItemValue(b.item) * (b.item.quantity || 1);
          if (valA !== valB) return dir * (valB - valA);

          const rarA = RARITY_ORDER[a.item.rarity] ?? 99;
          const rarB = RARITY_ORDER[b.item.rarity] ?? 99;
          if (rarA !== rarB) return rarA - rarB;

          if (a.index !== b.index) return a.index - b.index;
          return a.item.name.localeCompare(b.item.name);
        })
        .map((o) => o.item);
    }
    case "added order":
      return sortDescending ? arr : [...arr].reverse();
    default:
      return arr;
  }
}

function getSortedFilteredInventory() {
  const sorted = getSortedInventory();
  if (!invSearchQuery) return sorted;
  const q = invSearchQuery.toLowerCase();
  return sorted.filter((i) => i.name.toLowerCase().includes(q));
}

function getSortLabel() {
  return SORT_LABELS[currentSort] || "Value";
}

function updateSortDirButton() {
  const dirBtn = document.getElementById("inv-sort-dir");
  if (!dirBtn) return;
  dirBtn.classList.toggle("desc", !sortDescending);
}

const RARITY_COLORS = {
  Legendary: "comp-legendary",
  Epic: "comp-epic",
  Rare: "comp-rare",
  Common: "comp-common",
};
const RARITY_SEQUENCE = Object.keys(RARITY_ORDER).sort(
  (a, b) => RARITY_ORDER[a] - RARITY_ORDER[b],
);

function renderInventory() {
  inventoryGrid.innerHTML = "";
  const display = getSortedFilteredInventory();
  const actuallyEmpty = inventory.length === 0;
  const searchEmpty = !actuallyEmpty && display.length === 0;

  if (actuallyEmpty) {
    emptyState.style.display = "flex";
    emptyState.querySelector("p").textContent = "Your inventory is empty";
    emptyState.querySelector("span").textContent =
      'Click "+ Add Items" to start tracking your collection';
  } else if (searchEmpty) {
    emptyState.style.display = "flex";
    emptyState.querySelector("p").textContent = "No items match your search";
    emptyState.querySelector("span").textContent = "Try a different name";
  } else {
    emptyState.style.display = "none";
  }

  if (currentSort === "rarity") {
    const groups = {};
    RARITY_SEQUENCE.forEach((r) => {
      groups[r] = [];
    });
    display.forEach((item) => {
      if (groups[item.rarity]) groups[item.rarity].push(item);
      else groups["Common"].push(item);
    });
    const sequenceToRender = sortDescending
      ? [...RARITY_SEQUENCE].reverse()
      : RARITY_SEQUENCE;

    sequenceToRender.forEach((rarity) => {
      const items = groups[rarity];
      if (!items.length) return;
      const groupEl = document.createElement("div");
      groupEl.className = "inv-rarity-group";
      const header = document.createElement("div");
      header.className = `inv-rarity-header ${RARITY_COLORS[rarity] || ""}`;
      header.textContent = `${rarity} — ${items.length} item${items.length !== 1 ? "s" : ""}`;
      groupEl.appendChild(header);
      const grid = document.createElement("div");
      grid.className = "inventory-grid-inner";
      items.forEach((item) => grid.appendChild(createInventoryCard(item)));
      groupEl.appendChild(grid);
      inventoryGrid.appendChild(groupEl);
    });
  } else {
    const grid = document.createElement("div");
    grid.className = "inventory-grid-inner";
    display.forEach((item) => grid.appendChild(createInventoryCard(item)));
    inventoryGrid.appendChild(grid);
  }
  updateStats();
}

function createInventoryCard(item) {
  const card = document.createElement("div");
  card.className = "inv-card";

  const stabilityType =
    item.stabilityType || FTFData.parseStabilityType(item.stability);
  if (stabilityType) card.dataset.stability = stabilityType;
  if (FTFData.shouldShowSHGBadge(item)) card.dataset.shg = item.shg;

  const updateCardValue = (qty) => {
    const val = FTFData.calculateItemValue(item) * (qty || 1);
    return FTFData.formatFV(val) + " fv";
  };
  const initialValue = updateCardValue(item.quantity);
  const filename = encodeURIComponent(item.name + ".webp");

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

  const valSpan = card.querySelector(".inv-card-value");

  card.querySelector(".inv-card-remove").onclick = (e) => {
    e.stopPropagation();
    const targetSHG = item.shg || null;
    const idx = inventory.findIndex(
      (i) => i.name === item.name && (i.shg || null) === targetSHG,
    );
    if (idx !== -1) inventory.splice(idx, 1);
    saveInventory();

    if (currentSort === "rarity") {
      const gridInner = card.closest(".inventory-grid-inner");
      card.remove();
      if (gridInner) {
        if (gridInner.children.length === 0) {
          gridInner.closest(".inv-rarity-group")?.remove();
        } else {
          const header = gridInner
            .closest(".inv-rarity-group")
            ?.querySelector(".inv-rarity-header");
          if (header) {
            const count = gridInner.children.length;
            header.textContent = `${item.rarity} — ${count} item${count !== 1 ? "s" : ""}`;
          }
        }
      }
    } else {
      card.remove();
    }

    if (inventory.length === 0) {
      emptyState.style.display = "flex";
      emptyState.querySelector("p").textContent = "Your inventory is empty";
      emptyState.querySelector("span").textContent =
        'Click "+  Add Items" to start tracking your collection';
    }
    updateStats();
  };

  const input = card.querySelector(".qty-input");
  card.querySelector(".inc").onclick = () => {
    item.quantity = Math.min(100, (item.quantity || 1) + 1);
    if (normalizeInventory()) {
      saveInventory();
      renderInventory();
    } else {
      input.value = item.quantity;
      valSpan.textContent = updateCardValue(item.quantity);
      saveInventory();
      updateStats();
    }
  };
  card.querySelector(".dec").onclick = () => {
    item.quantity = Math.max(1, (item.quantity || 1) - 1);
    if (normalizeInventory()) {
      saveInventory();
      renderInventory();
    } else {
      input.value = item.quantity;
      valSpan.textContent = updateCardValue(item.quantity);
      saveInventory();
      updateStats();
    }
  };
  input.oninput = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    e.target.value = val;
    if (val === "") return;
    const num = Math.min(100, Math.max(1, parseInt(val)));
    item.quantity = num;
    e.target.value = num;
    if (normalizeInventory()) {
      saveInventory();
      renderInventory();
    } else {
      valSpan.textContent = updateCardValue(item.quantity);
      saveInventory();
      updateStats();
    }
  };
  input.onblur = (e) => {
    if (!e.target.value || Number(e.target.value) < 1) {
      e.target.value = 1;
      item.quantity = 1;
      if (normalizeInventory()) {
        saveInventory();
        renderInventory();
      } else {
        valSpan.textContent = updateCardValue(item.quantity);
        saveInventory();
        updateStats();
      }
    }
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") e.target.blur();
  };

  return card;
}

function normalizeInventory() {
  let changed = false;
  const groups = {};
  inventory.forEach((i) => {
    if (i.quantity === undefined) i.quantity = 1;
    if (!groups[i.name]) groups[i.name] = { set: null, h: null, g: null };
    if (i.shg === "h") groups[i.name].h = i;
    else if (i.shg === "g") groups[i.name].g = i;
    else groups[i.name].set = i;
  });

  Object.keys(groups).forEach((name) => {
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
      hItem.quantity -= toAdd;
      gItem.quantity -= toAdd;
    }
  });

  const lenBefore = inventory.length;
  inventory = inventory.filter((i) => i.quantity > 0);
  if (inventory.length !== lenBefore) changed = true;

  return changed;
}

function updateStats() {
  const totalValue = inventory.reduce(
    (s, i) => s + FTFData.calculateItemValue(i) * (i.quantity || 1),
    0,
  );
  if (statTotalValue)
    statTotalValue.textContent = FTFData.formatFV(totalValue) + " fv";

  let totalUnique = 0;
  let totalQty = 0;
  const ownedNames = [];

  inventory.forEach((i) => {
    if (i.shg === null) {
      totalUnique += 1;
      totalQty += i.quantity || 1;
      ownedNames.push(i.name);
    }
  });

  if (statUniqueItems)
    statUniqueItems.textContent = totalUnique.toLocaleString();
  if (statTotalQty) statTotalQty.textContent = totalQty.toLocaleString();

  RARITY_SEQUENCE.forEach((rarity) => {
    const el = document.getElementById(`stat-${rarity.toLowerCase()}-value`);
    if (!el) return;
    const val = inventory
      .filter((i) => (i.rarity || "").toLowerCase() === rarity.toLowerCase())
      .reduce(
        (s, i) => s + FTFData.calculateItemValue(i) * (i.quantity || 1),
        0,
      );
    el.textContent = FTFData.formatFV(val) + " fv";
  });

  const nameGroups = {};
  inventory.forEach((i) => {
    if (i.shg === null) nameGroups[i.name] = { rarity: i.rarity };
  });

  updateRarityCompletion(ownedNames, nameGroups);
}

function updateRarityCompletion(ownedNames, nameGroups) {
  RARITY_SEQUENCE.forEach((rarity) => {
    const total = allItems.filter((i) => i.rarity === rarity).length;
    const owned = ownedNames.filter(
      (name) => nameGroups[name].rarity === rarity,
    ).length;
    const pct = total > 0 ? (owned / total) * 100 : 0;
    const el = document.getElementById(`completion-${rarity.toLowerCase()}`);
    if (!el) return;
    el.querySelector(".completion-bar-fill").style.width = pct + "%";
    el.querySelector(".completion-count").textContent =
      total > 0 ? `${owned} / ${total}` : `${owned} / \u2014`;
    el.querySelector(".completion-pct").textContent = Math.round(pct) + "%";
  });
}

function openModal() {
  pendingAdds.clear();
  updateDoneButton();
  if (modalController) modalController.open();
}

function updateDoneButton() {
  const btn = document.getElementById("inv-modal-done");
  if (!btn) return;
  const n = pendingAdds.size;
  if (n > 0) {
    btn.textContent = `Add ${n} Item${n !== 1 ? "s" : ""}`;
    btn.style.display = "";
  } else {
    btn.style.display = "none";
  }
}

function commitAndClose() {
  pendingAdds.forEach((itemData, key) => {
    const itemSHG = itemData.shg || null;
    const existing = inventory.find(
      (i) => i.name === itemData.name && (i.shg || null) === itemSHG,
    );
    if (existing) {
      existing.quantity = Math.min(100, (existing.quantity || 1) + 1);
    } else {
      inventory.push({ ...itemData, shg: itemSHG, quantity: 1 });
    }
  });
  pendingAdds.clear();
  normalizeInventory();
  saveInventory();
  renderInventory();
  if (modalController) modalController.close();
}

function dismissWithoutAdding() {
  pendingAdds.clear();
  if (modalController) modalController.close();
}

// modal functions replaced by FTFModalController

async function takeScreenshots() {
  if (inventory.length === 0) {
    showAlert({
      title: "Nothing to screenshot",
      message: "Your inventory is empty. Add some items first.",
    });
    return;
  }
  
  const btn = document.getElementById("screenshot-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Preparing…";
  }
  
  try {
    const { exportInventoryImages } = await import('./canvas.js');
    await exportInventoryImages(getSortedInventory(), getSortLabel(), IMG_BASE, showAlert);
  } catch (err) {
    console.error("Canvas export failed:", err);
    if (btn) {
      btn.textContent = "Error";
      setTimeout(() => {
        btn.textContent = "Save as Image";
        btn.disabled = false;
      }, 3000);
    }
  }
}

// --- INIT ---
let lastLoadedUserId = null;

async function init() {
  if (!FTFData) {
    console.error("Essential data utility (utils.js) failed to load.");
    showAlert({
      title: "Data Loading Error",
      message:
        "The item database failed to load. Please check your internet connection or refresh the page.",
    });
    return;
  }

  loadSortOptions();
  initSidebarToggle();

  const dataPromise = FTFData.init();
  const authPromise = new Promise((resolve) => {
    if (FTFAuth) {
      FTFAuth.onReady(() => resolve());
    } else {
      resolve();
    }
  });

  try {
    await Promise.all([dataPromise, authPromise]);
    allItems = FTFData.allItems;

    modalSortController = FTFModalSort.setup({
      dropdown: modalSortDropdown,
      label: modalSortLabel,
      menu: modalSortMenu,
      reverseBtn: modalSortReversBtn,
      defaultSort: "rarity",
      storageKey: "ftf-modal-sort",
      onChange: () => {
        if (modalController) modalController.updateDisplayedItems();
      },
    });

    modalController = new FTFModalController({
      allItems: allItems,
      sortController: modalSortController,
      showAddsItem: false,
      onCloseRequest: () => {
        if (pendingAdds.size > 0) {
          const n = pendingAdds.size;
          showConfirm({
            title: "Discard selected items?",
            message: `You have ${n} item${n !== 1 ? "s" : ""} selected that won't be added. Press "Add ${n} Item${n !== 1 ? "s" : ""}" if you want ${n !== 1 ? "them" : "it"} added.`,
            confirmLabel: "Discard",
            cancelLabel: "Go Back",
            variant: "danger",
            onConfirm: () => {
              pendingAdds.clear();
              modalController.close();
            },
          });
          return false;
        }
        return true;
      },
      renderItem: (item, currentSHG) => {
        const div = document.createElement("div");
        const shgStr = currentSHG || "none";
        const key = `${item.name}-${shgStr}`;
        const isPending = pendingAdds.has(key);
      
        const isOwned = inventory.some(
          (i) => i.name === item.name && (i.shg || "none") === shgStr,
        );
        div.className = `modal-item${isPending ? " inv-pending" : ""}`;
        div.dataset.itemName = item.name;
        const filename = encodeURIComponent(item.name + ".webp");
        let tempItem = { ...item, shg: shgStr === "none" ? null : shgStr };
        let val = FTFData.calculateItemValue(tempItem);
        let displayVal = FTFData.formatFV(val);
      
        div.innerHTML = `
                  <div class="modal-item-img">
                      <img src="${IMG_BASE}${filename}" loading="lazy"
                           onerror="this.src='${IMG_BASE}Default.webp'" alt="${item.name}">
                      ${isOwned ? '<div class="inv-owned-badge">Owned</div>' : ""}
                  </div>
                  <div class="modal-item-info">
                      <div class="modal-item-name">${item.name}</div>
                      <div class="modal-item-value">${displayVal}</div>
                  </div>`;
        div.onclick = () => {
          const currentKey = `${item.name}-${currentSHG || "none"}`;
          if (pendingAdds.has(currentKey)) {
            pendingAdds.delete(currentKey);
            div.classList.remove("inv-pending");
          } else {
            pendingAdds.set(currentKey, {
              id: item.id,
              name: item.name,
              rarity: item.rarity,
              baseValue: item.value,
              value: item.value,
              stability: item.stability,
              stabilityType: FTFData.parseStabilityType(item.stability),
              shg: currentSHG || null,
            });
            div.classList.add("inv-pending");
          }
          updateDoneButton();
        };
        return div;
      }
    });

    FTFData.buildItemMaps();
    if (FTFAuth) FTFAuth.buildItemMaps();

    if (FTFAuth?.user && FTFAuth?.profile) {
      const currentUserId = FTFAuth.user.$id;
      if (currentUserId !== lastLoadedUserId) {
        lastLoadedUserId = currentUserId;
        const loaded = await loadInventoryFromCloud();
        if (!loaded) {
          loadInventory();
          hydrateInventoryFromRaw();
        }
      }
    } else {
      loadInventory();
      hydrateInventoryFromRaw();
    }

    renderInventory();
  } catch (e) {
    console.error("Inventory init error:", e);
    showAlert({
      title: "Database Sync Error",
      message:
        "We could not sync the latest item values. Your local inventory is still visible but values may be outdated.",
    });

    loadInventory();
    hydrateInventoryFromRaw();
    renderInventory();
  } finally {
    const loader = document.getElementById("inventory-loader");
    if (loader) {
      loader.classList.remove("is-visible");
    }
  }

  window._onAuthChange = async (user) => {
    const currentUserId = user?.$id || null;
    if (currentUserId === lastLoadedUserId) return;
    lastLoadedUserId = currentUserId;

    if (user && FTFAuth?.profile) {
      if (FTFData?.allItems?.length) {
        FTFData.buildItemMaps();
        FTFAuth.buildItemMaps();
      }
      const loaded = await loadInventoryFromCloud();
      if (loaded) {
        renderInventory();
      }
    } else if (!user) {
      localStorage.removeItem("ftf-inventory");
      inventory = [];
      renderInventory();
    }
  };
}

document.getElementById("open-modal-btn")?.addEventListener("click", openModal);
document
  .getElementById("inv-modal-done")
  ?.addEventListener("click", commitAndClose);
document
  .getElementById("inv-modal-cancel")
  ?.addEventListener("click", dismissWithoutAdding);
document
  .getElementById("screenshot-btn")
  ?.addEventListener("click", takeScreenshots);

sortTrigger?.addEventListener("click", (e) => {
  e.stopPropagation();
  sortDropdown?.classList.toggle("open");
});

sortMenu?.addEventListener("click", (e) => {
  const opt = e.target.closest(".inv-sort-option");
  if (!opt) return;
  currentSort = opt.dataset.value;
  sortDescending = false;
  updateSortDirButton();
  if (sortLabel)
    sortLabel.textContent = "Sort: " + (opt.textContent || "Added Order");
  sortMenu
    .querySelectorAll(".inv-sort-option")
    .forEach((b) => b.classList.remove("active"));
  opt.classList.add("active");
  sortDropdown?.classList.remove("open");
  saveSortOptions();
  renderInventory();
});

document.getElementById("inv-sort-dir")?.addEventListener("click", (e) => {
  e.stopPropagation();
  sortDescending = !sortDescending;
  updateSortDirButton();
  saveSortOptions();
  renderInventory();
});

document.addEventListener("click", (e) => {
  if (sortDropdown && !sortDropdown.contains(e.target)) {
    sortDropdown.classList.remove("open");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sortDropdown?.classList.contains("open")) {
    sortDropdown.classList.remove("open");
  }
});

// Event handlers for modal logic moved to FTFModalController

invSearchEl?.addEventListener("input", () => {
  invSearchQuery = invSearchEl.value.trim();
  if (invSearchClear)
    invSearchClear.style.display = invSearchQuery ? "block" : "none";
  clearTimeout(invSearchDebounceTimer);
  invSearchDebounceTimer = setTimeout(() => {
    renderInventory();
  }, 400);
});

invSearchClear?.addEventListener("click", () => {
  invSearchQuery = "";
  if (invSearchEl) invSearchEl.value = "";
  invSearchClear.style.display = "none";
  renderInventory();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    let activeModal = null;
    if (confirmOverlay?.classList.contains("is-visible")) {
      activeModal = confirmOverlay;
    } else if (modal?.style.display === "flex") {
      activeModal = modal;
    }
    if (activeModal) {
      const focusable = activeModal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    }
  }
});

document
  .getElementById("clear-inventory-btn")
  ?.addEventListener("click", () => {
    if (inventory.length === 0) return;
    const totalQty = inventory.reduce((s, i) => s + (i.quantity || 1), 0);
    showConfirm({
      title: "Clear entire inventory?",
      message: `This will remove all ${totalQty} item${totalQty !== 1 ? "s" : ""} from your inventory. This cannot be undone.`,
      confirmLabel: "Clear All",
      cancelLabel: "Keep Items",
      variant: "danger",
      onConfirm: () => {
        inventory = [];
        invSearchQuery = "";
        if (invSearchEl) invSearchEl.value = "";
        if (invSearchClear) invSearchClear.style.display = "none";
        saveInventory();
        renderInventory();
      },
    });
  });

window.addEventListener("online", () => {
  const syncStatus = document.getElementById("sync-status");
  if (syncStatus && syncStatus.classList.contains("sync-error")) {
    if (typeof inventory !== "undefined" && FTFAuth && FTFAuth.profile) {
      saveInventory();
    }
  }
});

const syncStatusBtn = document.getElementById("sync-status");
if (syncStatusBtn) {
  syncStatusBtn.addEventListener("click", () => {
    if (syncStatusBtn.classList.contains("sync-error")) {
      if (typeof inventory !== "undefined" && FTFAuth && FTFAuth.profile) {
        saveInventory();
      }
    }
  });
}

init();
