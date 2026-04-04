// docs/auth.js — Supabase Auth & Cloud Sync Module
(function () {
    const SUPABASE_URL = 'https://uoffsenmogzlurhhhyru.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZmZzZW5tb2d6bHVyaGhoeXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjA4OTYsImV4cCI6MjA5MDc5Njg5Nn0.tVoPzvAm7BnKQAsvT1y-ugELYgimFBWUxrCvWkf4l5I';

    let cloudSaveTimer = null;
    let noteSaveTimer = null;

    window.FTFAuth = {
        supabase: null,
        user: null,
        profile: null,
        itemIdMap: {},
        itemNameMap: {},
        _cloudSnapshot: null, // Map<`${item_id}|${shg}`, {qty}> — last known cloud state
        _ready: false,
        _readyCallbacks: [],

        // --- INIT ---
        init() {
            if (typeof supabase === 'undefined' || !supabase.createClient) {
                console.warn('Supabase JS not loaded — auth disabled');
                return;
            }
            this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

            this.supabase.auth.onAuthStateChange((event, session) => {
                const prevUser = this.user;
                this.user = session?.user || null;
                this.updateAuthUI();

                if (event === 'SIGNED_IN' && this.user) {
                    this._handleSignIn();
                } else if (event === 'SIGNED_OUT') {
                    this.profile = null;
                    this._notifyReady();
                    if (typeof window._onAuthChange === 'function') window._onAuthChange(null);
                }
            });

            // Check existing session
            this.supabase.auth.getSession().then(({ data: { session } }) => {
                this.user = session?.user || null;
                this.updateAuthUI();
                if (this.user) {
                    this._handleSignIn();
                } else {
                    this._notifyReady();
                }
            });
        },

        async _handleSignIn() {
            await this.getProfile();
            if (!this.profile) {
                this.showUsernamePrompt();
            } else {
                await this._syncDiscordUsername();
                this._notifyReady();
                if (typeof window._onAuthChange === 'function') window._onAuthChange(this.user);
            }
        },

        onReady(fn) {
            if (this._ready) fn();
            else this._readyCallbacks.push(fn);
        },

        _notifyReady() {
            this._ready = true;
            this._readyCallbacks.forEach(fn => fn());
            this._readyCallbacks = [];
        },

        // --- ITEM MAPS ---
        buildItemMaps() {
            if (!window.FTFData?.allItems?.length) return;
            window.FTFData.buildItemMaps();
            this.itemIdMap = window.FTFData._itemIdMap;
            this.itemNameMap = window.FTFData._itemNameMap;
        },

        // --- AUTH ACTIONS ---
        async signInWithDiscord() {
            if (!this.supabase) return;
            const redirectTo = window.location.href.split('#')[0].split('?')[0];
            const { error } = await this.supabase.auth.signInWithOAuth({
                provider: 'discord',
                options: { redirectTo }
            });
            if (error) console.error('Discord sign-in error:', error.message);
        },

        async signOut() {
            if (!this.supabase) return;
            const { error } = await this.supabase.auth.signOut();
            if (error) console.error('Sign out error:', error.message);
            this.user = null;
            this.profile = null;
            this.updateAuthUI();
        },

        // --- PROFILE ---
        async getProfile() {
            if (!this.supabase || !this.user) return null;
            const { data, error } = await this.supabase
                .from('profiles')
                .select('username, discord_username, created_at')
                .eq('id', this.user.id)
                .single();
            if (error && error.code !== 'PGRST116') {
                console.error('Get profile error:', error.message);
            }
            this.profile = data || null;
            this.updateAuthUI();
            return this.profile;
        },

        async createProfile(username) {
            if (!this.supabase || !this.user) return { error: 'Not authenticated' };
            const discordName = this._getDiscordUsername();
            const { data, error } = await this.supabase
                .from('profiles')
                .insert({ id: this.user.id, username, discord_username: discordName })
                .select('username, discord_username, created_at')
                .single();
            if (error) {
                if (error.code === '23505') return { error: 'Username already taken' };
                return { error: error.message };
            }
            this.profile = data;
            this.updateAuthUI();
            this._notifyReady();
            if (typeof window._onAuthChange === 'function') window._onAuthChange(this.user);
            return { error: null };
        },

        _getDiscordUsername() {
            if (!this.user) return null;
            const meta = this.user.user_metadata || {};
            // Discord via Supabase: full_name = actual username (e.g. "zvarys")
            // custom_claims.global_name = display name (e.g. "Zarys") — NOT what we want
            return meta.full_name || meta.user_name || meta.preferred_username || null;
        },

        async _syncDiscordUsername() {
            if (!this.supabase || !this.user || !this.profile) return;
            const discordName = this._getDiscordUsername();
            if (discordName && discordName !== this.profile.discord_username) {
                await this.supabase
                    .from('profiles')
                    .update({ discord_username: discordName })
                    .eq('id', this.user.id);
                this.profile.discord_username = discordName;
            }
        },

        // --- INVENTORY CLOUD SYNC ---
        async saveInventoryToCloud(inventory) {
            if (!this.supabase || !this.user || !this.profile) return;
            if (Object.keys(this.itemIdMap).length === 0) this.buildItemMaps();

            clearTimeout(cloudSaveTimer);
            cloudSaveTimer = setTimeout(async () => {
                this._setSyncStatus('saving');
                try {
                    // Build new row map keyed by `${item_id}|${shg}`
                    const newRowMap = new Map();
                    for (const item of inventory) {
                        const itemId = this.itemIdMap[item.name];
                        if (!itemId) continue;
                        const shg = (item.shg || '').trim();
                        newRowMap.set(`${itemId}|${shg}`, {
                            user_id: this.user.id,
                            item_id: itemId,
                            qty: item.quantity || 1,
                            shg
                        });
                    }

                    const snapshot = this._cloudSnapshot || new Map();
                    const toUpsert = [];
                    const toDeleteKeys = [];

                    // Rows to upsert: new entries or changed quantity
                    for (const [key, row] of newRowMap) {
                        const prev = snapshot.get(key);
                        if (!prev || prev.qty !== row.qty) toUpsert.push(row);
                    }

                    // Rows to delete: present in snapshot but removed from inventory
                    for (const key of snapshot.keys()) {
                        if (!newRowMap.has(key)) toDeleteKeys.push(key);
                    }

                    // Nothing actually changed — skip
                    if (toUpsert.length === 0 && toDeleteKeys.length === 0) {
                        this._setSyncStatus('synced');
                        return;
                    }

                    // Upsert only changed/new rows
                    if (toUpsert.length > 0) {
                        const { error } = await this.supabase
                            .from('user_inventory')
                            .upsert(toUpsert, { onConflict: 'user_id,item_id,shg' });
                        if (error) throw error;
                    }

                    // Delete removed rows
                    if (newRowMap.size === 0) {
                        // Entire inventory cleared, single delete call
                        const { error } = await this.supabase
                            .from('user_inventory')
                            .delete()
                            .eq('user_id', this.user.id);
                        if (error) throw error;
                    } else {
                        for (const key of toDeleteKeys) {
                            const [item_id, shg] = key.split('|');
                            const { error } = await this.supabase
                                .from('user_inventory')
                                .delete()
                                .eq('user_id', this.user.id)
                                .eq('item_id', item_id)
                                .eq('shg', shg);
                            if (error) throw error;
                        }
                    }

                    // Update snapshot to reflect new cloud state
                    this._cloudSnapshot = new Map(
                        [...newRowMap.entries()].map(([k, r]) => [k, { qty: r.qty }])
                    );
                    this._setSyncStatus('synced');
                } catch (e) {
                    console.error('Cloud save error:', e.message);
                    this._setSyncStatus('error');
                }
            }, 800);
        },

        async loadInventoryFromCloud() {
            if (!this.supabase || !this.user || !this.profile) return null;
            if (Object.keys(this.itemNameMap).length === 0) this.buildItemMaps();

            try {
                const { data, error } = await this.supabase
                    .from('user_inventory')
                    .select('item_id, qty, shg')
                    .eq('user_id', this.user.id);

                if (error) throw error;
                if (!data || data.length === 0) {
                    this._cloudSnapshot = new Map();
                    return [];
                }

                // Seed snapshot from loaded cloud data so saves can diff against it
                this._cloudSnapshot = new Map(
                    data.map(row => {
                        const shg = (row.shg || '').trim();
                        return [`${row.item_id}|${shg}`, { qty: row.qty }];
                    })
                );

                return data
                    .map(row => {
                        const itemData = this.itemNameMap[row.item_id];
                        if (!itemData) return null;
                        return {
                            name: itemData.name,
                            rarity: itemData.rarity,
                            value: itemData.value,
                            baseValue: itemData.value,
                            stability: itemData.stability,
                            stabilityType: window.FTFData?.parseStabilityType(itemData.stability) || null,
                            shg: (row.shg && row.shg.trim()) ? row.shg.trim() : null,
                            quantity: row.qty
                        };
                    })
                    .filter(Boolean);
            } catch (e) {
                console.error('Cloud load error:', e.message);
                return null;
            }
        },

        // --- NOTE CLOUD SYNC ---
        async saveNoteToCloud(note) {
            if (!this.supabase || !this.user || !this.profile) return;
            clearTimeout(noteSaveTimer);
            noteSaveTimer = setTimeout(async () => {
                try {
                    const { error } = await this.supabase
                        .from('user_notes')
                        .upsert({ user_id: this.user.id, note: note || '' });
                    if (error) throw error;
                } catch (e) {
                    console.error('Note save error:', e.message);
                }
            }, 800);
        },

        async loadNoteFromCloud() {
            if (!this.supabase || !this.user || !this.profile) return null;
            try {
                const { data, error } = await this.supabase
                    .from('user_notes')
                    .select('note')
                    .eq('user_id', this.user.id)
                    .single();
                if (error && error.code !== 'PGRST116') throw error;
                return data?.note ?? null;
            } catch (e) {
                console.error('Note load error:', e.message);
                return null;
            }
        },

        // --- MIGRATION ---
        async migrateLocalStorage() {
            try {
                const saved = localStorage.getItem('ftf-inventory');
                if (!saved) return false;
                const local = JSON.parse(saved);
                if (!Array.isArray(local) || local.length === 0) return false;

                const cloud = await this.loadInventoryFromCloud();
                if (cloud && cloud.length > 0) return false;

                return local;
            } catch (e) {
                return false;
            }
        },

        // --- SYNC STATUS ---
        _setSyncStatus(status) {
            const el = document.getElementById('sync-status');
            if (!el) return;
            el.className = 'sync-status';
            switch (status) {
                case 'saving':
                    el.textContent = 'Saving…';
                    el.classList.add('sync-saving');
                    break;
                case 'synced':
                    el.textContent = 'Synced ✓';
                    el.classList.add('sync-done');
                    setTimeout(() => {
                        if (el.classList.contains('sync-done')) {
                            el.textContent = '';
                            el.className = 'sync-status';
                        }
                    }, 3000);
                    break;
                case 'error':
                    el.textContent = 'Sync failed';
                    el.classList.add('sync-error');
                    break;
                default:
                    el.textContent = '';
            }
        },

        // --- UI ---
        updateAuthUI() {
            const btn = document.getElementById('auth-btn');
            if (!btn) return;

            if (this.user && this.profile) {
                btn.innerHTML = `
                    <span class="auth-username">${this._escapeHtml(this.profile.username)}</span>
                    <svg class="auth-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 5 7 8 4"/></svg>`;
                btn.classList.add('logged-in');
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const dd = document.getElementById('auth-dropdown');
                    if (dd) dd.classList.toggle('is-visible');
                };
            } else {
                btn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span>Login</span>`;
                btn.classList.remove('logged-in');
                btn.onclick = () => this.signInWithDiscord();
            }
            // Remove loading state after content is set
            btn.classList.remove('auth-loading');
        },

        showUsernamePrompt() {
            if (document.getElementById('username-modal')) return;

            const overlay = document.createElement('div');
            overlay.id = 'username-modal';
            overlay.className = 'username-modal-overlay';
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

            const input = document.getElementById('username-input');
            const submit = document.getElementById('username-submit');
            const errorEl = document.getElementById('username-error');

            const validate = (val) => {
                if (val.length < 3) return 'At least 3 characters';
                if (val.length > 20) return 'Max 20 characters';
                if (!/^[a-zA-Z0-9_]+$/.test(val)) return 'Letters, numbers, underscores only';
                return null;
            };

            input.addEventListener('input', () => {
                const err = validate(input.value);
                errorEl.textContent = err || '';
                submit.disabled = !!err;
            });

            submit.addEventListener('click', async () => {
                const val = input.value.trim();
                const err = validate(val);
                if (err) { errorEl.textContent = err; return; }

                submit.disabled = true;
                submit.textContent = 'Creating…';
                const result = await this.createProfile(val);
                if (result.error) {
                    errorEl.textContent = result.error;
                    submit.disabled = false;
                    submit.textContent = 'Create Account';
                } else {
                    overlay.remove();
                    this._checkMigration();
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !submit.disabled) submit.click();
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
            if (document.getElementById('migration-modal')) return;

            const overlay = document.createElement('div');
            overlay.id = 'migration-modal';
            overlay.className = 'username-modal-overlay';
            overlay.innerHTML = `
                <div class="username-modal-card">
                    <h3>Import Local Inventory?</h3>
                    <p>We found <strong>${localData.length}</strong> item${localData.length !== 1 ? 's' : ''} in your browser's local storage. Would you like to upload them to your account?</p>
                    <div class="username-modal-actions">
                        <button id="migration-skip" class="inv-btn-secondary">Start Fresh</button>
                        <button id="migration-upload" class="inv-btn-primary">Upload</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            document.getElementById('migration-skip').addEventListener('click', () => {
                overlay.remove();
                if (typeof window._onAuthChange === 'function') window._onAuthChange(this.user);
            });

            document.getElementById('migration-upload').addEventListener('click', async () => {
                const btn = document.getElementById('migration-upload');
                btn.disabled = true;
                btn.textContent = 'Uploading…';
                if (Object.keys(this.itemIdMap).length === 0) this.buildItemMaps();
                await this.saveInventoryToCloud(localData);

                const savedNote = localStorage.getItem('ftf-inv-note');
                if (savedNote) await this.saveNoteToCloud(savedNote);

                overlay.remove();
                if (typeof window._onAuthChange === 'function') window._onAuthChange(this.user);
            });
        },

        _escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.FTFAuth.init());
    } else {
        window.FTFAuth.init();
    }
})();
