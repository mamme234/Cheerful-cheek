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

// ==================== INITIALIZATION ====================
function init() {
    if (isInitialized) return;
    isInitialized = true;
    
    // Telegram WebApp
    if (tg) {
        tg.ready();
        tg.expand();
        const user = tg.initDataUnsafe?.user;
        if (user) {
            userId = user.id;
            const avatar = document.getElementById('userAvatar');
            if (avatar) avatar.textContent = user.first_name?.charAt(0).toUpperCase() || '👤';
        }
    } else {
        userId = 'test_user_' + Date.now();
    }
    
    console.log('✅ Mini App initialized');
    console.log('📡 Backend:', BACKEND_URL);
    console.log('👤 User ID:', userId);
    
    setupEventListeners();
    loadApp();
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
    
    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            const tab = this.dataset.tab;
            
            if (tab === 'owned') {
                currentFilter = 'purchased';
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                document.querySelector('.filter-chip[data-filter="purchased"]')?.classList.add('active');
                applyFilters();
            } else if (tab === 'profile') {
                showToast('👤 Profile coming soon', 'info');
            } else {
                currentFilter = 'all';
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
                applyFilters();
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
    } catch (error) {
        console.error('Error loading app:', error);
        showToast('Failed to load content', 'error');
        document.getElementById('mediaGrid').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Failed to Load Content</h3>
                <p>${error.message || 'Please try again'}</p>
                <button onclick="location.reload()" style="margin-top:16px; padding:10px 30px; background:#e94560; border:none; border-radius:12px; color:white; font-weight:600; cursor:pointer;">
                    🔄 Retry
                </button>
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

async function loadMedia() {
    try {
        const url = `${BACKEND_URL}/api/media?userId=${userId}`;
        console.log('📡 Fetching:', url);
        
        const response = await fetch(url);
        console.log('📡 Response status:', response.status);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        console.log('📦 Data:', result);
        
        if (result.success) {
            allMedia = result.data || [];
            console.log(`✅ Loaded ${allMedia.length} media items`);
            renderGallery(allMedia);
        } else {
            throw new Error(result.error || 'Failed to load media');
        }
    } catch (error) {
        console.error('❌ Load media error:', error);
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

// ==================== RENDER GALLERY ====================
function renderGallery(media) {
    const grid = document.getElementById('mediaGrid');
    
    if (!media || media.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No Content Available</h3>
                <p>Check back later for new uploads</p>
                <div style="margin-top:12px; font-size:12px; color:var(--tg-text-muted); background:var(--tg-surface-2); padding:12px; border-radius:12px;">
                    💡 Admin: Send /upload in the bot to add content
                </div>
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
            <div class="media-card" style="animation-delay: ${index * 0.05}s" data-id="${item.id}" data-type="${item.type}">
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

// ==================== CONFIRM PAYMENT ====================
async function confirmPayment() {
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
            showToast('✅ Purchase request sent! Waiting for approval.', 'success');
            setTimeout(() => {
                loadMedia();
                updateStats();
            }, 1500);
        } else {
            showToast(result.error || 'Failed to request purchase', 'error');
        }
    } catch (error) {
        console.error('Payment error:', error);
        showToast('Network error. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>💰</span> Pay Now';
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
    }
});

// ==================== EXPOSE GLOBALLY ====================
window.openPurchaseModal = openPurchaseModal;
window.closePurchaseModal = closePurchaseModal;
window.confirmPayment = confirmPayment;
window.viewMedia = viewMedia;
window.closeViewModal = closeViewModal;
