// frontend/app.js
class CheerfulChickApp {
    constructor() {
        this.currentUser = null;
        this.currentItem = null;
        this.pendingPayment = null;
        this.screenshotFile = null;
        this.purchases = [];
        this.mediaItems = [];
        // Replace with your actual Render backend URL
        this.API_URL = 'https://cheerful-cheek.onrender.com/api';
        // For local development, use: this.API_URL = 'http://localhost:3000';
        this.init();
    }

    async init() {
        await this.loadUserData();
        await this.loadMediaItems();
        this.setupEventListeners();
        this.hideSplash();
        
        // Check for pending payments
        this.checkPendingPayments();
    }

    hideSplash() {
        setTimeout(() => {
            document.getElementById('splash-screen').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
        }, 1500);
    }

    async loadUserData() {
        try {
            const userData = await this.getTelegramUser();
            if (userData) {
                this.currentUser = userData;
                document.getElementById('displayName').textContent = userData.first_name || 'User';
                document.getElementById('username').textContent = `@${userData.username || 'username'}`;
                
                // Register user with backend
                await this.registerUser(userData);
                await this.loadUserPurchases(userData.id);
                
                // Update join date
                const joinDate = new Date(userData.registeredAt || Date.now());
                document.getElementById('joinDate').textContent = joinDate.toLocaleDateString();
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    getTelegramUser() {
        return new Promise((resolve) => {
            if (window.Telegram && window.Telegram.WebApp) {
                resolve(window.Telegram.WebApp.initDataUnsafe.user);
            } else {
                // Demo mode for local development
                resolve({
                    id: 123456,
                    first_name: 'Demo User',
                    username: 'demouser',
                    registeredAt: Date.now()
                });
            }
        });
    }

    async registerUser(userData) {
        try {
            const response = await fetch(`${this.API_URL}/api/users/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: userData.id,
                    firstName: userData.first_name,
                    lastName: userData.last_name,
                    username: userData.username,
                    photoUrl: userData.photo_url
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Error registering user:', error);
        }
    }

    async loadMediaItems() {
        try {
            const response = await fetch(`${this.API_URL}/api/media`);
            if (response.ok) {
                this.mediaItems = await response.json();
                this.renderFeed('all');
                this.updateStats();
            } else {
                console.error('Failed to load media, using demo data');
                this.loadDemoData();
            }
        } catch (error) {
            console.error('Error loading media:', error);
            this.loadDemoData();
        }
    }

    loadDemoData() {
        this.mediaItems = [
            {
                id: 1,
                type: 'video',
                title: 'Premium Video 1',
                description: 'Exclusive content for premium members',
                thumbnail: 'https://via.placeholder.com/300x200/1a1a1a/d4af37?text=Video+1',
                duration: '5:30',
                price: 9.99,
                isPurchased: false,
                url: 'https://example.com/video1.mp4',
                date: '2024-01-15'
            },
            {
                id: 2,
                type: 'photo',
                title: 'Premium Photo 1',
                description: 'High quality exclusive photo',
                thumbnail: 'https://via.placeholder.com/300x200/1a1a1a/d4af37?text=Photo+1',
                price: 4.99,
                isPurchased: false,
                url: 'https://example.com/photo1.jpg',
                date: '2024-01-14'
            },
            {
                id: 3,
                type: 'video',
                title: 'Premium Video 2',
                description: 'Another exclusive video content',
                thumbnail: 'https://via.placeholder.com/300x200/1a1a1a/d4af37?text=Video+2',
                duration: '8:15',
                price: 12.99,
                isPurchased: false,
                url: 'https://example.com/video2.mp4',
                date: '2024-01-13'
            },
            {
                id: 4,
                type: 'photo',
                title: 'Premium Photo 2',
                description: 'Beautiful exclusive photo',
                thumbnail: 'https://via.placeholder.com/300x200/1a1a1a/d4af37?text=Photo+2',
                price: 6.99,
                isPurchased: false,
                url: 'https://example.com/photo2.jpg',
                date: '2024-01-12'
            }
        ];
        this.renderFeed('all');
        this.updateStats();
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
            // Load from localStorage as fallback
            this.loadPurchasesFromStorage();
        }
    }

    loadPurchasesFromStorage() {
        const saved = localStorage.getItem('purchases');
        if (saved) {
            this.purchases = JSON.parse(saved);
            this.updatePurchaseStatus();
            this.updateStats();
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

        if (category === 'videos') {
            items = items.filter(item => item.type === 'video');
        } else if (category === 'photos') {
            items = items.filter(item => item.type === 'photo');
        } else if (category === 'new') {
            items = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
        } else if (category === 'popular') {
            items = [...items].sort(() => Math.random() - 0.5);
        }

        if (items.length === 0) {
            feed.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:#888;">
                    <i class="fas fa-box-open" style="font-size:48px;margin-bottom:16px;display:block;"></i>
                    <p>No content available in this category</p>
                </div>
            `;
            return;
        }

        feed.innerHTML = items.map(item => this.createFeedItem(item)).join('');
        this.attachFeedEvents();
    }

    createFeedItem(item) {
        const isPurchased = item.isPurchased;
        return `
            <div class="feed-item" data-id="${item.id}">
                <div class="feed-thumbnail" style="position:relative;">
                    <img src="${item.thumbnail}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;">
                    ${item.duration ? `<span class="video-duration">${item.duration}</span>` : ''}
                    ${isPurchased ? '<span style="position:absolute;top:8px;right:8px;background:#2ecc71;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">✓ Unlocked</span>' : ''}
                </div>
                <div class="feed-info">
                    <h4 class="feed-title">${item.title}</h4>
                    <p class="feed-desc">${item.description}</p>
                    <div class="feed-meta">
                        <span>${new Date(item.date).toLocaleDateString()}</span>
                        <span class="feed-price">$${item.price.toFixed(2)}</span>
                    </div>
                    <div class="feed-actions">
                        ${isPurchased ? 
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
                if (item) this.openPayment(item);
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

    openPayment(item) {
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

    async submitPayment() {
        if (!this.screenshotFile) {
            alert('📸 Please upload a payment screenshot');
            return;
        }

        if (!this.currentUser) {
            alert('❌ Please login first');
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
                alert('✅ Payment submitted successfully! Admin will review and approve your purchase within 24 hours.');
                document.getElementById('paymentModal').classList.add('hidden');
                
                // Add to local purchases
                this.purchases.push({
                    itemId: this.pendingPayment.id,
                    amount: this.pendingPayment.price,
                    purchaseDate: new Date().toISOString(),
                    status: 'pending'
                });
                localStorage.setItem('purchases', JSON.stringify(this.purchases));
                
                // Send notification in chat
                this.addMessage('system', '💳 Payment submitted for approval. You will be notified when approved.');
                
                // Start polling for payment status
                this.pollPaymentStatus(data.paymentId);
            } else {
                alert('❌ Error submitting payment: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Payment submission error:', error);
            alert('❌ Error submitting payment. Please try again.');
        } finally {
            confirmBtn.disabled = false;
            loader.classList.add('hidden');
            btnText.textContent = 'Submit for Approval';
        }
    }

    async pollPaymentStatus(paymentId) {
        let attempts = 0;
        const maxAttempts = 120; // 10 minutes at 5 second intervals
        
        const interval = setInterval(async () => {
            attempts++;
            try {
                const response = await fetch(`${this.API_URL}/api/payments/${paymentId}`);
                if (!response.ok) {
                    if (attempts >= maxAttempts) {
                        clearInterval(interval);
                    }
                    return;
                }
                
                const payment = await response.json();
                
                if (payment.status === 'approved') {
                    clearInterval(interval);
                    alert('🎉 Payment approved! You now have access to the content.');
                    await this.loadUserPurchases(this.currentUser.id);
                    this.addMessage('system', '✅ Payment approved! Content unlocked.');
                } else if (payment.status === 'rejected') {
                    clearInterval(interval);
                    alert('❌ Payment was rejected. Please contact admin for more information.');
                    this.addMessage('system', '❌ Payment rejected. Please contact admin.');
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    this.addMessage('system', '⏰ Payment status check timed out. Please check your purchases later.');
                }
            } catch (error) {
                console.error('Error checking payment status:', error);
                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                }
            }
        }, 5000);
    }

    viewMedia(item) {
        const viewer = document.getElementById('mediaViewer');
        const display = document.getElementById('mediaDisplay');
        
        if (item.type === 'video') {
            display.innerHTML = `
                <video controls autoplay style="width:100%;max-height:70vh;border-radius:8px;">
                    <source src="${item.url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <div style="margin-top:12px;">
                    <h3>${item.title}</h3>
                    <p style="color:#888;">${item.description}</p>
                </div>
            `;
        } else {
            display.innerHTML = `
                <img src="${item.url}" alt="${item.title}" style="width:100%;border-radius:8px;">
                <div style="margin-top:12px;">
                    <h3>${item.title}</h3>
                    <p style="color:#888;">${item.description}</p>
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

    sendMessage() {
        const input = document.getElementById('msgInput');
        const message = input.value.trim();
        if (!message) return;
        
        this.addMessage('sent', message);
        input.value = '';
        
        // Send to backend
        this.sendToBackend(message);
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

    async checkPendingPayments() {
        if (this.currentUser) {
            try {
                const response = await fetch(`${this.API_URL}/api/purchases/${this.currentUser.id}`);
                if (response.ok) {
                    const purchases = await response.json();
                    const pending = purchases.filter(p => p.status === 'pending');
                    if (pending.length > 0) {
                        this.addMessage('system', `⏳ You have ${pending.length} pending payment(s) awaiting approval.`);
                    }
                }
            } catch (error) {
                console.error('Error checking pending payments:', error);
            }
        }
    }

    showPurchases() {
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
            list.innerHTML = this.purchases.map(p => `
                <div class="purchase-item">
                    <div class="purchase-item-info">
                        <div class="purchase-item-name">${p.item ? p.item.title : 'Item #' + p.itemId}</div>
                        <div class="purchase-item-date">${new Date(p.purchaseDate).toLocaleDateString()}</div>
                    </div>
                    <div class="purchase-item-price">$${p.amount.toFixed(2)}</div>
                </div>
            `).join('');
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
                // Validate file type
                if (!file.type.startsWith('image/')) {
                    alert('Please upload an image file');
                    e.target.value = '';
                    return;
                }
                
                // Validate file size (max 10MB)
                if (file.size > 10 * 1024 * 1024) {
                    alert('File size must be less than 10MB');
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

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                localStorage.clear();
                window.location.reload();
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
            if (searchTerm) {
                const filtered = this.mediaItems.filter(item => 
                    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.description.toLowerCase().includes(searchTerm.toLowerCase())
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
            alert('📬 No new notifications');
        });
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new CheerfulChickApp();
    
    // Make app globally accessible for debugging
    window.app = app;
});
