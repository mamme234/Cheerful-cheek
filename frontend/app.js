// ==================== CONFIGURATION ====================
const BACKEND_URL = 'https://cheerful-cheek.onrender.com';

// ==================== STATE ====================
let tg = window.Telegram?.WebApp;
let userId = null;
let allMedia = [];
let currentFilter = 'all';
let currentSearch = '';
let currentModalMedia = null;
let isInitialized = false;
let userData = {};

// ==================== INITIALIZATION ====================
function init() {
    if (isInitialized) return;
    isInitialized = true;
    
    if (tg) {
        tg.ready();
        tg.expand();
        const user = tg.initDataUnsafe?.user;
        if (user) {
            userId = user.id;
            userData = {
                name: user.first_name || 'User',
                username: user.username || 'user',
                id: user.id
            };
            updateProfileUI();
        }
    } else {
        userId = 'test_user_' + Date.now();
        userData = {
            name: 'Test User',
            username: 'testuser',
            id: userId
        };
        updateProfileUI();
    }
    
    console.log('✅ Mini App initialized');
    console.log('📡 Backend:', BACKEND_URL);
    console.log('👤 User:', userId);
    
    setupEventListeners();
    loadApp();
}

// ==================== UPDATE PROFILE UI ====================
function updateProfileUI() {
    document.getElementById('profileAvatar').textContent = userData.name.charAt(0).toUpperCase();
    document.getElementById('profileName').textContent = userData.name;
    document.getElementById('profileUsername').textContent = '@' + userData.username;
    document.getElementById('userAvatar').textContent = userData.name.charAt(0).toUpperCase();
    document.getElementById('profilePaypalEmail').textContent = window.ADMIN_PAYPAL_EMAIL || 'admin@paypal.com';
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Back button
    document.getElementById('backBtn')?.addEventListener('click', () => {
        if (tg) tg.close();
        else window.close();
    });
    
    // Search
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase().trim();
        applyFilters();
    });
    
    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            applyFilters();
        });
    });
    
    // Bottom navigation - Switch between Gallery and Profile
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            
            const tab = this.dataset.tab;
            
            if (tab === 'profile') {
                // Show profile, hide gallery
                document.getElementById('gallerySection').classList.remove('active');
                document.getElementById('profileSection').classList.add('active');
                document.getElementById('pageTitle').textContent = 'Profile';
                document.getElementById('statsBanner').style.display = 'none';
                document.getElementById('searchInput').parentElement.parentElement.style.display = 'none';
                loadProfileData();
            } else {
                // Show gallery, hide profile
                document.getElementById('gallerySection').classList.add('active');
                document.getElementById('profileSection').classList.remove('active');
                document.getElementById('pageTitle').textContent = 'Premium Gallery';
                document.getElementById('statsBanner').style.display = 'flex';
                document.getElementById('searchInput').parentElement.parentElement.style.display = 'flex';
                // Reset filters if needed
            }
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeViewModal();
            closePurchaseModal();
        }
    });
    
    // Click outside modals
    document.getElementById('purchaseModal')?.addEventListener('click', function(e) {
        if (e.target === this) closePurchaseModal();
    });
    
    document.getElementById('viewModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeViewModal();
    });
    
    // Telegram back button
    if (tg) {
        tg.onEvent('backButtonClicked', () => {
            if (document.getElementById('viewModal').style.display === 'flex') {
                closeViewModal();
            } else if (document.getElementById('purchaseModal').style.display === 'flex') {
                closePurchaseModal();
            } else {
                tg.close();
            }
        });
    }
}

// ==================== LOAD DATA ====================
async function loadApp() {
    showLoading(true);
    try {
        await loadMedia();
        await updateStats();
        await loadProfileData();
    } catch (error) {
        console.error('Error loading app:', error);
        showToast('Failed to load content', 'error');
    } finally {
        showLoading(false);
    }
}

