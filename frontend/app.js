const BACKEND_URL = 'https://cheerful-cheek.onrender.com';

let tg = window.Telegram?.WebApp;
let userId = null;
let allMedia = [];
let currentFilter = 'all';

// Initialize
if (tg) {
    tg.ready();
    tg.expand();
    const user = tg.initDataUnsafe?.user;
    if (user) {
        userId = user.id;
        document.getElementById('userName').textContent = `👤 ${user.first_name || 'User'}`;
    }
} else {
    userId = 'test_user_' + Date.now();
    document.getElementById('userName').textContent = '👤 Test User';
}

// Load app
async function loadApp() {
    try {
        await loadMedia();
        await updateCounts();
    } catch (error) {
        console.error('Error:', error);
        showStatus('Failed to load application', 'error');
    }
}

// Load all media
async function loadMedia() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/media?userId=${userId}`);
        const result = await response.json();
        
        if (result.success) {
            allMedia = result.data;
            renderGallery(allMedia);
        } else {
            showStatus('Failed to load media', 'error');
        }
    } catch (error) {
        console.error('Error loading media:', error);
        showStatus('Network error', 'error');
    }
}

// Update purchase and pending counts
async function updateCounts() {
    try {
        // Get purchases
        const purchaseRes = await fetch(`${BACKEND_URL}/api/my-purchases/${userId}`);
        const purchaseData = await purchaseRes.json();
        if (purchaseData.success) {
            document.getElementById('purchaseCount').textContent = `🛒 ${purchaseData.count}`;
        }
        
        // Get pending
        const pendingRes = await fetch(`${BACKEND_URL}/api/my-pending/${userId}`);
        const pendingData = await pendingRes.json();
        if (pendingData.success && pendingData.count > 0) {
            // Add pending badge
            const badge = document.getElementById('purchaseCount');
            badge.textContent = `🛒 ${purchaseData.count} ⏳ ${pendingData.count}`;
        }
    } catch (error) {
        console.error('Error updating counts:', error);
    }
}

// Render gallery
function renderGallery(media) {
    const gallery = document.getElementById('gallery');
    
    if (!media || media.length === 0) {
        gallery.innerHTML = `
            <div class="loading">
                📭 No media available.<br>
                <span style="font-size:14px;color:#6c6c7a;">Check back later!</span>
            </div>
        `;
        return;
    }
    
    gallery.innerHTML = media.map(item => {
        const isPurchased = item.isPurchased || false;
        
        // Check if pending
        let isPending = false;
        // We need to check pending status - we'll do this via API when clicked
        
        let statusBadge = '';
        let actionButton = '';
        
        if (isPurchased) {
            statusBadge = `<span class="status-badge purchased">✅ Purchased</span>`;
            actionButton = `<button class="action-btn view-btn" onclick="event.stopPropagation(); viewMedia('${item.id}')">👁️ View</button>`;
        } else {
            statusBadge = `<span class="status-badge locked">🔒 Locked</span>`;
            actionButton = `<button class="action-btn buy-btn" onclick="event.stopPropagation(); requestPurchase('${item.id}')">💰 Buy $${item.price}</button>`;
        }
        
        return `
            <div class="media-card" data-id="${item.id}" data-type="${item.type}" data-purchased="${isPurchased}">
                <div class="media-content" style="background: linear-gradient(135deg, #1a1a2e, #2a2a4e); display:flex; align-items:center; justify-content:center; min-height:200px;">
                    <div style="text-align:center; color:white; padding:20px;">
                        <div style="font-size:48px; margin-bottom:10px;">${isPurchased ? '✅' : '🔒'}</div>
                        <div style="font-size:14px; color:#a8a8b3;">${item.type === 'video' ? '🎬' : '📷'} ${item.type}</div>
                        ${!isPurchased ? `<div style="font-size:12px; color:#e94560; margin-top:5px;">$${item.price}</div>` : ''}
                    </div>
                </div>
                <div class="media-info">
                    <div class="media-title">${item.title}</div>
                    <div class="media-description">${item.description}</div>
                    <div class="media-meta">
                        ${statusBadge}
                        ${actionButton}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Request purchase (user clicks buy)
async function requestPurchase(mediaId) {
    if (!userId) {
        showStatus('User not identified', 'error');
        return;
    }
    
    try {
        // Check if already pending
        const pendingCheck
