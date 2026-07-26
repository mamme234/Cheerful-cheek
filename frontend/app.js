// ==================== CONFIGURATION ====================
const BACKEND_URL = 'https://cheerful-cheek.onrender.com/api';
const ADMIN_PAYPAL_EMAIL = 'lenabotrel65@outlook.com';

// ==================== STATE ====================
let tg = null;
let userId = null;
let allMedia = [];
let currentFilter = 'all';
let currentSearch = '';
let currentModalMedia = null;
let isInitialized = false;
let userData = {};
let selectedScreenshot = null;
let pendingMediaId = null;
let refreshInterval = null;
let isTelegramWebApp = false;

// ==================== CACHE HELPERS ====================
function saveToCache(key, data) {
    try {
        localStorage.setItem(`premium_gallery_${key}`, JSON.stringify(data));
    } catch (e) { console.warn('Cache save failed:', e); }
}

function getFromCache(key) {
    try {
        const data = localStorage.getItem(`premium_gallery_${key}`);
        return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
}

function savePurchasesToCache(purchases) {
    saveToCache('purchases', purchases);
}

function getPurchasesFromCache() {
    return getFromCache('purchases') || [];
}

function saveGalleryToCache(media) {
    saveToCache('gallery', media);
}

function getGalleryFromCache() {
    return getFromCache('gallery') || [];
}

function saveUserToCache(user) {
    saveToCache('user', user);
}

function getUserFromCache() {
    return getFromCache('user');
}

// ==================== INITIALIZATION ====================
function init() {
    if (isInitialized) return;
    isInitialized = true;
    
    console.log('🔍 Initializing Premium Gallery...');
    
    // Check for Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        isTelegramWebApp = true;
        tg.ready();
        tg.expand();
        
        const user = tg.initDataUnsafe?.user;
        console.log('📱 Telegram user data:', user);
        
        if (user) {
            userId = String(user.id);
            userData = {
                id: userId,
                name: user.first_name || 'User',
                lastName: user.last_name || '',
                username: user.username || '',
                photoUrl: user.photo_url || null,
                languageCode: user.language_code || 'en',
                isPremium: user.is_premium || false
            };
            saveUserToCache(userData);
            console.log('✅ Telegram user loaded:', userData);
            completeInit();
            return;
        }
    }
    
    // Fallback: Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const userIdParam = urlParams.get('userId');
    const nameParam = urlParams.get('name');
    const usernameParam = urlParams.get('username');
    const photoParam = urlParams.get('photo');
    
    if (userIdParam) {
        userId = userIdParam;
        userData = {
            id: userId,
            name: nameParam || 'User',
            lastName: '',
            username: usernameParam || 'user',
            photoUrl: photoParam || null,
            languageCode: 'en',
            isPremium: false
        };
        saveUserToCache(userData);
        console.log('✅ User from URL params:', userData);
        completeInit();
        return;
    }
    
    // Try loading from cache
    const cachedUser = getUserFromCache();
    if (cachedUser) {
        userData = cachedUser;
        userId = cachedUser.id;
        console.log('✅ User loaded from cache:', userData);
        completeInit();
        return;
    }
    
    // Last resort: create a guest user
    userId = 'guest_' + Date.now();
    userData = {
        id: userId,
        name: 'Guest',
        lastName: '',
        username: 'guest',
        photoUrl: null,
        languageCode: 'en',
        isPremium: false
    };
    saveUserToCache(userData);
    console.log('⚠️ Using guest user:', userData);
    completeInit();
}

function completeInit() {
    updateProfileUI();
    setupEventListeners();
    loadApp();
    
    // Auto-refresh every 30 seconds
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        if (document.getElementById('gallerySection')?.classList.contains('active')) {
            refreshData();
        }
    }, 30000);
    
    console.log('✅ App initialized successfully');
}

