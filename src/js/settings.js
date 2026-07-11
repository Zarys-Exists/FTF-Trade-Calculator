const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const settingsCloseBtn = document.getElementById("settings-close-btn");
const gridToggle = document.getElementById("grid-2x2-toggle");
const hideItemInfoToggle = document.getElementById("hide-item-info-toggle");
const closeImmediatelyToggle = document.getElementById("close-immediately-toggle");

function openSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.add("is-visible");
}

function closeSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.remove("is-visible");
}

function syncGridToggleUI() {
  if (!gridToggle) return;
  const isActive = document.documentElement.classList.contains("grid-2x2");
  gridToggle.classList.toggle("active", isActive);
  gridToggle.setAttribute("aria-checked", String(isActive));
}

function syncHideItemInfoUI() {
  if (!hideItemInfoToggle) return;
  const isActive = document.documentElement.classList.contains("hide-item-info");
  hideItemInfoToggle.classList.toggle("active", isActive);
  hideItemInfoToggle.setAttribute("aria-checked", String(isActive));
}

function syncCloseImmediatelyUI() {
  if (!closeImmediatelyToggle) return;
  // ON = close immediately (no multi-pick-mode class), OFF = multi-pick (class present)
  const isOn = !document.documentElement.classList.contains("multi-pick-mode");
  closeImmediatelyToggle.classList.toggle("active", isOn);
  closeImmediatelyToggle.setAttribute("aria-checked", String(isOn));
}

settingsBtn?.addEventListener("click", () => {
  syncGridToggleUI();
  syncHideItemInfoUI();
  syncCloseImmediatelyUI();
  openSettingsModal();
});

settingsCloseBtn?.addEventListener("click", closeSettingsModal);

settingsModal?.addEventListener("click", (event) => {
  if (event.target === settingsModal) {
    closeSettingsModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    settingsModal &&
    settingsModal.classList.contains("is-visible")
  ) {
    closeSettingsModal();
  }
});

gridToggle?.addEventListener("click", () => {
  const isActive = document.documentElement.classList.toggle("grid-2x2");
  localStorage.setItem("gridLayout", isActive ? "2x2" : "3x3");
  syncGridToggleUI();
});

hideItemInfoToggle?.addEventListener("click", () => {
  const isActive = document.documentElement.classList.toggle("hide-item-info");
  localStorage.setItem("hideItemInfo", isActive ? "true" : "false");
  syncHideItemInfoUI();
});

closeImmediatelyToggle?.addEventListener("click", () => {
  // toggle: if multi-pick-mode is ON it means closeImmediately is OFF
  const isMultiPick = document.documentElement.classList.toggle("multi-pick-mode");
  localStorage.setItem("closeImmediately", isMultiPick ? "false" : "true");
  syncCloseImmediatelyUI();
});

syncGridToggleUI();
syncHideItemInfoUI();
syncCloseImmediatelyUI();
