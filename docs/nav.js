(function () {
    const isGuide = location.pathname.includes('guide.html');
    const isInventory = location.pathname.includes('inventory.html');

    // ---- Inject site header (Landmark: <header>) ----
    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
        <button class="hamburger-btn" id="hamburger-btn" aria-label="Open navigation menu" aria-expanded="false">
            <span></span><span></span><span></span>
        </button>
        <h1 class="site-title">Zarys's FTF Calculator</h1>
        <div class="header-right">
            <button id="auth-btn" class="auth-btn auth-loading" aria-label="Login">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>Login</span>
            </button>
            <div class="auth-dropdown" id="auth-dropdown">
                <button class="auth-dropdown-item" id="auth-signout">Sign Out</button>
            </div>
            <button id="theme-toggle" class="theme-toggle-icon" title="Toggle Dark Theme" aria-label="Toggle dark mode">
                <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
                <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            </button>
        </div>`;

    // ---- Inject nav drawer overlay ----
    const overlay = document.createElement('div');
    overlay.className = 'nav-drawer-overlay';
    overlay.id = 'nav-overlay';

    // ---- Inject nav drawer (Landmark: <nav>) ----
    const nav = document.createElement('nav');
    nav.className = 'nav-drawer';
    nav.id = 'nav-drawer';
    nav.setAttribute('aria-hidden', 'true');
    nav.style.visibility = 'hidden';
    nav.style.pointerEvents = 'none';

    nav.innerHTML = `
        <div class="nav-drawer-header">Menu</div>
        <a href="./" class="nav-drawer-link${!isGuide && !isInventory ? ' active' : ''}">Trade Calculator</a>
        <a href="inventory.html" class="nav-drawer-link${isInventory ? ' active' : ''}">Inventory</a>
        <a href="guide.html" class="nav-drawer-link${isGuide ? ' active' : ''}">Use Guide</a>`;
    const body = document.body;
    body.insertBefore(nav, body.firstChild);
    body.insertBefore(overlay, body.firstChild);
    body.insertBefore(header, body.firstChild);

    const hamburgerBtn = document.getElementById('hamburger-btn');
    const navDrawer = document.getElementById('nav-drawer');
    const navOverlay = document.getElementById('nav-overlay');

    function openDrawer() {
        hamburgerBtn.classList.add('is-open');
        hamburgerBtn.setAttribute('aria-expanded', 'true');
        navDrawer.classList.add('is-open');
        navDrawer.setAttribute('aria-hidden', 'false');
        navDrawer.style.visibility = 'visible';
        navDrawer.style.pointerEvents = 'auto';
        navOverlay.classList.add('is-visible');
        document.body.classList.add('drawer-open');
    }

    function closeDrawer() {
        hamburgerBtn.classList.remove('is-open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        navDrawer.classList.remove('is-open');
        navDrawer.setAttribute('aria-hidden', 'true');
        navDrawer.style.visibility = 'hidden';
        navDrawer.style.pointerEvents = 'none';
        navOverlay.classList.remove('is-visible');
        document.body.classList.remove('drawer-open');
    }

    hamburgerBtn.addEventListener('click', () => {
        hamburgerBtn.classList.contains('is-open') ? closeDrawer() : openDrawer();
    });
    navOverlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDrawer();
    });

    // Theme logic stays same
    const themeToggleBtn = document.getElementById('theme-toggle');
    const htmlEl = document.documentElement;

    function syncThemeIcon() {
        if (htmlEl.classList.contains('dark-theme')) {
            themeToggleBtn.classList.add('is-dark');
        } else {
            themeToggleBtn.classList.remove('is-dark');
        }
    }
    syncThemeIcon();

    themeToggleBtn.addEventListener('click', () => {
        const isDark = htmlEl.classList.toggle('dark-theme');
        if (isDark) {
            localStorage.removeItem('theme');
        } else {
            localStorage.setItem('theme', 'light');
        }
        syncThemeIcon();
    });

    // --- Auth dropdown ---
    const authSignout = document.getElementById('auth-signout');
    const authDropdown = document.getElementById('auth-dropdown');

    if (authSignout) {
        authSignout.addEventListener('click', () => {
            if (window.FTFAuth) window.FTFAuth.signOut();
            if (authDropdown) authDropdown.classList.remove('is-visible');
        });
    }

    document.addEventListener('click', (e) => {
        if (authDropdown && !authDropdown.contains(e.target) && e.target.id !== 'auth-btn' && !e.target.closest('#auth-btn')) {
            authDropdown.classList.remove('is-visible');
        }
    });
})();