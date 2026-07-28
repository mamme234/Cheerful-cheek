// frontend/app.js
class CheerfulChickApp {
    constructor() {
        this.currentUser = null;
        this.currentItem = null;
        this.pendingPayment = null;
        this.screenshotFile = null;
        this.purchases = [];
        this.mediaItems = [];
        this.messages = [];
        this.paymentPolling = null;
        this.isLoading = false;
        this.isGuest = true;
        this.showLoginModal = false;
        
        // Use the deployed backend URL
        this.API_URL = 'https://cheerful-cheek.onrender.com';
        
        this.init();
    }

    async init() {
        try {
            // Initialize Telegram WebApp
            await this.initTelegramWebApp();
            
            // Hide splash after everything is ready
            setTimeout(() => {
                this.hideSplash();
            }, 1500);
            
            await this.loadMediaItems();
            this.setupEventListeners();
            this.setupGuestMode();
            
        } catch (error) {
            console.error('Init error:', error);
            this.showError('Failed to initialize app. Please try again.');
            this.hideSplash();
        }
    }

    initTelegramWebApp() {
        return new Promise((resolve) => {
            try {
                if (window.Telegram && window.Telegram.WebApp) {
                    console.log('📱 Telegram WebApp detected');
                    const tg = window.Telegram.WebApp;
                    tg.ready();
                    tg.expand();
                    
                    if (tg.themeParams) {
                        document.documentElement.style.setProperty('--tg-bg-color', tg.themeParams.bg_color || '#0a0a0a');
                        document.documentElement.style.setProperty('--tg-text-color', tg.themeParams.text_color || '#ffffff');
                        document.documentElement.style.setProperty('--tg-hint-color', tg.themeParams.hint_color || '#888888');
                        document.documentElement.style.setProperty('--tg-link-color', tg.themeParams.link_color || '#d4af37');
                        document.documentElement.style.setProperty('--tg-button-color', tg.themeParams.button_color || '#d4af37');
                        document.documentElement.style.setProperty('--tg-button-text-color', tg.themeParams.button_text_color || '#000000');
                    }
                    
                    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                        this.currentUser = tg.initDataUnsafe.user;
                        this.isGuest = false;
                        console.log('👤 User loaded from Telegram:', this.currentUser.first_name);
                        this.registerUser(this.currentUser);
                        this.loadUserPurchases(this.currentUser.id);
                        this.updateProfileUI();
                    } else {
                        console.log('ℹ️ Guest mode - No Telegram user data');
                        this.isGuest = true;
                    }
                    resolve();
                } else {
                    console.log('ℹ️ Not running in Telegram WebApp - Guest mode');
                    this.isGuest = true;
                    resolve();
                }
            } catch (error) {
                console.error('Error initializing Telegram WebApp:', error);
                this.isGuest = true;
                resolve();
            }
        });
    }

    setupGuestMode() {
        // Show guest indicator
        const guestBadge = document.createElement('div');
        guestBadge.id = 'guest-badge';
        guestBadge.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            background: rgba(212, 175, 55, 0.2);
            border: 1px solid #d4af37;
            color: #d4af37;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 10px;
            z-index: 100;
            cursor: pointer;
            transition: all 0.3s;
        `;
        guestBadge.textContent = this.isGuest ? '👤 Guest Mode' : '✅ Logged In';
        guestBadge.title = this.isGuest ? 'Click to login' : 'Logged in with Telegram';
        
        if (this.isGuest) {
            guestBadge.onclick = () => this.showLoginOptions();
        }
        
        document.body.appendChild(guestBadge);

        // Update profile UI based on login status
        this.updateProfileUI();
    }

    showLoginOptions() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 99999;
            flex-direction: column;
            padding: 20px;
        `;
        
        overlay.innerHTML = `
            <div style="text-align:center;max-width:400px;width:100%;">
                <img src="background.png" alt="Logo" style="width:80px;height:80px;border-radius:20px;margin-bottom:20px;border:3px solid #d4af37;">
                <h2 style="color:#d4af37;margin-bottom:10px;">Login to Cheerful Chick</h2>
                <p style="color:#888;margin-bottom:30px;font-size:14px;">Login to make purchases and access premium content</p>
                
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <button onclick="window.app.loginWithTelegram()" style="background:#d4af37;color:#000;border:none;padding:14px 20px;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;">
                        <i class="fab fa-telegram-plane"></i>
                        Login with Telegram
                    </button>
                    
                    <button onclick="window.app.loginWithEmail()" style="background:rgba(255,255,255,0.05);color:#fff;border:1px solid rgba(255,255,255,0.1);padding:14px 20px;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;">
                        <i class="fas fa-envelope"></i>
                        Login with Email
                    </button>
                    
                    <button onclick="window.app.closeLogin()" style="background:none;color:#666;border:none;padding:10px;font-size:14px;cursor:pointer;margin-top:10px;">
                        Continue as Guest
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.loginOverlay = overlay;
    }

    loginWithTelegram() {
        // Try to get Telegram user
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                this.currentUser = tg.initDataUnsafe.user;
                this.isGuest = false;
                this.registerUser(this.currentUser);
                this.loadUserPurchases(this.currentUser.id);
                this.updateProfileUI();
                this.closeLogin();
                this.showSuccess('✅ Logged in with Telegram!');
                this.updateGuestBadge();
                return;
            }
        }
        this.showError('❌ Could not get Telegram user. Please make sure you\'re using the Telegram app.');
    }

    loginWithEmail() {
        // Show email login form
        const overlay = document.getElementById('telegram-login-overlay') || this.loginOverlay;
        if (overlay) {
            overlay.innerHTML = `
                <div style="text-align:center;max-width:400px;width:100%;">
                    <img src="background.png" alt="Logo" style="width:80px;height:80px;border-radius:20px;margin-bottom:20px;border:3px solid #d4af37;">
                    <h2 style="color:#d4af37;margin-bottom:10px;">Email Login</h2>
                    <p style="color:#888;margin-bottom:20px;font-size:14px;">Enter your email to continue</p>
                    
                    <form onsubmit="window.app.submitEmailLogin(event)" style="display:flex;flex-direction:column;gap:12px;">
                        <input type="email" id="email-input" placeholder="Enter your email" required style="padding:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:16px;width:100%;">
                        <button type="submit" style="background:#d4af37;color:#000;border:none;padding:14px;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;width:100%;">
                            Continue
                        </button>
                    </form>
                    
                    <button onclick="window.app.closeLogin()" style="background:none;color:#666;border:none;padding:10px;font-size:14px;cursor:pointer;margin-top:10px;">
                        Back
                    </button>
                </div>
            `;
        }
    }

    submitEmailLogin(event) {
        event.preventDefault();
        const email = document.getElementById('email-input').value;
        if (email) {
            // Create a guest user with email
            this.currentUser = {
                id: 'guest_' + Date.now(),
                first_name: email.split('@')[0] || 'Guest',
                username: email,
                email: email,
                isGuest: false
            };
            this.isGuest = false;
            this.registerUser(this.currentUser);
            this.loadUserPurchases(this.currentUser.id);
            this.updateProfileUI();
            this.closeLogin();
            this.showSuccess('✅ Logged in with email!');
            this.updateGuestBadge();
        }
    }

    closeLogin() {
        if (this.loginOverlay) {
            this.loginOverlay.remove();
            this.loginOverlay = null;
        }
    }

    updateGuestBadge() {
        const badge = document.getElementById('guest-badge');
        if (badge) {
            badge.textContent = this.isGuest ? '👤 Guest Mode' : '✅ Logged In';
            badge.title = this.isGuest ? 'Click to login' : 'Logged in';
            badge.onclick = this.isGuest ? () => this.showLoginOptions() : null;
            badge.style.cursor = this.isGuest ? 'pointer' : 'default';
        }
    }

    updateProfileUI() {
        const displayName = document.getElementById('displayName');
        const username = document.getElementById('username');
        const avatar = document.getElementById('profileAvatar');
        const joinDate = document.getElementById('joinDate');
        
        if (this.currentUser && !this.isGuest) {
            displayName.textContent = this.currentUser.first_name || this.currentUser.email || 'User';
            username.textContent = this.currentUser.username ? `@${this.currentUser.username}` : this.currentUser.email || 'guest';
            if (this.currentUser.photo_url) {
                avatar.src = this.currentUser.photo_url;
            }
            joinDate.textContent = new Date().toLocaleDateString();
        } else {
            displayName.textContent = 'Guest User';
            username.textContent = '👤 Guest Mode';
            avatar.src = 'background.png';
            joinDate.textContent = 'Not logged in';
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #e74c3c;
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            z-index: 10000;
            font-size: 14px;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: fadeIn 0.3s ease;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #2ecc71;
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            z-index: 10000;
            font-size: 14px;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: fadeIn 0.3s ease;
        `;
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        setTimeout(() => successDiv.remove(), 5000);
    }

    hideSplash() {
        const splash = document.getElementById('splash-screen');
        const app = document.getElementById('app');
        if (splash) {
            splash.style.opacity = '0';
            splash.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                splash.classList.add('hidden');
                splash.style.display = 'none';
            }, 500);
        }
        if (app) {
            app.classList.remove('hidden');
            app.style.display = 'flex';
        }
    }

    async registerUser(userData) {
        try {
            const response = await fetch(`${this.API_URL}/api/users/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: userData.id || userData.email || 'guest_' + Date.now(),
                    firstName: userData.first_name || userData.email || 'Guest',
                    lastName: userData.last_name || '',
                    username: userData.username || userData.email || 'guest',
                    photoUrl: userData.photo_url || ''
                })
            });
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error registering user:', error);
        }
    }

    async loadMediaItems() {
        try {
            this.showLoading(true);
            const response = await fetch(`${this.API_URL}/api/media`);
            
            if (response.ok) {
                this.mediaItems = await response.json();
                console.log('📦 Media items loaded:', this.mediaItems.length);
                
                if (this.mediaItems.length === 0) {
                    this.showEmptyState('No content available yet. Check back soon!');
                } else {
                    this.renderFeed('all');
                    this.updateStats();
                }
            } else {
                console.error('Failed to load media');
                this.showEmptyState('Failed to load content. Please try again later.');
            }
        } catch (error) {
            console.error('Error loading media:', error);
            this.showEmptyState('Failed to connect to server. Please try again later.');
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        this.isLoading = show;
        const feed = document.getElementById('feed');
        if (show) {
            feed.innerHTML = `
                <div style="text-align:center;padding:60px 20px;color:#888;">
                    <div class="loader" style="margin:0 auto 20px;width:40px;height:40px;border:3px solid #333;border-top-color:#d4af37;border-radius:50%;animation:spin 1s linear infinite;"></div>
                    <p>Loading content...</p>
                </div>
            `;
        }
    }

    showEmptyState(message) {
        const feed = document.getElementById('feed');
        feed.innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:#888;">
                <i class="fas fa-box-open" style="font-size:48px;margin-bottom:16px;display:block;color:#444;"></i>
                <p style="font-size:16px;">${message}</p>
                <p style="font-size:12px;margin-top:8px;color:#666;">Check back later for new content</p>
            </div>
        `;
    }

    async loadUserPurchases(userId) {
        try {
            const response = await fetch(`${this.API_URL}/api/purchases/${userId}`);
            if (response.ok) {
                this.purchases = await response.json();
                this.updatePurchaseStatus();
                this.updateStats();
            }
        } catch (error) {
            console.error('Error loading purchases:', error);
            this.loadPurchasesFromStorage();
        }
    }

    loadPurchasesFromStorage() {
        const saved = localStorage.getItem('purchases');
        if (saved) {
            try {
                this.purchases = JSON.parse(saved);
                this.updatePurchaseStatus();
                this.updateStats();
            } catch (e) {
                console.error('Error loading purchases from storage:', e);
            }
        }
    }

    updatePurchaseStatus() {
        this.mediaItems.forEach(item => {
            if (this.purchases.some(p => p.itemId === item.id)) {
                item.isPurchased = true;
            }
        });
        this.renderFeed('all');
    }

    updateStats() {
        const totalPurchases = this.purchases.length;
        const totalSpent = this.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        document.getElementById('totalPurchases').textContent = totalPurchases;
        document.getElementById('totalSpent').textContent = `$${totalSpent.toFixed(2)}`;
    }

    renderFeed(category) {
        const feed = document.getElementById('feed');
        let items = this.mediaItems;

        if (!items || items.length === 0) {
            this.showEmptyState('No content available yet. Check back soon!');
            return;
        }

        if (category === 'videos') {
            items = items.filter(item => item.type === 'video');
        } else if (category === 'photos') {
            items = items.filter(item => item.type === 'photo');
        } else if (category === 'new') {
            items = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
        } else if (category === 'popular') {
            items = [...items].sort((a, b) => (b.purchases || 0) - (a.purchases || 0));
        }

        if (items.length === 0) {
            feed.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:#888;">
                    <i class="fas fa-search" style="font-size:32px;margin-bottom:12px;display:block;color:#444;"></i>
                    <p>No ${category === 'all' ? '' : category} content available</p>
                </div>
            `;
            return;
        }

        feed.innerHTML = items.map(item => this.createFeedItem(item)).join('');
        this.attachFeedEvents();
    }

    createFeedItem(item) {
        const isPurchased = item.isPurchased;
        const priceDisplay = item.isFree || item.price === 0 ? 'FREE' : `$${item.price.toFixed(2)}`;
        const isLocked = !isPurchased && !item.isFree && item.price > 0;
        
        return `
            <div class="feed-item" data-id="${item.id}">
                <div class="feed-thumbnail" style="position:relative;">
                    <img src="${item.thumbnail || 'https://via.placeholder.com/300x200/1a1a1a/666?text=No+Image'}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://via.placeholder.com/300x200/1a1a1a/666?text=Image+Not+Found'">
                    ${item.duration ? `<span class="video-duration">${item.duration}</span>` : ''}
                    ${isPurchased ? '<span style="position:absolute;top:8px;right:8px;background:#2ecc71;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">✓ Unlocked</span>' : ''}
                    ${isLocked ? '<span style="position:absolute;top:8px;right:8px;background:#e74c3c;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">🔒 Locked</span>' : ''}
                    ${item.isFree || item.price === 0 ? '<span style="position:absolute;top:8px;left:8px;background:#2ecc71;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">FREE</span>' : ''}
                </div>
                <div class="feed-info">
                    <h4 class="feed-title">${item.title}</h4>
                    <p class="feed-desc">${item.description || ''}</p>
                    <div class="feed-meta">
                        <span>${item.date ? new Date(item.date).toLocaleDateString() : ''}</span>
                        <span class="feed-price">${priceDisplay}</span>
                    </div>
                    <div class="feed-actions">
                        ${isPurchased || item.isFree || item.price === 0 ? 
                            `<button class="btn-watch" data-id="${item.id}"><i class="fas ${item.type === 'video' ? 'fa-play' : 'fa-eye'}"></i> ${item.type === 'video' ? 'Watch' : 'View'}</button>` :
                            `<button class="btn-buy" data-id="${item.id}"><i class="fas fa-shopping-cart"></i> Buy Now</button>`
                        }
                    </div>
                </div>
            </div>
        `;
    }

    attachFeedEvents() {
        document.querySelectorAll('.btn-buy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const item = this.mediaItems.find(i => i.id === id);
                if (item) {
                    if (this.isGuest) {
                        this.showLoginOptions();
                    } else {
                        this.openPayment(item);
                    }
                }
            });
        });

        document.querySelectorAll('.btn-watch, .btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const item = this.mediaItems.find(i => i.id === id);
                if (item) this.viewMedia(item);
            });
        });
    }

    async openPayment(item) {
        this.currentItem = item;
        
        if (item.isFree || item.price === 0) {
            this.showSuccess('🎉 This content is FREE! Unlocking now...');
            await this.handleFreeContent(item);
            return;
        }

        this.pendingPayment = item;
        document.getElementById('paymentItem').textContent = item.title;
        document.getElementById('paymentPrice').textContent = `$${item.price.toFixed(2)}`;
        document.getElementById('paymentModal').classList.remove('hidden');
        document.getElementById('confirmPayment').disabled = true;
        this.screenshotFile = null;
        document.getElementById('screenshotPreview').classList.add('hidden');
        document.getElementById('screenshotInput').value = '';
        document.getElementById('paymentBtnText').textContent = 'Submit for Approval';
        document.getElementById('paymentLoader').classList.add('hidden');
    }

    async handleFreeContent(item) {
        if (this.isGuest) {
            this.showLoginOptions();
            return;
        }
        
        try {
            const response = await fetch(`${this.API_URL}/api/payments/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: this.currentUser.id,
                    userName: this.currentUser.first_name || 'User',
                    itemId: item.id,
                    amount: 0
                })
            });

            const data = await response.json();
            
            if (data.success && data.isFree) {
                this.purchases.push({
                    itemId: item.id,
                    amount: 0,
                    purchaseDate: new Date().toISOString(),
                    status: 'approved'
                });
                localStorage.setItem('purchases', JSON.stringify(this.purchases));
                
                item.isPurchased = true;
                this.renderFeed('all');
                this.updateStats();
                
                this.showSuccess('🎉 Content unlocked! You can now view it.');
                this.viewMedia(item);
            } else {
                this.showError('Failed to unlock free content. Please try again.');
            }
        } catch (error) {
            console.error('Error handling free content:', error);
            this.showError('Failed to unlock free content. Please try again.');
        }
    }

    async submitPayment() {
        if (this.isGuest) {
            this.showLoginOptions();
            return;
        }
        
        if (!this.screenshotFile) {
            this.showError('📸 Please upload a payment screenshot');
            return;
        }

        const confirmBtn = document.getElementById('confirmPayment');
        const loader = document.getElementById('paymentLoader');
        const btnText = document.getElementById('paymentBtnText');

        confirmBtn.disabled = true;
        loader.classList.remove('hidden');
        btnText.textContent = 'Submitting...';

        try {
            const formData = new FormData();
            formData.append('screenshot', this.screenshotFile);
            formData.append('userId', this.currentUser.id);
            formData.append('userName', this.currentUser.first_name || 'User');
            formData.append('itemId', this.pendingPayment.id);
            formData.append('amount', this.pendingPayment.price);

            const response = await fetch(`${this.API_URL}/api/payments/submit`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess('✅ Payment submitted! Admin will review within 24 hours.');
                document.getElementById('paymentModal').classList.add('hidden');
                
                this.purchases.push({
                    itemId: this.pendingPayment.id,
                    amount: this.pendingPayment.price,
                    purchaseDate: new Date().toISOString(),
                    status: 'pending'
                });
                localStorage.setItem('purchases', JSON.stringify(this.purchases));
                
                this.addMessage('system', '💳 Payment submitted for approval. You will be notified when approved.');
                this.pollPaymentStatus(data.paymentId);
            } else {
                this.showError('❌ Error submitting payment: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Payment submission error:', error);
            this.showError('❌ Error submitting payment. Please try again.');
        } finally {
            confirmBtn.disabled = false;
            loader.classList.add('hidden');
            btnText.textContent = 'Submit for Approval';
        }
    }

    async pollPaymentStatus(paymentId) {
        let attempts = 0;
        const maxAttempts = 120;
        
        const interval = setInterval(async () => {
            attempts++;
            try {
                const response = await fetch(`${this.API_URL}/api/payments/${paymentId}`);
                if (!response.ok) {
                    if (attempts >= maxAttempts) clearInterval(interval);
                    return;
                }
                
                const payment = await response.json();
                
                if (payment.status === 'approved') {
                    clearInterval(interval);
                    this.showSuccess('🎉 Payment approved! You now have access to the content.');
                    await this.loadUserPurchases(this.currentUser.id);
                    this.addMessage('system', '✅ Payment approved! Content unlocked.');
                } else if (payment.status === 'rejected') {
                    clearInterval(interval);
                    this.showError('❌ Payment was rejected. Please contact admin.');
                    this.addMessage('system', '❌ Payment rejected. Please contact admin.');
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    this.addMessage('system', '⏰ Payment status check timed out. Please check later.');
                }
            } catch (error) {
                console.error('Error checking payment status:', error);
                if (attempts >= maxAttempts) clearInterval(interval);
            }
        }, 5000);
    }

    viewMedia(item) {
        const viewer = document.getElementById('mediaViewer');
        const display = document.getElementById('mediaDisplay');
        
        if (!item.isPurchased && !item.isFree && item.price > 0) {
            this.showError('❌ Please purchase this content first');
            return;
        }
        
        if (item.type === 'video') {
            display.innerHTML = `
                <video controls autoplay style="width:100%;max-height:70vh;border-radius:8px;">
                    <source src="${item.url}" type="video/mp4">
                    <p style="color:#888;text-align:center;padding:40px;">Your browser does not support the video tag.</p>
                </video>
                <div style="margin-top:12px;">
                    <h3>${item.title}</h3>
                    <p style="color:#888;">${item.description || ''}</p>
                </div>
            `;
        } else {
            display.innerHTML = `
                <img src="${item.url || item.thumbnail}" alt="${item.title}" style="width:100%;border-radius:8px;" onerror="this.src='https://via.placeholder.com/600x400/1a1a1a/666?text=Image+Not+Found'">
                <div style="margin-top:12px;">
                    <h3>${item.title}</h3>
                    <p style="color:#888;">${item.description || ''}</p>
                </div>
            `;
        }
        
        viewer.classList.remove('hidden');
    }

    addMessage(type, content) {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type === 'system' ? 'system' : 'received'}`;
        messageDiv.innerHTML = `
            <div>${content}</div>
            <span class="message-time">${new Date().toLocaleTimeString()}</span>
        `;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    async sendMessage() {
        if (this.isGuest) {
            this.showLoginOptions();
            return;
        }
        
        const input = document.getElementById('msgInput');
        const message = input.value.trim();
        if (!message) return;
        
        this.addMessage('sent', message);
        input.value = '';
        await this.sendToBackend(message);
    }

    async sendToBackend(message) {
        try {
            await fetch(`${this.API_URL}/api/chat/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: this.currentUser ? this.currentUser.id : 0,
                    recipientId: parseInt(localStorage.getItem('adminId') || '123456789'),
                    message: message,
                    type: 'text'
                })
            });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    showPurchases() {
        if (this.isGuest) {
            this.showLoginOptions();
            return;
        }
        
        const modal = document.getElementById('purchasesModal');
        const list = document.getElementById('purchasesList');
        
        if (this.purchases.length === 0) {
            list.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:#888;">
                    <i class="fas fa-shopping-bag" style="font-size:48px;margin-bottom:16px;display:block;"></i>
                    <p>No purchases yet</p>
                    <p style="font-size:12px;margin-top:8px;">Browse the feed to buy premium content</p>
                </div>
            `;
        } else {
            list.innerHTML = this.purchases.map(p => {
                const item = this.mediaItems.find(m => m.id === p.itemId);
                const statusText = p.status === 'pending' ? '⏳ Pending' : '✅ Approved';
                const priceText = p.amount === 0 ? 'FREE' : `$${p.amount.toFixed(2)}`;
                return `
                    <div class="purchase-item">
                        <div class="purchase-item-info">
                            <div class="purchase-item-name">${item ? item.title : 'Item #' + p.itemId}</div>
                            <div class="purchase-item-date">${new Date(p.purchaseDate).toLocaleDateString()}</div>
                            <div style="font-size:11px;color:${p.status === 'pending' ? '#f39c12' : '#2ecc71'};">${statusText}</div>
                        </div>
                        <div class="purchase-item-price">${priceText}</div>
                    </div>
                `;
            }).join('');
        }
        
        modal.classList.remove('hidden');
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.getElementById(btn.dataset.page).classList.add('active');
            });
        });

        // Categories
        document.querySelectorAll('.cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderFeed(btn.dataset.category);
            });
        });

        // Payment modal
        document.getElementById('cancelPayment').addEventListener('click', () => {
            document.getElementById('paymentModal').classList.add('hidden');
        });

        document.getElementById('screenshotInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (!file.type.startsWith('image/')) {
                    this.showError('Please upload an image file');
                    e.target.value = '';
                    return;
                }
                
                if (file.size > 10 * 1024 * 1024) {
                    this.showError('File size must be less than 10MB');
                    e.target.value = '';
                    return;
                }
                
                this.screenshotFile = file;
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('previewImage').src = event.target.result;
                    document.getElementById('screenshotPreview').classList.remove('hidden');
                    document.getElementById('confirmPayment').disabled = false;
                };
                reader.readAsDataURL(file);
            }
        });

        document.querySelector('.remove-screenshot')?.addEventListener('click', () => {
            this.screenshotFile = null;
            document.getElementById('screenshotPreview').classList.add('hidden');
            document.getElementById('screenshotInput').value = '';
            document.getElementById('confirmPayment').disabled = true;
        });

        document.getElementById('confirmPayment').addEventListener('click', () => {
            this.submitPayment();
        });

        // Chat
        document.querySelector('.chat-item')?.addEventListener('click', () => {
            if (this.isGuest) {
                this.showLoginOptions();
                return;
            }
            document.getElementById('chatList').classList.add('hidden');
            document.getElementById('chatScreen').classList.remove('hidden');
        });

        document.querySelector('.back-btn')?.addEventListener('click', () => {
            document.getElementById('chatList').classList.remove('hidden');
            document.getElementById('chatScreen').classList.add('hidden');
        });

        document.querySelector('.send-btn')?.addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('msgInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Profile
        document.getElementById('purchasesBtn')?.addEventListener('click', () => {
            this.showPurchases();
        });

        // Click on profile avatar to login
        document.getElementById('profileAvatar')?.addEventListener('click', () => {
            if (this.isGuest) {
                this.showLoginOptions();
            }
        });

        // Click on profile name to login
        document.getElementById('displayName')?.addEventListener('click', () => {
            if (this.isGuest) {
                this.showLoginOptions();
            }
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                localStorage.clear();
                this.currentUser = null;
                this.isGuest = true;
                this.purchases = [];
                this.updateProfileUI();
                this.updateGuestBadge();
                this.showSuccess('👋 Logged out successfully');
            }
        });

        document.getElementById('closePurchases')?.addEventListener('click', () => {
            document.getElementById('purchasesModal').classList.add('hidden');
        });

        // Media viewer
        document.querySelector('.close-viewer')?.addEventListener('click', () => {
            document.getElementById('mediaViewer').classList.add('hidden');
            const video = document.querySelector('#mediaDisplay video');
            if (video) video.pause();
        });

        // Search
        document.getElementById('searchBtn')?.addEventListener('click', () => {
            const searchTerm = prompt('🔍 Search content:');
            if (searchTerm && searchTerm.trim()) {
                const filtered = this.mediaItems.filter(item => 
                    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
                );
                const feed = document.getElementById('feed');
                if (filtered.length === 0) {
                    feed.innerHTML = `
                        <div style="text-align:center;padding:40px 20px;color:#888;">
                            <i class="fas fa-search" style="font-size:48px;margin-bottom:16px;display:block;"></i>
                            <p>No results found for "${searchTerm}"</p>
                        </div>
                    `;
                } else {
                    feed.innerHTML = filtered.map(item => this.createFeedItem(item)).join('');
                    this.attachFeedEvents();
                }
            }
        });

        // Notifications
        document.getElementById('notifBtn')?.addEventListener('click', () => {
            const pending = this.purchases.filter(p => p.status === 'pending');
            if (pending.length > 0) {
                this.showInfo(`⏳ You have ${pending.length} pending payment(s) awaiting approval.`);
            } else {
                this.showInfo('📬 No new notifications');
            }
        });
    }

    showInfo(message) {
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #3498db;
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            z-index: 10000;
            font-size: 14px;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: fadeIn 0.3s ease;
        `;
        infoDiv.textContent = message;
        document.body.appendChild(infoDiv);
        setTimeout(() => infoDiv.remove(), 5000);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new CheerfulChickApp();
    window.app = app;
});