// ==================== UPDATE PROFILE UI ====================
function updateProfileUI() {
    const fullName = userData.lastName ? 
        `${userData.name} ${userData.lastName}` : 
        userData.name;
    
    const avatar = document.getElementById('profileAvatar');
    const nameEl = document.getElementById('profileName');
    const usernameEl = document.getElementById('profileUsername');
    const userBtn = document.getElementById('userAvatar');
    
    nameEl.textContent = fullName || 'User';
    usernameEl.textContent = userData.username ? `@${userData.username}` : '@user';
    
    // Update avatar
    if (userData.photoUrl && userData.photoUrl.startsWith('http')) {
        avatar.style.backgroundImage = `url(${userData.photoUrl})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
        avatar.textContent = '';
        
        userBtn.style.backgroundImage = `url(${userData.photoUrl})`;
        userBtn.style.backgroundSize = 'cover';
        userBtn.style.backgroundPosition = 'center';
        userBtn.textContent = '';
    } else {
        avatar.style.backgroundImage = 'none';
        avatar.style.background = 'linear-gradient(135deg, var(--tg-primary), #ff6b6b)';
        avatar.textContent = (userData.name || 'U').charAt(0).toUpperCase();
        
        userBtn.style.backgroundImage = 'none';
        userBtn.style.background = 'var(--tg-border)';
        userBtn.textContent = (userData.name || 'U').charAt(0).toUpperCase();
    }
    
    if (userData.isPremium) {
        usernameEl.innerHTML = `@${userData.username} ⭐ Premium`;
    }
    
    document.getElementById('profilePaypalEmail').textContent = ADMIN_PAYPAL_EMAIL;
    document.getElementById('modalPaypalEmail').textContent = ADMIN_PAYPAL_EMAIL;
    document.getElementById('screenshotPaypalEmail').textContent = ADMIN_PAYPAL_EMAIL;
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (tg) tg.close();
            else window.close();
        });
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.toLowerCase().trim();
            applyFilters();
        });
    }
    
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            applyFilters();
        });
    });
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            
            const tab = this.dataset.tab;
            
            if (tab === 'profile') {
                document.getElementById('gallerySection').classList.remove('active');
                document.getElementById('profileSection').classList.add('active');
                document.getElementById('pageTitle').textContent = 'Profile';
                document.getElementById('statsBanner').style.display = 'none';
                const searchFilter = document.querySelector('.search-filter');
                if (searchFilter) searchFilter.style.display = 'none';
                loadProfileData();
            } else {
                document.getElementById('gallerySection').classList.add('active');
                document.getElementById('profileSection').classList.remove('active');
                document.getElementById('pageTitle').textContent = 'Premium Gallery';
                document.getElementById('statsBanner').style.display = 'flex';
                const searchFilter = document.querySelector('.search-filter');
                if (searchFilter) searchFilter.style.display = 'block';
                refreshData();
            }
        });
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeViewModal();
            closePurchaseModal();
            closeScreenshotModal();
        }
    });
    
    document.getElementById('purchaseModal')?.addEventListener('click', function(e) {
        if (e.target === this) closePurchaseModal();
    });
    
    document.getElementById('screenshotModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeScreenshotModal();
    });
    
    document.getElementById('viewModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeViewModal();
    });
    
    const screenshotInput = document.getElementById('screenshotInput');
    if (screenshotInput) {
        screenshotInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                selectedScreenshot = file;
                const reader = new FileReader();
                reader.onload = function(event) {
                    document.getElementById('screenshotImage').src = event.target.result;
                    document.getElementById('screenshotPreview').style.display = 'block';
                    document.getElementById('screenshotFileName').textContent = file.name;
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    if (tg) {
        tg.onEvent('backButtonClicked', () => {
            if (document.getElementById('viewModal').style.display === 'flex') {
                closeViewModal();
            } else if (document.getElementById('screenshotModal').style.display === 'flex') {
                closeScreenshotModal();
            } else if (document.getElementById('purchaseModal').style.display === 'flex') {
                closePurchaseModal();
            } else {
                tg.close();
            }
        });
    }
}

// ==================== REFRESH DATA ====================
async function refreshData() {
    try {
        await loadMedia();
        await updateStats();
        await loadProfileData();
    } catch (error) {
        console.error('Refresh error:', error);
    }
}

// ==================== LOAD APP ====================
async function loadApp() {
    showLoading(true);
    try {
        // Try loading from cache first for instant display
        const cachedGallery = getGalleryFromCache();
        if (cachedGallery && cachedGallery.length > 0) {
            allMedia = cachedGallery;
            renderGallery(allMedia);
            console.log('📸 Loaded from cache:', cachedGallery.length, 'items');
        }
        
        await loadMedia();
        await updateStats();
        await loadProfileData();
    } catch (error) {
        console.error('Error loading app:', error);
        const cached = getGalleryFromCache();
        if (cached && cached.length > 0) {
            allMedia = cached;
            renderGallery(allMedia);
            showToast('Using cached content', 'info');
        } else {
            showToast('Failed to load content', 'error');
        }
    } finally {
        showLoading(false);
    }
}

// ==================== LOAD MEDIA ====================
async function loadMedia() {
    try {
        const response = await fetch(`${BACKEND_URL}/media?userId=${encodeURIComponent(userId)}`, {
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        const result = await response.json();
        
        if (result.success) {
            allMedia = result.data || [];
            // Cache the gallery
            saveGalleryToCache(allMedia);
            console.log('📸 Media loaded:', allMedia.length, 'items');
            renderGallery(allMedia);
            
            // Merge with cached purchases if needed
            const cachedPurchases = getPurchasesFromCache();
            if (cachedPurchases && cachedPurchases.length > 0) {
                allMedia = allMedia.map(item => ({
                    ...item,
                    isPurchased: cachedPurchases.includes(item.id) || item.isPurchased
                }));
                renderGallery(allMedia);
            }
        } else {
            console.error('❌ API returned error:', result);
            // Use cache
            const cached = getGalleryFromCache();
            if (cached.length > 0) {
                allMedia = cached;
                renderGallery(allMedia);
            }
            showToast('Failed to load media', 'error');
        }
    } catch (error) {
        console.error('Load media error:', error);
        // Use cache
        const cached = getGalleryFromCache();
        if (cached.length > 0) {
            allMedia = cached;
            renderGallery(allMedia);
            showToast('Using cached data', 'info');
        } else {
            throw error;
        }
    }
}

// ==================== UPDATE STATS ====================
async function updateStats() {
    try {
        const purchaseRes = await fetch(`${BACKEND_URL}/my-purchases/${encodeURIComponent(userId)}`);
        const purchaseData = await purchaseRes.json();
        if (purchaseData.success) {
            document.getElementById('purchaseCount').textContent = purchaseData.count || 0;
            document.getElementById('navBadge').textContent = purchaseData.count || 0;
            // Update cache
            const purchasedIds = (purchaseData.data || []).map(m => m.id);
            savePurchasesToCache(purchasedIds);
        }
        
        const pendingRes = await fetch(`${BACKEND_URL}/my-pending/${encodeURIComponent(userId)}`);
        const pendingData = await pendingRes.json();
        if (pendingData.success) {
            document.getElementById('pendingCount').textContent = pendingData.count || 0;
        }
        
        document.getElementById('mediaCount').textContent = allMedia.length || 0;
    } catch (error) {
        console.error('Stats error:', error);
        // Use cached stats
        const cachedPurchases = getPurchasesFromCache();
        if (cachedPurchases) {
            document.getElementById('purchaseCount').textContent = cachedPurchases.length || 0;
            document.getElementById('navBadge').textContent = cachedPurchases.length || 0;
        }
    }
}

// ==================== LOAD PROFILE DATA ====================
async function loadProfileData() {
    try {
        const purchaseRes = await fetch(`${BACKEND_URL}/my-purchases/${encodeURIComponent(userId)}`);
        const purchaseData = await purchaseRes.json();
        
        const pendingRes = await fetch(`${BACKEND_URL}/my-pending/${encodeURIComponent(userId)}`);
        const pendingData = await pendingRes.json();
        
        const totalMedia = allMedia.length || 0;
        const purchasedCount = purchaseData.success ? purchaseData.count : 0;
        const pendingCount = pendingData.success ? pendingData.count : 0;
        
        document.getElementById('profileTotalMedia').textContent = totalMedia;
        document.getElementById('profilePurchased').textContent = purchasedCount;
        document.getElementById('profilePending').textContent = pendingCount;
        
        renderPurchaseHistory(purchaseData.success ? purchaseData.data : []);
        
    } catch (error) {
        console.error('Profile data error:', error);
    }
}

// ==================== RENDER FUNCTIONS ====================
function renderPurchaseHistory(purchases) {
    const container = document.getElementById('purchaseHistoryList');
    
    if (!purchases || purchases.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:20px; color:var(--tg-text-secondary);">
                🛒 No purchases yet
            </div>
        `;
        return;
    }
    
    container.innerHTML = purchases.map(item => `
        <div class="purchase-item">
            <div class="item-icon">${item.type === 'video' ? '🎬' : '📷'}</div>
            <div class="item-details">
                <div class="item-title">${item.title || 'Untitled'}</div>
                <div class="item-meta">${item.description || 'No description'}</div>
            </div>
            <div class="item-price">$${item.price || 0}</div>
            <span class="item-status approved">✅ Approved</span>
        </div>
    `).join('');
}

