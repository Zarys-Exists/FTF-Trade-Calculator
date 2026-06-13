import { Client, Account, Databases, Query as AppwriteQuery } from "appwrite";
import { FTFData } from "./utils.js";

const APPWRITE_ENDPOINT = "https://nyc.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "69fc78bc00097545b573";
const DB_ID = "ftf_db";
const COL_PROFILES = "profiles";
const COL_INVENTORY = "user_inventory";

let cloudSaveTimer = null;

let client, account, databases;

export const FTFAuth = {
  user: null,
  profile: null,
  itemIdMap: {},
  itemNameMap: {},
  _ready: false,
  _readyCallbacks: [],

  init() {
    client = new Client()
      .setEndpoint(APPWRITE_ENDPOINT)
      .setProject(APPWRITE_PROJECT_ID);

    account = new Account(client);
    databases = new Databases(client);

    const params = new URLSearchParams(window.location.search);
    const oauthUserId = params.get("userId");
    const oauthSecret = params.get("secret");

    if (oauthUserId && oauthSecret) {
      window.history.replaceState({}, "", window.location.pathname);

      account
        .createSession(oauthUserId, oauthSecret)
        .then(() => account.get())
        .then((user) => {
          this.user = user;
          this.updateAuthUI();
          this._handleSignIn();
        })
        .catch((err) => {
          this.user = null;
          this.updateAuthUI();
          this._notifyReady();
        });
    } else {
      // Normal page load — check for an existing session
      account
        .get()
        .then((user) => {
          this.user = user;
          this.updateAuthUI();
          this._handleSignIn();
        })
        .catch((err) => {
          this.user = null;
          this.updateAuthUI();
          this._notifyReady();
        });
    }
  },

  async _handleSignIn() {
    await this.getProfile();
    if (this.profileStatus === "not_found") {
      this.showUsernamePrompt();
    } else if (this.profileStatus === "exists") {
      await this._syncDiscordUsername();
      this._notifyReady();
      if (typeof window._onAuthChange === "function")
        window._onAuthChange(this.user);
    } else {
      console.error(
        "[FTFAuth] Failed to retrieve profile due to network/platform error.",
      );
      this._notifyReady();
    }
  },

  onReady(fn) {
    if (this._ready) fn();
    else this._readyCallbacks.push(fn);
  },

  _notifyReady() {
    this._ready = true;
    this._readyCallbacks.forEach((fn) => fn());
    this._readyCallbacks = [];
  },

  buildItemMaps() {
    if (!FTFData?.allItems?.length) return;
    FTFData.buildItemMaps();
    this.itemIdMap = FTFData._itemIdMap;
    this.itemNameMap = FTFData._itemNameMap;
  },

  async signInWithDiscord() {
    if (!account) return;

    const origin = window.location.href.split("#")[0].split("?")[0];

    try {
      account.createOAuth2Token("discord", origin, origin);
    } catch (err) {
      console.error("[FTFAuth] Redirect to Discord failed:", err);
    }
  },

  async signOut() {
    if (!account) return;
    try {
      await account.deleteSession("current");
    } catch (e) {
      console.error("Sign out error:", e.message);
    }
    this.user = null;
    this.profile = null;
    this.updateAuthUI();
    if (typeof window._onAuthChange === "function") window._onAuthChange(null);
  },

  async getProfile() {
    if (!databases || !this.user) return null;
    this.profileStatus = "loading";
    try {
      const doc = await databases.getDocument(
        DB_ID,
        COL_PROFILES,
        this.user.$id,
      );
      this._profileDocId = doc.$id;
      this.profile = {
        username: doc.username,
        discord_username: doc.discord_username,
        created_at: doc.$createdAt,
      };
      this.profileStatus = "exists";
    } catch (e) {
      this.profile = null;
      if (e.code === 404) {
        this.profileStatus = "not_found";
      } else {
        console.warn("[FTFAuth] getProfile error:", e.message);
        this.profileStatus = "error";
      }
    }
    this.updateAuthUI();
    return this.profile;
  },

  async createProfile(username) {
    if (!databases || !this.user) return { error: "Not authenticated" };
    const discordName = this._getDiscordUsername() || "";
    try {
      const doc = await databases.createDocument(
        DB_ID,
        COL_PROFILES,
        this.user.$id, // Use uid as document ID — enforces one-per-user
        {
          user_id: this.user.$id,
          username: username,
          discord_username: discordName,
        },
      );
      this.profile = {
        username: doc.username,
        discord_username: doc.discord_username,
        created_at: doc.$createdAt,
      };
      this._profileDocId = doc.$id;
      this.updateAuthUI();
      this._notifyReady();
      if (typeof window._onAuthChange === "function")
        window._onAuthChange(this.user);
      return { error: null };
    } catch (e) {
      if (e.code === 409) return { error: "Username already taken" };
      return { error: e.message };
    }
  },

  _getDiscordUsername() {
    if (!this.user) return null;
    return this.user.name || null;
  },

  async _syncDiscordUsername() {
    if (!databases || !this.user || !this.profile || !this._profileDocId)
      return;
    const discordName = this._getDiscordUsername();
    if (discordName && discordName !== this.profile.discord_username) {
      try {
        await databases.updateDocument(
          DB_ID,
          COL_PROFILES,
          this._profileDocId,
          {
            discord_username: discordName,
          },
        );
        this.profile.discord_username = discordName;
      } catch (e) {
        console.warn("Could not sync Discord username:", e.message);
      }
    }
  },

  async saveInventoryToCloud(inventory) {
    if (!databases || !this.user || !this.profile) return;
    if (Object.keys(this.itemIdMap).length === 0) this.buildItemMaps();

    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(async () => {
      if (!navigator.onLine) {
        this._setSyncStatus("error");
        return;
      }
      this._setSyncStatus("saving");
      try {
        const items = [];
        for (const item of inventory) {
          const itemId = item.id || this.itemIdMap[item.name];
          if (!itemId) continue;
          const qty = item.qty ?? item.quantity ?? 1;
          const shg = (item.shg || "").trim();
          items.push(`${itemId}|${qty}|${shg}`);
        }

        await databases.updateDocument(DB_ID, COL_INVENTORY, this.user.$id, {
          items,
        });
        this._setSyncStatus("synced");
      } catch (e) {
        if (e.code === 404) {
          try {
            await this._createInventoryDoc(inventory);
            this._setSyncStatus("synced");
          } catch (ce) {
            console.error("Cloud save (create) error:", ce.message);
            this._setSyncStatus("error");
          }
        } else {
          console.error("Cloud save error:", e.message);
          this._setSyncStatus("error");
        }
      }
    }, 800);
  },

  async _createInventoryDoc(inventory) {
    const items = [];
    for (const item of inventory) {
      const itemId = item.id || this.itemIdMap[item.name];
      if (!itemId) continue;
      const qty = item.qty ?? item.quantity ?? 1;
      const shg = (item.shg || "").trim();
      items.push(`${itemId}|${qty}|${shg}`);
    }
    await databases.createDocument(DB_ID, COL_INVENTORY, this.user.$id, {
      user_id: this.user.$id,
      items: items,
    });
  },

  async loadInventoryFromCloud() {
    if (!databases || !this.user || !this.profile) return null;
    if (Object.keys(this.itemNameMap).length === 0) this.buildItemMaps();

    if (!navigator.onLine) {
      this._setSyncStatus("error");
      return null;
    }

    try {
      let doc;
      try {
        doc = await databases.getDocument(DB_ID, COL_INVENTORY, this.user.$id);
      } catch (e) {
        if (e.code === 404) {
          await databases.createDocument(DB_ID, COL_INVENTORY, this.user.$id, {
            user_id: this.user.$id,
            items: [],
          });
          this._setSyncStatus("synced");
          return [];
        }
        this._setSyncStatus("error");
        throw e;
      }

      this._setSyncStatus("synced");
      const rawItems = doc.items || [];
      if (rawItems.length === 0) return [];

      return rawItems
        .map((str) => {
          const [itemId, qtyStr, shg] = str.split("|");
          const itemData = this.itemNameMap[itemId];
          if (!itemData) return null;
          return {
            id: itemId,
            name: itemData.name,
            rarity: itemData.rarity,
            value: itemData.value,
            baseValue: itemData.value,
            stability: itemData.stability,
            stabilityType:
              FTFData.parseStabilityType(itemData.stability) || null,
            shg: shg && shg.trim() ? shg.trim() : null,
            quantity: Math.max(1, parseInt(qtyStr) || 1),
          };
        })
        .filter(Boolean);
    } catch (e) {
      console.error("Cloud load error:", e.message);
      return null;
    }
  },

  // --- LOCAL STORAGE MIGRATION ---
  async migrateLocalStorage() {
    try {
      const saved = localStorage.getItem("ftf-inventory");
      if (!saved) return false;
      const local = JSON.parse(saved);
      if (!Array.isArray(local) || local.length === 0) return false;

      const cloud = await this.loadInventoryFromCloud();
      if (cloud && cloud.length > 0) return false;

      if (local[0] && local[0].id && !local[0].name) {
        if (Object.keys(this.itemNameMap).length === 0) this.buildItemMaps();
        const hydrated = local
          .map((entry) => {
            const item = this.itemNameMap[entry.id];
            if (!item) return null;
            return {
              ...item,
              baseValue: item.value,
              quantity: Math.max(1, entry.qty ?? 1),
              shg: entry.shg || null,
            };
          })
          .filter(Boolean);
        return hydrated.length > 0 ? hydrated : false;
      }

      return local;
    } catch (e) {
      return false;
    }
  },

  _setSyncStatus(status) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    el.className = "sync-status";
    switch (status) {
      case "saving":
        el.textContent = "Saving…";
        el.classList.add("sync-saving");
        break;
      case "synced":
        el.textContent = "Synced ✓";
        el.classList.add("sync-done");
        break;
      case "error":
        el.textContent = "Sync failed";
        el.classList.add("sync-error");
        break;
      default:
        el.textContent = "";
    }
  },

  // --- UI ---
  updateAuthUI() {
    const btn = document.getElementById("auth-btn");
    if (!btn) return;

    if (this.user && this.profile) {
      btn.innerHTML = `
                <span class="auth-username">${this._escapeHtml(this.profile.username)}</span>
                <svg class="auth-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 5 7 8 4"/></svg>`;
      btn.classList.add("logged-in");
      btn.onclick = (e) => {
        e.stopPropagation();
        const dd = document.getElementById("auth-dropdown");
        if (dd) dd.classList.toggle("is-visible");
      };
    } else {
      btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>Login</span>`;
      btn.classList.remove("logged-in");
      btn.onclick = () => this.signInWithDiscord();
    }
    btn.classList.remove("auth-loading");
  },

  showUsernamePrompt() {
    if (document.getElementById("username-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "username-modal";
    overlay.className = "username-modal-overlay";
    overlay.innerHTML = `
            <div class="username-modal-card">
                <h3>Choose a Username</h3>
                <p>This will be your display name. 3–20 characters, letters, numbers, and underscores only.</p>
                <div class="username-input-wrap">
                    <input type="text" id="username-input" class="username-input" maxlength="20" autocomplete="off" spellcheck="false" placeholder="username">
                    <span class="username-error" id="username-error"></span>
                </div>
                <div class="username-modal-actions">
                    <button id="username-submit" class="inv-btn-primary" disabled>Create Account</button>
                </div>
            </div>`;
    document.body.appendChild(overlay);

    const input = document.getElementById("username-input");
    const submit = document.getElementById("username-submit");
    const errorEl = document.getElementById("username-error");

    const validate = (val) => {
      if (val.length < 3) return "At least 3 characters";
      if (val.length > 20) return "Max 20 characters";
      if (!/^[a-zA-Z0-9_]+$/.test(val))
        return "Letters, numbers, underscores only";
      return null;
    };

    input.addEventListener("input", () => {
      const err = validate(input.value);
      errorEl.textContent = err || "";
      submit.disabled = !!err;
    });

    submit.addEventListener("click", async () => {
      const val = input.value.trim();
      const err = validate(val);
      if (err) {
        errorEl.textContent = err;
        return;
      }

      submit.disabled = true;
      submit.textContent = "Creating…";
      const result = await this.createProfile(val);
      if (result.error) {
        errorEl.textContent = result.error;
        submit.disabled = false;
        submit.textContent = "Create Account";
      } else {
        overlay.remove();
        this._checkMigration();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !submit.disabled) submit.click();
    });

    setTimeout(() => input.focus(), 100);
  },

  async _checkMigration() {
    const localData = await this.migrateLocalStorage();
    if (localData && localData.length > 0) {
      this._showMigrationPrompt(localData);
    }
  },

  _showMigrationPrompt(localData) {
    if (document.getElementById("migration-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "migration-modal";
    overlay.className = "username-modal-overlay";
    overlay.innerHTML = `
            <div class="username-modal-card">
                <h3>Import Local Inventory?</h3>
                <p>We found <strong>${localData.length}</strong> item${localData.length !== 1 ? "s" : ""} in your browser's local storage. Would you like to upload them to your account?</p>
                <div class="username-modal-actions">
                    <button id="migration-skip" class="inv-btn-secondary">Start Fresh</button>
                    <button id="migration-upload" class="inv-btn-primary">Upload</button>
                </div>
            </div>`;
    document.body.appendChild(overlay);

    document.getElementById("migration-skip").addEventListener("click", () => {
      overlay.remove();
      if (typeof window._onAuthChange === "function")
        window._onAuthChange(this.user);
    });

    document
      .getElementById("migration-upload")
      .addEventListener("click", async () => {
        const btn = document.getElementById("migration-upload");
        btn.disabled = true;
        btn.textContent = "Uploading…";
        if (Object.keys(this.itemIdMap).length === 0) this.buildItemMaps();

        const items = [];
        for (const item of localData) {
          const itemId = item.id || this.itemIdMap[item.name];
          if (!itemId) continue;
          const qty = item.qty ?? item.quantity ?? 1;
          const shg = (item.shg || "").trim();
          items.push(`${itemId}|${qty}|${shg}`);
        }
        try {
          await databases.updateDocument(DB_ID, COL_INVENTORY, this.user.$id, {
            items,
          });
        } catch (e) {
          if (e.code === 404) {
            try {
              await databases.createDocument(
                DB_ID,
                COL_INVENTORY,
                this.user.$id,
                {
                  user_id: this.user.$id,
                  items,
                },
              );
            } catch (ce) {
              console.error("Migration upload error:", ce.message);
            }
          } else {
            console.error("Migration upload error:", e.message);
          }
        }

        overlay.remove();
        if (typeof window._onAuthChange === "function")
          window._onAuthChange(this.user);
      });
  },

  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
