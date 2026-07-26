require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { startBot, ADMIN_IDS } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== DATABASE SETUP ====================
const DB_DIR = process.env.DB_DIR || path.join(__dirname, 'database');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log(`📁 Created database directory: ${DB_DIR}`);
}

const MEDIA_DB_PATH = path.join(DB_DIR, 'media.json');
const USERS_DB_PATH = path.join(DB_DIR, 'users.json');
const PENDING_DB_PATH = path.join(DB_DIR, 'pending.json');
const PURCHASES_DB_PATH = path.join(DB_DIR, 'purchases.json');

// ==================== DATABASE HELPERS ====================
const readDB = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            const initialData = filePath.includes('media') ? [] : 
                               filePath.includes('pending') ? [] : {};
            fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
            console.log(`📄 Created new file: ${path.basename(filePath)}`);
            return initialData;
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${path.basename(filePath)}:`, error);
        return filePath.includes('media') ? [] : 
               filePath.includes('pending') ? [] : {};
    }
};

const writeDB = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`💾 Saved to ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`Error writing ${path.basename(filePath)}:`, error);
    }
};

// ==================== MIDDLEWARE ====================
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
});

// ==================== FIX EXISTING MEDIA ====================
app.get('/api/fix-media', async (req, res) => {
    try {
        console.log('🔧 Running media fix...');
        
        const mediaDB = readDB(MEDIA_DB_PATH);
        let updated = 0;
        
        mediaDB.forEach(item => {
            // Fix: Add isFree field if missing
            if (item.isFree === undefined) {
                // If price is 0 or '0' or 'free', set isFree to true
                if (item.price === 0 || item.price === '0' || item.price === 'free' || item.price === null) {
                    item.isFree = true;
                    item.price = 0;
                } else {
                    item.isFree = false;
                }
                updated++;
            }
            
            // Fix: Ensure price is a number
            if (typeof item.price === 'string') {
                item.price = parseFloat(item.price) || 0;
            }
        });
        
        writeDB(MEDIA_DB_PATH, mediaDB);
        
        res.json({
            success: true,
            message: `Updated ${updated} media items`,
            totalMedia: mediaDB.length,
            freeItems: mediaDB.filter(m => m.isFree).length,
            paidItems: mediaDB.filter(m => !m.isFree).length,
            media: mediaDB.map(m => ({
                id: m.id,
                title: m.title,
                isFree: m.isFree,
                price: m.price,
                type: m.type
            }))
        });
    } catch (error) {
        console.error('Fix media error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    const mediaDB = readDB(MEDIA_DB_PATH);
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        mediaCount: mediaDB.length,
        admins: ADMIN_IDS || []
    });
});