function renderGallery(media) {
    const grid = document.getElementById('mediaGrid');
    
    if (!media || media.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No Content Available</h3>
                <p>Check back later for new uploads</p>
                <p style="font-size:12px; color:var(--tg-text-muted); margin-top:8px;">
                    💡 Admin: Upload content using /upload
                </p>
            </div>
        `;
        return;
    }
    
    console.log('🎨 Rendering gallery with', media.length, 'items');
    
    grid.innerHTML = media.map((item, index) => {
        const isPurchased = item.isPurchased || false;
        const isPending = item.isPending || false;
        const isFree = item.isFree || false;
        
        let badgeHTML = '';
        let actionsHTML = '';
        let previewContent = '';
        
        const shouldShowContent = isPurchased || isFree;
        
        if (shouldShowContent) {
            if (isFree && !isPurchased) {
                badgeHTML = `<div class="badge badge-free">🎉 FREE</div>`;
            } else {
                badgeHTML = `<div class="badge badge-purchased">✅ Owned</div>`;
            }
            
            actionsHTML = `
                <button class="btn-action btn-view" onclick="event.stopPropagation(); viewMedia('${item.id}')">
                    👁️ View
                </button>
            `;
            
            if (item.type === 'video') {
                previewContent = `
                    <video muted preload="metadata" playsinline style="width:100%; height:100%; object-fit:cover;">
                        <source src="${item.fileUrl}" type="video/mp4">
                    </video>
                `;
            } else {
                previewContent = `
                    <img src="${item.fileUrl}" alt="${item.title}" loading="lazy" style="width:100%; height:100%; object-fit:cover;" />
                `;
            }
            
        } else if (isPending) {
            badgeHTML = `<div class="badge badge-pending">⏳ Pending</div>`;
            actionsHTML = `
                <button class="btn-action btn-pending" disabled>
                    ⏳ Waiting
                </button>
            `;
            previewContent = `
                <div class="locked-content">
                    <span class="lock-icon">🔒</span>
                    <span class="lock-text">Pending Approval</span>
                    <span class="lock-price">$${item.price || 5.00}</span>
                </div>
            `;
            
        } else {
            const priceText = `$${item.price || 5.00}`;
            badgeHTML = `<div class="badge badge-price">${priceText}</div>`;
            actionsHTML = `
                <button class="btn-action btn-buy" onclick="openPurchaseModal('${item.id}')">
                    💰 Buy
                </button>
            `;
            previewContent = `
                <div class="locked-content">
                    <span class="lock-icon">🔒</span>
                    <span class="lock-text">Premium Content</span>
                    <span class="lock-price">${priceText}</span>
                </div>
            `;
        }
        
        return `
            <div class="media-card" style="animation-delay: ${index * 0.05}s" data-id="${item.id}">
                <div class="media-wrapper">
                    ${previewContent}
                    ${badgeHTML}
                </div>
                <div class="media-info">
                    <div class="media-title">${item.title || 'Untitled'}</div>
                    <div class="media-subtitle">${item.description || 'No description'}</div>
                    <div class="media-actions">
                        ${actionsHTML}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== FILTERS ====================
function applyFilters() {
    let filtered = [...allMedia];
    
    if (currentSearch) {
        filtered = filtered.filter(m => 
            (m.title || '').toLowerCase().includes(currentSearch) ||
            (m.description || '').toLowerCase().includes(currentSearch)
        );
    }
    
    if (currentFilter === 'photo') {
        filtered = filtered.filter(m => m.type === 'photo');
    } else if (currentFilter === 'video') {
        filtered = filtered.filter(m => m.type === 'video');
    } else if (currentFilter === 'purchased') {
        filtered = filtered.filter(m => m.isPurchased);
    } else if (currentFilter === 'pending') {
        filtered = filtered.filter(m => m.isPending);
    }
    
    renderGallery(filtered);
}

// ==================== PURCHASE MODAL ====================
function openPurchaseModal(mediaId) {
    console.log('💰 Opening purchase modal for:', mediaId);
    
    const media = allMedia.find(m => m.id === mediaId);
    if (!media) {
        showToast('Content not found', 'error');
        return;
    }
    
    if (media.isFree) {
        showToast('🎉 This content is FREE! Enjoy!', 'success');
        viewMedia(mediaId);
        return;
    }
    
    currentModalMedia = media;
    pendingMediaId = mediaId;
    
    fetch(`${BACKEND_URL}/pending-status/${encodeURIComponent(userId)}/${mediaId}`)
        .then(res => res.json())
        .then(result => {
            if (result.isPending) {
                showToast('⏳ Already pending approval', 'pending');
                return;
            }
            
            document.getElementById('modalTitle').textContent = media.title || 'Untitled';
            document.getElementById('modalDescription').textContent = media.description || 'No description';
            document.getElementById('modalPrice').textContent = (media.price || 5.00).toFixed(2);
            document.getElementById('modalPaypalEmail').textContent = ADMIN_PAYPAL_EMAIL;
            document.getElementById('modalLockPrice').textContent = '$' + (media.price || 5.00).toFixed(2);
            
            document.getElementById('purchaseModal').style.display = 'flex';
            document.body.style.overflow = 'hidden';
        })
        .catch(error => {
            console.error('Pending check error:', error);
            document.getElementById('modalTitle').textContent = media.title || 'Untitled';
            document.getElementById('modalDescription').textContent = media.description || 'No description';
            document.getElementById('modalPrice').textContent = (media.price || 5.00).toFixed(2);
            document.getElementById('modalPaypalEmail').textContent = ADMIN_PAYPAL_EMAIL;
            document.getElementById('purchaseModal').style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
}

function closePurchaseModal() {
    document.getElementById('purchaseModal').style.display = 'none';
    document.body.style.overflow = '';
}

// ==================== SCREENSHOT UPLOAD ====================
function openScreenshotUpload() {
    console.log('📸 Opening screenshot upload');
    closePurchaseModal();
    document.getElementById('screenshotPaypalEmail').textContent = ADMIN_PAYPAL_EMAIL;
    document.getElementById('screenshotModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeScreenshotModal() {
    document.getElementById('screenshotModal').style.display = 'none';
    document.body.style.overflow = '';
    selectedScreenshot = null;
    document.getElementById('screenshotInput').value = '';
    document.getElementById('screenshotPreview').style.display = 'none';
}

// ==================== SUBMIT SCREENSHOT ====================
async function submitScreenshot() {
    console.log('📤 Submitting screenshot');
    
    if (!selectedScreenshot) {
        showToast('Please select a screenshot first', 'error');
        return;
    }
    
    if (!pendingMediaId) {
        showToast('Error: No media selected', 'error');
        return;
    }
    
    const btn = document.querySelector('.btn-submit');
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Uploading...';
        
        const reader = new FileReader();
        const base64 = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(selectedScreenshot);
        });
        
        const response = await fetch(`${BACKEND_URL}/request-purchase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                mediaId: pendingMediaId,
                screenshot: base64,
                filename: selectedScreenshot.name
            })
        });
        
        const result = await response.json();
        console.log('📤 Submit result:', result);
        
        if (result.success) {
            // Update cache
            const cachedPurchases = getPurchasesFromCache() || [];
            if (!cachedPurchases.includes(pendingMediaId)) {
                cachedPurchases.push(pendingMediaId);
                savePurchasesToCache(cachedPurchases);
            }
            
            // Update local media state
            const mediaItem = allMedia.find(m => m.id === pendingMediaId);
            if (mediaItem) {
                mediaItem.isPurchased = true;
                mediaItem.isPending = false;
                saveGalleryToCache(allMedia);
            }
            
            closeScreenshotModal();
            showToast('✅ Screenshot sent! Waiting for admin approval.', 'success');
            setTimeout(() => refreshData(), 2000);
        } else {
            showToast(result.error || 'Failed to submit screenshot', 'error');
        }
    } catch (error) {
        console.error('Submit screenshot error:', error);
        showToast('Network error. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>📤</span> Submit for Approval';
    }
}

// ==================== VIEW MEDIA ====================
async function viewMedia(mediaId) {
    console.log('👁️ Viewing media:', mediaId);
    
    try {
        const response = await fetch(`${BACKEND_URL}/media/${mediaId}?userId=${encodeURIComponent(userId)}`);
        const result = await response.json();
        
        if (!result.success) {
            showToast('Failed to load content', 'error');
            return;
        }
        
        const media = result.data;
        
        if (media.isFree && !media.isPurchased) {
            const autoPurchase = await fetch(`${BACKEND_URL}/auto-purchase-free`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId, mediaId: mediaId })
            });
            const autoResult = await autoPurchase.json();
            if (autoResult.success) {
                // Update cache
                const cachedPurchases = getPurchasesFromCache() || [];
                if (!cachedPurchases.includes(mediaId)) {
                    cachedPurchases.push(mediaId);
                    savePurchasesToCache(cachedPurchases);
                }
                await refreshData();
            }
        }
        
        if (!media.isPurchased && !media.isFree) {
            showToast('🔒 Purchase this content to view', 'error');
            return;
        }
        
        const content = document.getElementById('viewContent');
        if (media.type === 'video') {
            content.innerHTML = `
                <video controls autoplay playsinline style="max-width:100%; max-height:70vh; border-radius:8px;">
                    <source src="${media.fileUrl}" type="video/mp4">
                    Your browser does not support videos.
                </video>
            `;
        } else {
            content.innerHTML = `
                <img src="${media.fileUrl}" alt="${media.title}" style="max-width:100%; max-height:70vh; border-radius:8px;">
            `;
        }
        
        document.getElementById('viewTitle').textContent = media.title || 'Content';
        document.getElementById('viewCaption').textContent = media.description || '';
        document.getElementById('viewDate').textContent = new Date(media.date).toLocaleDateString();
        
        document.getElementById('viewModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        console.error('View error:', error);
        showToast('Failed to view content', 'error');
    }
}

function closeViewModal() {
    document.getElementById('viewModal').style.display = 'none';
    document.body.style.overflow = '';
    const video = document.querySelector('#viewContent video');
    if (video) video.pause();
}

// ==================== TOAST ====================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');
    
    const icons = { success: '✅', error: '❌', pending: '⏳', info: '📢' };
    icon.textContent = icons[type] || '📢';
    msg.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'flex';
    
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}

// ==================== LOADING ====================
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', init);

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isInitialized) {
        refreshData();
    }
});

// ==================== EXPOSE GLOBALLY ====================
window.openPurchaseModal = openPurchaseModal;
window.closePurchaseModal = closePurchaseModal;
window.openScreenshotUpload = openScreenshotUpload;
window.closeScreenshotModal = closeScreenshotModal;
window.submitScreenshot = submitScreenshot;
window.viewMedia = viewMedia;
window.closeViewModal = closeViewModal;