async function loadMedia() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/media?userId=${userId}`);
        const result = await response.json();
        
        if (result.success) {
            allMedia = result.data || [];
            renderGallery(allMedia);
        } else {
            throw new Error(result.error || 'Failed to load media');
        }
    } catch (error) {
        console.error('Load media error:', error);
        throw error;
    }
}

async function updateStats() {
    try {
        // Get purchases
        const purchaseRes = await fetch(`${BACKEND_URL}/api/my-purchases/${userId}`);
        const purchaseData = await purchaseRes.json();
        if (purchaseData.success) {
            document.getElementById('purchaseCount').textContent = purchaseData.count || 0;
            document.getElementById('navBadge').textContent = purchaseData.count || 0;
        }
        
        // Get pending
        const pendingRes = await fetch(`${BACKEND_URL}/api/my-pending/${userId}`);
        const pendingData = await pendingRes.json();
        if (pendingData.success) {
            document.getElementById('pendingCount').textContent = pendingData.count || 0;
        }
        
        document.getElementById('mediaCount').textContent = allMedia.length || 0;
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// ==================== PROFILE DATA ====================
async function loadProfileData() {
    try {
        // Get purchases
        const purchaseRes = await fetch(`${BACKEND_URL}/api/my-purchases/${userId}`);
        const purchaseData = await purchaseRes.json();
        
        // Get pending
        const pendingRes = await fetch(`${BACKEND_URL}/api/my-pending/${userId}`);
        const pendingData = await pendingRes.json();
        
        // Update profile stats
        const totalMedia = allMedia.length || 0;
        const purchasedCount = purchaseData.success ? purchaseData.count : 0;
        const pendingCount = pendingData.success ? pendingData.count : 0;
        
        document.getElementById('profileTotalMedia').textContent = totalMedia;
        document.getElementById('profilePurchased').textContent = purchasedCount;
        document.getElementById('profilePending').textContent = pendingCount;
        
        // Update purchase history
        renderPurchaseHistory(purchaseData.success ? purchaseData.data : []);
        
    } catch (error) {
        console.error('Profile data error:', error);
    }
}

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

// ==================== RENDER GALLERY ====================
function renderGallery(media) {
    const grid = document.getElementById('mediaGrid');
    
    if (!media || media.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No Content Available</h3>
                <p>Check back later for new uploads</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = media.map((item, index) => {
        const isPurchased = item.isPurchased || false;
        
        let badgeHTML = '';
        let actionsHTML = '';
        
        if (isPurchased) {
            badgeHTML = `<div class="badge badge-purchased">✅ Owned</div>`;
            actionsHTML = `
                <button class="btn-action btn-view" onclick="event.stopPropagation(); viewMedia('${item.id}')">
                    👁️ View
                </button>
            `;
        } else {
            badgeHTML = `<div class="badge badge-price">$${item.price || 5.00}</div>`;
            actionsHTML = `
                <button class="btn-action btn-buy" onclick="event.stopPropagation(); openPurchaseModal('${item.id}')">
                    💰 Buy
                </button>
            `;
        }
        
        const previewContent = isPurchased ? `
            ${item.type === 'video' 
                ? `<video src="${item.fileUrl}" muted preload="metadata" playsinline></video>`
                : `<img src="${item.fileUrl}" alt="${item.title}" loading="lazy" />`
            }
        ` : `
            <div class="locked-overlay">
                <span class="lock-icon">🔒</span>
                <span class="lock-label">Premium Content</span>
            </div>
            ${item.type === 'video' 
                ? `<video muted preload="metadata" playsinline></video>`
                : `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%231a1a2e' width='100' height='100'/%3E%3C/svg%3E" alt="Locked" />`
            }
        `;
        
        return `
            <div class="media-card" style="animation-delay: ${index * 0.05}s">
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
        // Show items that are pending (will be filtered by API)
        filtered = filtered.filter(m => m.isPending || false);
    }
    
    renderGallery(filtered);
}

// ==================== PURCHASE MODAL ====================
async function openPurchaseModal(mediaId) {
    const media = allMedia.find(m => m.id === mediaId);
    if (!media) {
        showToast('Content not found', 'error');
        return;
    }
    
    currentModalMedia = media;
    
    try {
        // Check if already pending
        const response = await fetch(`${BACKEND_URL}/api/pending-status/${userId}/${mediaId}`);
        const result = await response.json();
        if (result.isPending) {
            showToast('⏳ Already pending approval', 'pending');
            return;
        }
    } catch (error) {
        console.error('Pending check error:', error);
    }
    
    document.getElementById('modalTitle').textContent = media.title || 'Untitled';
    document.getElementById('modalDescription').textContent = media.description || 'No description';
    document.getElementById('modalPrice').textContent = (media.price || 5.00).toFixed(2);
    document.getElementById('modalPaypalEmail').textContent = window.ADMIN_PAYPAL_EMAIL || 'admin@paypal.com';
    
    const preview = document.getElementById('modalPreview');
    if (media.type === 'video') {
        preview.innerHTML = `
            <video muted preload="metadata" playsinline style="width:100%; height:100%; object-fit:cover;">
                <source src="${media.fileUrl}" type="video/mp4">
            </video>
        `;
    } else {
        preview.innerHTML = `
            <img src="${media.fileUrl}" alt="${media.title}" style="width:100%; height:100%; object-fit:cover;">
        `;
    }
    
    document.getElementById('purchaseModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePurchaseModal() {
    document.getElementById('purchaseModal').style.display = 'none';
    document.body.style.overflow = '';
    const video = document.querySelector('#modalPreview video');
    if (video) video.pause();
}

// ==================== REQUEST PURCHASE ====================
async function requestPurchase() {
    if (!currentModalMedia) return;
    
    const mediaId = currentModalMedia.id;
    const btn = document.querySelector('.btn-pay');
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Sending...';
        
        const response = await fetch(`${BACKEND_URL}/api/request-purchase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, mediaId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            closePurchaseModal();
            showToast('✅ Request sent! Admin will approve after payment.', 'success');
            setTimeout(() => {
                loadMedia();
                updateStats();
                loadProfileData();
            }, 1500);
        } else {
            showToast(result.error || 'Failed to request purchase', 'error');
        }
    } catch (error) {
        console.error('Request error:', error);
        showToast('Network error. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>💰</span> I\'ve Sent Payment';
    }
}

// ==================== VIEW MEDIA ====================
async function viewMedia(mediaId) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/media/${mediaId}?userId=${userId}`);
        const result = await response.json();
        
        if (!result.success) {
            showToast('Failed to load content', 'error');
            return;
        }
        
        const media = result.data;
        
        if (!media.isPurchased) {
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
    
    const icons = {
        success: '✅',
        error: '❌',
        pending: '⏳',
        info: '📢'
    };
    
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

// ==================== ADMIN SETTINGS ====================
window.ADMIN_PAYPAL_EMAIL = 'lenabotrel65@outlook.com';
window.ADMIN_PAYPAL_LINK = 'https://paypal.me/yourusername';

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', init);

// Refresh data when tab becomes visible
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isInitialized) {
        loadMedia();
        updateStats();
        loadProfileData();
    }
});

// ==================== EXPOSE GLOBALLY ====================
window.openPurchaseModal = openPurchaseModal;
window.closePurchaseModal = closePurchaseModal;
window.requestPurchase = requestPurchase;
window.viewMedia = viewMedia;
window.closeViewModal = closeViewModal;
