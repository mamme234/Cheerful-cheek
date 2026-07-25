// Mini App JavaScript
const BACKEND_URL = 'https://your-backend.onrender.com'; // Replace with your Render URL

// Telegram WebApp initialization
let tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
    
    // Get user info
    const user = tg.initDataUnsafe?.user;
    if (user) {
        document.getElementById('userInfo').textContent = `👤 ${user.first_name || 'User'}`;
    }
}

// State
let isPaid = false; // This would come from your backend after payment verification
let mediaData = [];

// Load media from backend
async function loadMedia() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/media`);
        const result = await response.json();
        
        if (result.success) {
            mediaData = result.data;
            renderGallery(mediaData);
        } else {
            showError('Failed to load media');
        }
    } catch (error) {
        console.error('Error loading media:', error);
        showError('Network error. Please try again.');
    }
}

// Render gallery
function renderGallery(media) {
    const gallery = document.getElementById('gallery');
    
    if (!media || media.length === 0) {
        gallery.innerHTML = `
            <div class="loading">
                📭 No media available yet.<br>
                <span style="font-size:14px;color:#6c6c7a;">Check back later!</span>
            </div>
        `;
        return;
    }
    
    // If not paid, show lock overlay on all media
    const isLocked = !isPaid;
    
    gallery.innerHTML = media.map(item => {
        const mediaHTML = item.type === 'video' 
            ? `<video controls class="media-content" ${isLocked ? 'controlsList="nodownload"' : ''}>
                   <source src="${item.fileUrl}" type="video/mp4">
                   Your browser does not support videos.
               </video>`
            : `<img src="${item.fileUrl}" alt="${item.caption}" class="media-content" ${isLocked ? 'style="filter:blur(10px);"' : ''}>`;
        
        return `
            <div class="media-card ${isLocked ? 'locked' : ''}">
                ${mediaHTML}
                <div class="media-info">
                    <span class="media-type">${item.type}</span>
                    ${isLocked ? '<span style="color:#e94560;font-weight:600;float:right;">🔒 Locked</span>' : ''}
                    <p class="media-caption">${item.caption}</p>
                    <p class="media-date">${new Date(item.date).toLocaleDateString()}</p>
                </div>
            </div>
        `;
    }).join('');
}

// Payment handler
async function handlePayment() {
    if (tg) {
        // Show Telegram loading
        tg.showPopup({
            title: 'Payment',
            message: 'Processing payment...',
            buttons: [{ type: 'ok' }]
        });
        
        // Simulate payment flow - In production, use Telegram Payments API or PayPal
        // For demo, just toggle paid state
        setTimeout(() => {
            isPaid = true;
            tg.sendData(JSON.stringify({ action: 'payment_success' }));
            renderGallery(mediaData);
            document.getElementById('paymentBanner').style.display = 'none';
            
            tg.showPopup({
                title: '✅ Success',
                message: 'You now have full access to all content!',
                buttons: [{ type: 'ok' }]
            });
        }, 1500);
        
    } else {
        // Fallback for browser testing
        alert('🔗 Open this in Telegram for payment integration.');
    }
}

// Error display
function showError(message) {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = `
        <div class="loading" style="color:#e94560;">
            ❌ ${message}
        </div>
    `;
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadMedia();
});

// Handle Telegram WebApp events
if (tg) {
    tg.onEvent('mainButtonClicked', () => {
        handlePayment();
    });
    
    // Close the app when back button is pressed
    tg.onEvent('backButtonClicked', () => {
        tg.close();
    });
}

// Expose functions globally
window.handlePayment = handlePayment;
