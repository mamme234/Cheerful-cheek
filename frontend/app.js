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
        const pendingCheck = await fetch(`${BACKEND_URL}/api/pending-status/${userId}/${mediaId}`);
        const pendingResult = await pendingCheck.json();
        
        if (pendingResult.isPending) {
            showStatus('⏳ Already pending approval. Please wait for admin.', 'pending');
            return;
        }
        
        // Get media details
        const media = allMedia.find(m => m.id === mediaId);
        if (!media) {
            showStatus('Media not found', 'error');
            return;
        }
        
        // Show PayPal modal
        showPaypalModal(media);
        
    } catch (error) {
        console.error('Request error:', error);
        showStatus('Failed to request purchase', 'error');
    }
}

// Show PayPal modal
function showPaypalModal(media) {
    const modal = document.getElementById('paypalModal');
    document.getElementById('paypalEmail').textContent = window.ADMIN_PAYPAL_EMAIL || 'admin@paypal.com';
    document.getElementById('paymentAmount').textContent = media.price.toFixed(2);
    document.getElementById('paypalLink').href = window.ADMIN_PAYPAL_LINK || 'https://paypal.me/yourusername';
    modal.style.display = 'flex';
    
    // Store media ID for after payment
    modal.dataset.mediaId = media.id;
}

// Close PayPal modal
function closePaypalModal() {
    const modal = document.getElementById('paypalModal');
    const mediaId = modal.dataset.mediaId;
    modal.style.display = 'none';
    
    if (mediaId) {
        // User claims they sent payment
        confirmPayment(mediaId);
    }
}

// Confirm payment after user sends
async function confirmPayment(mediaId) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/request-purchase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, mediaId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus(
                `✅ Purchase request sent!\n\n` +
                `📌 Media: ${result.media.title}\n` +
                `💰 Amount: $${result.media.price}\n\n` +
                `⏳ Waiting for admin approval.\n` +
                `You'll be notified in the bot.`,
                'success'
            );
            
            // Refresh gallery
            setTimeout(() => loadMedia(), 2000);
        } else {
            showStatus(result.error || 'Failed to request purchase', 'error');
        }
    } catch (error) {
        console.error('Confirm error:', error);
        showStatus('Failed to confirm payment', 'error');
    }
}

// View purchased media
async function viewMedia(mediaId) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/media/${mediaId}?userId=${userId}`);
        const result = await response.json();
        
        if (!result.success) {
            showStatus('Failed to load media', 'error');
            return;
        }
        
        const media = result.data;
        
        if (!media.isPurchased) {
            showStatus('🔒 You need to purchase this content first.', 'error');
            return;
        }
        
        // Show in modal
        const modal = document.getElementById('viewModal');
        const body = document.getElementById('viewBody');
        
        if (media.type === 'video') {
            body.innerHTML = `
                <video controls autoplay style="max-width:100%; max-height:80vh;">
                    <source src="${media.fileUrl}" type="video/mp4">
                    Your browser does not support videos.
                </video>
                <div class="modal-info" style="padding:20px; color:white;">
                    <h2>${media.title}</h2>
                    <p>${media.description}</p>
                    <small>${new Date(media.date).toLocaleDateString()}</small>
                </div>
            `;
        } else {
            body.innerHTML = `
                <img src="${media.fileUrl}" alt="${media.title}" style="max-width:100%; max-height:80vh;">
                <div class="modal-info" style="padding:20px; color:white;">
                    <h2>${media.title}</h2>
                    <p>${media.description}</p>
                    <small>${new Date(media.date).toLocaleDateString()}</small>
                </div>
            `;
        }
        
        modal.style.display = 'flex';
        
    } catch (error) {
        console.error('View error:', error);
        showStatus('Failed to view content', 'error');
    }
}

// Close view modal
function closeViewModal() {
    document.getElementById('viewModal').style.display = 'none';
    const video = document.querySelector('#viewBody video');
    if (video) video.pause();
}

// Show status message
function showStatus(message, type = 'info') {
    const el = document.getElementById('statusMessage');
    el.textContent = message;
    el.className = `status-message ${type}`;
    el.style.display = 'block';
    
    setTimeout(() => {
        el.style.display = 'none';
    }, 8000);
}

// Filters
function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const filter = this.dataset.filter;
            let filtered = allMedia;
            
            if (filter === 'photo') {
                filtered = allMedia.filter(m => m.type === 'photo');
            } else if (filter === 'video') {
                filtered = allMedia.filter(m => m.type === 'video');
            } else if (filter === 'purchased') {
                filtered = allMedia.filter(m => m.isPurchased);
            } else if (filter === 'pending') {
                // We'll filter pending items from media list
                // This requires checking pending status
                filtered = allMedia.filter(m => {
                    // We'll check if it's pending via API
                    // For now, just show all
                    return m;
                });
                // Simple version: just show all for now
                // In production, you'd call an API to get pending IDs
            }
            
            renderGallery(filtered);
        });
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeViewModal();
        closePaypalModal();
    }
});

// Click outside to close
document.getElementById('paypalModal').addEventListener('click', function(e) {
    if (e.target === this) closePaypalModal();
});

document.getElementById('viewModal').addEventListener('click', function(e) {
    if (e.target === this) closeViewModal();
});

// Set admin details
window.ADMIN_PAYPAL_EMAIL = 'admin@paypal.com';
window.ADMIN_PAYPAL_LINK = 'https://paypal.me/yourusername';

// Telegram events
if (tg) {
    tg.onEvent('backButtonClicked', () => {
        if (document.getElementById('viewModal').style.display === 'flex') {
            closeViewModal();
        } else if (document.getElementById('paypalModal').style.display === 'flex') {
            closePaypalModal();
        } else {
            tg.close();
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadApp();
    setupFilters();
});

// Expose functions globally
window.requestPurchase = requestPurchase;
window.viewMedia = viewMedia;
window.closePaypalModal = closePaypalModal;
window.closeViewModal = closeViewModal;