// ==================== DEBUG ====================
app.get('/api/debug/db', (req, res) => {
    try {
        const mediaDB = readDB(MEDIA_DB_PATH);
        const purchases = readDB(PURCHASES_DB_PATH);
        const pending = readDB(PENDING_DB_PATH);
        const users = readDB(USERS_DB_PATH);
        
        res.json({
            success: true,
            data: {
                mediaCount: mediaDB.length,
                media: mediaDB.map(m => ({
                    id: m.id,
                    title: m.title,
                    type: m.type,
                    price: m.price,
                    isFree: m.isFree !== undefined ? m.isFree : 'MISSING',
                    date: m.date,
                    fileUrl: m.fileUrl ? 'exists' : 'missing'
                })),
                purchaseCount: Object.keys(purchases).length,
                pendingCount: pending.length,
                userCount: Object.keys(users).length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== GET ALL MEDIA ====================
app.get('/api/media', (req, res) => {
    try {
        const { userId } = req.query;
        console.log(`📸 Fetching media for user: ${userId || 'anonymous'}`);
        
        const mediaDB = readDB(MEDIA_DB_PATH);
        const purchases = readDB(PURCHASES_DB_PATH);
        
        // Ensure all media has isFree field
        let updated = false;
        mediaDB.forEach(item => {
            if (item.isFree === undefined) {
                item.isFree = (item.price === 0 || item.price === '0' || item.price === 'free');
                updated = true;
            }
        });
        if (updated) {
            writeDB(MEDIA_DB_PATH, mediaDB);
            console.log('✅ Fixed missing isFree fields');
        }
        
        console.log(`📦 Total media in DB: ${mediaDB.length}`);
        
        const userPurchases = purchases[userId] || [];
        
        const media = mediaDB
            .filter(item => item.approved !== false)
            .map(item => ({
                ...item,
                isPurchased: userPurchases.includes(item.id)
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log(`✅ Returning ${media.length} media items`);
        
        res.json({
            success: true,
            count: media.length,
            data: media
        });
    } catch (error) {
        console.error('Error fetching media:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== GET SINGLE MEDIA ====================
app.get('/api/media/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;
        
        console.log(`📸 Fetching media ${id} for user: ${userId || 'anonymous'}`);
        
        const mediaDB = readDB(MEDIA_DB_PATH);
        const media = mediaDB.find(m => m.id === id);
        
        if (!media) {
            return res.status(404).json({
                success: false,
                error: 'Media not found'
            });
        }
        
        let isPurchased = false;
        if (userId) {
            const purchases = readDB(PURCHASES_DB_PATH);
            isPurchased = purchases[userId]?.includes(id) || false;
        }
        
        const response = {
            ...media,
            isPurchased: isPurchased,
            fileUrl: isPurchased ? media.fileUrl : null
        };
        
        if (isPurchased) {
            media.views = (media.views || 0) + 1;
            writeDB(MEDIA_DB_PATH, mediaDB);
        }
        
        res.json({
            success: true,
            data: response
        });
    } catch (error) {
        console.error('Error fetching media:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== AUTO-PURCHASE FREE CONTENT ====================
app.post('/api/auto-purchase-free', async (req, res) => {
    try {
        const { userId, mediaId } = req.body;
        
        console.log(`🎁 Auto-purchasing free content: User ${userId} -> Media ${mediaId}`);
        
        if (!userId || !mediaId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and Media ID required'
            });
        }
        
        const mediaDB = readDB(MEDIA_DB_PATH);
        const media = mediaDB.find(m => m.id === mediaId);
        
        if (!media) {
            return res.status(404).json({
                success: false,
                error: 'Media not found'
            });
        }
        
        // Check if it's free
        if (!media.isFree) {
            return res.status(400).json({
                success: false,
                error: 'This is not free content'
            });
        }
        
        // Check if already purchased
        const purchases = readDB(PURCHASES_DB_PATH);
        if (purchases[userId]?.includes(mediaId)) {
            return res.status(400).json({
                success: false,
                error: 'Already purchased'
            });
        }
        
        // Add to purchases
        if (!purchases[userId]) {
            purchases[userId] = [];
        }
        purchases[userId].push(mediaId);
        writeDB(PURCHASES_DB_PATH, purchases);
        
        // Update media purchase count
        media.purchases = (media.purchases || 0) + 1;
        writeDB(MEDIA_DB_PATH, mediaDB);
        
        console.log(`✅ Free content auto-purchased for user ${userId}`);
        
        res.json({
            success: true,
            message: 'Free content unlocked!',
            mediaId: mediaId
        });
        
    } catch (error) {
        console.error('Auto-purchase error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== REQUEST PURCHASE (Paid) ====================
app.post('/api/request-purchase', async (req, res) => {
    try {
        const { userId, mediaId, screenshot, filename } = req.body;
        
        console.log(`💳 Purchase request: User ${userId} -> Media ${mediaId}`);
        
        if (!userId || !mediaId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and Media ID required'
            });
        }
        
        const mediaDB = readDB(MEDIA_DB_PATH);
        const media = mediaDB.find(m => m.id === mediaId);
        
        if (!media) {
            return res.status(404).json({
                success: false,
                error: 'Media not found'
            });
        }
        
        // Check if already purchased
        const purchases = readDB(PURCHASES_DB_PATH);
        if (purchases[userId]?.includes(mediaId)) {
            return res.status(400).json({
                success: false,
                error: 'Already purchased'
            });
        }
        
        // Check if already pending
        const pending = readDB(PENDING_DB_PATH);
        const existing = pending.find(p => p.userId === userId && p.mediaId === mediaId);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Already pending approval'
            });
        }
        
        // Get user info
        const users = readDB(USERS_DB_PATH);
        const user = users[userId] || { username: 'Unknown', firstName: 'User' };
        
        // Create pending request
        const request = {
            id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            userId: userId,
            username: user.username || 'Unknown',
            firstName: user.firstName || 'User',
            mediaId: mediaId,
            mediaTitle: media.title,
            amount: media.price || 5.00,
            screenshot: screenshot || null,
            filename: filename || 'screenshot.jpg',
            date: new Date().toISOString(),
            status: 'pending'
        };
        
        pending.push(request);
        writeDB(PENDING_DB_PATH, pending);
        
        // Notify all admins
        for (const adminId of ADMIN_IDS) {
            try {
                const { bot } = require('./bot');
                
                let message = 
                    `🆕 **New Purchase Request!**\n\n` +
                    `👤 User: @${user.username || 'Unknown'}\n` +
                    `📌 Media: *${media.title}*\n` +
                    `💰 Amount: $${(media.price || 5.00).toFixed(2)}\n` +
                    `🆔 Request ID: *${request.id}*\n\n` +
                    `Use /approve ${request.id} to approve\n` +
                    `Use /reject ${request.id} to reject`;
                
                if (screenshot) {
                    await bot.telegram.sendPhoto(
                        adminId,
                        { source: Buffer.from(screenshot.split(',')[1], 'base64') },
                        { caption: message, parse_mode: 'Markdown' }
                    );
                } else {
                    await bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' });
                }
                
                console.log(`✅ Admin ${adminId} notified`);
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        }
        
        res.json({
            success: true,
            message: 'Purchase request sent for approval',
            requestId: request.id,
            media: {
                title: media.title,
                price: media.price || 5.00
            }
        });
        
    } catch (error) {
        console.error('Request purchase error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== CHECK PENDING STATUS ====================
app.get('/api/pending-status/:userId/:mediaId', (req, res) => {
    try {
        const { userId, mediaId } = req.params;
        const pending = readDB(PENDING_DB_PATH);
        const request = pending.find(p => p.userId === userId && p.mediaId === mediaId);
        
        res.json({
            success: true,
            isPending: !!request,
            request: request || null
        });
    } catch (error) {
        console.error('Error checking pending:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== GET USER'S PENDING ====================
app.get('/api/my-pending/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const pending = readDB(PENDING_DB_PATH);
        const userPending = pending.filter(p => p.userId === userId);
        
        res.json({
            success: true,
            count: userPending.length,
            data: userPending
        });
    } catch (error) {
        console.error('Error fetching pending:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== GET USER'S PURCHASES ====================
app.get('/api/my-purchases/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const purchases = readDB(PURCHASES_DB_PATH);
        const userPurchases = purchases[userId] || [];
        
        const mediaDB = readDB(MEDIA_DB_PATH);
        const purchasedMedia = mediaDB
            .filter(m => userPurchases.includes(m.id))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({
            success: true,
            count: purchasedMedia.length,
            data: purchasedMedia
        });
    } catch (error) {
        console.error('Error fetching purchases:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== ADMIN ROUTES ====================
const isAdmin = (req, res, next) => {
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
    const userId = req.headers['x-user-id'] || req.query.userId;
    
    if (!userId || !adminIds.includes(userId)) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized. Admin access required.'
        });
    }
    next();
};

app.get('/api/admin/pending', isAdmin, (req, res) => {
    try {
        const pending = readDB(PENDING_DB_PATH);
        res.json({
            success: true,
            count: pending.length,
            data: pending.sort((a, b) => new Date(b.date) - new Date(a.date))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/stats', isAdmin, (req, res) => {
    try {
        const mediaDB = readDB(MEDIA_DB_PATH);
        const purchases = readDB(PURCHASES_DB_PATH);
        const pending = readDB(PENDING_DB_PATH);
        
        let totalRevenue = 0;
        let totalPurchases = 0;
        
        mediaDB.forEach(media => {
            const count = media.purchases || 0;
            if (!media.isFree) {
                totalRevenue += count * (media.price || 0);
            }
            totalPurchases += count;
        });
        
        const uniqueUsers = Object.keys(purchases).length;
        
        res.json({
            success: true,
            data: {
                totalMedia: mediaDB.length,
                totalPurchases: totalPurchases,
                totalRevenue: totalRevenue,
                uniqueUsers: uniqueUsers,
                pendingCount: pending.length,
                freeItems: mediaDB.filter(m => m.isFree).length,
                paidItems: mediaDB.filter(m => !m.isFree).length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== 404 HANDLER ====================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.url}`
    });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.stack);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Database: ${DB_DIR}`);
    console.log(`👑 Admins: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'None!'}`);
    console.log(`🔍 Debug: /api/debug/db`);
    console.log(`🔧 Fix: /api/fix-media`);
    console.log('='.repeat(50));
});

startBot().catch(error => {
    console.error('❌ Bot error (server still running):', error.message);
});

module.exports = { app };
