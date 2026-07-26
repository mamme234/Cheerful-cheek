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
const readDB = (filePath, defaultData) => {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            console.log(`📄 Created new file: ${path.basename(filePath)}`);
            return defaultData;
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${path.basename(filePath)}:`, error);
        return defaultData;
    }
};

const writeDB = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`💾 Saved to ${path.basename(filePath)}`);
        return true;
    } catch (error) {
        console.error(`Error writing ${path.basename(filePath)}:`, error);
        return false;
    }
};

// ==================== INITIALIZE WITH SAMPLE DATA ====================
function initializeDatabase() {
    console.log('🔧 Initializing database...');
    
    let mediaDB = readDB(MEDIA_DB_PATH, []);
    if (mediaDB.length === 0) {
        console.log('📸 Adding sample media...');
        mediaDB = [
            {
                id: `media_${Date.now()}_1`,
                type: 'photo',
                fileId: 'sample_1',
                fileUrl: 'https://picsum.photos/400/400?random=1',
                title: '🎉 Welcome to Premium Gallery',
                description: 'This is a sample photo. Upload your own content using /upload',
                price: 5.00,
                isFree: false,
                date: new Date().toISOString(),
                views: 0,
                purchases: 0,
                approved: true,
                uploadedBy: 123456789
            },
            {
                id: `media_${Date.now()}_2`,
                type: 'photo',
                fileId: 'sample_2',
                fileUrl: 'https://picsum.photos/400/400?random=2',
                title: '🎁 Free Sample Content',
                description: 'This content is free for everyone to enjoy!',
                price: 0,
                isFree: true,
                date: new Date().toISOString(),
                views: 0,
                purchases: 0,
                approved: true,
                uploadedBy: 123456789
            },
            {
                id: `media_${Date.now()}_3`,
                type: 'photo',
                fileId: 'sample_3',
                fileUrl: 'https://picsum.photos/400/400?random=3',
                title: '🔒 Premium Content',
                description: 'Purchase this to unlock premium content',
                price: 3.00,
                isFree: false,
                date: new Date().toISOString(),
                views: 0,
                purchases: 0,
                approved: true,
                uploadedBy: 123456789
            }
        ];
        writeDB(MEDIA_DB_PATH, mediaDB);
        console.log(`✅ Added ${mediaDB.length} sample items`);
    }
}

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

// ==================== ROOT ROUTE ====================
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Premium Gallery API is running!',
        endpoints: {
            health: '/api/health',
            media: '/api/media',
            debug: '/api/debug/db',
            fix: '/api/fix-media'
        },
        timestamp: new Date().toISOString()
    });
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    const mediaDB = readDB(MEDIA_DB_PATH, []);
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        mediaCount: mediaDB.length,
        database: 'JSON Files',
        admins: ADMIN_IDS || []
    });
});

// ==================== DEBUG ====================
app.get('/api/debug/db', (req, res) => {
    try {
        const mediaDB = readDB(MEDIA_DB_PATH, []);
        const purchases = readDB(PURCHASES_DB_PATH, {});
        const pending = readDB(PENDING_DB_PATH, []);
        const users = readDB(USERS_DB_PATH, {});
        
        res.json({
            success: true,
            data: {
                mediaCount: mediaDB.length,
                media: mediaDB.map(m => ({
                    id: m.id,
                    title: m.title,
                    type: m.type,
                    price: m.price,
                    isFree: m.isFree,
                    date: m.date
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
        
        const mediaDB = readDB(MEDIA_DB_PATH, []);
        const purchases = readDB(PURCHASES_DB_PATH, {});
        
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
        
        const mediaDB = readDB(MEDIA_DB_PATH, []);
        const media = mediaDB.find(m => m.id === id);
        
        if (!media) {
            return res.status(404).json({
                success: false,
                error: 'Media not found'
            });
        }
        
        let isPurchased = false;
        if (userId) {
            const purchases = readDB(PURCHASES_DB_PATH, {});
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
app.post('/api/auto-purchase-free', (req, res) => {
    try {
        const { userId, mediaId } = req.body;
        
        if (!userId || !mediaId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and Media ID required'
            });
        }
        
        const mediaDB = readDB(MEDIA_DB_PATH, []);
        const media = mediaDB.find(m => m.id === mediaId);
        
        if (!media) {
            return res.status(404).json({
                success: false,
                error: 'Media not found'
            });
        }
        
        if (!media.isFree) {
            return res.status(400).json({
                success: false,
                error: 'This is not free content'
            });
        }
        
        let purchases = readDB(PURCHASES_DB_PATH, {});
        if (purchases[userId]?.includes(mediaId)) {
            return res.status(400).json({
                success: false,
                error: 'Already purchased'
            });
        }
        
        if (!purchases[userId]) {
            purchases[userId] = [];
        }
        purchases[userId].push(mediaId);
        writeDB(PURCHASES_DB_PATH, purchases);
        
        media.purchases = (media.purchases || 0) + 1;
        writeDB(MEDIA_DB_PATH, mediaDB);
        
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

// ==================== REQUEST PURCHASE ====================
app.post('/api/request-purchase', (req, res) => {
    try {
        const { userId, mediaId, screenshot, filename } = req.body;
        
        if (!userId || !mediaId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and Media ID required'
            });
        }
        
        const mediaDB = readDB(MEDIA_DB_PATH, []);
        const media = mediaDB.find(m => m.id === mediaId);
        
        if (!media) {
            return res.status(404).json({
                success: false,
                error: 'Media not found'
            });
        }
        
        let purchases = readDB(PURCHASES_DB_PATH, {});
        if (purchases[userId]?.includes(mediaId)) {
            return res.status(400).json({
                success: false,
                error: 'Already purchased'
            });
        }
        
        let pending = readDB(PENDING_DB_PATH, []);
        const existing = pending.find(p => p.userId === userId && p.mediaId === mediaId);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Already pending approval'
            });
        }
        
        const users = readDB(USERS_DB_PATH, {});
        const user = users[userId] || { username: 'Unknown', firstName: 'User' };
        
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
        
        // Notify admins
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
                    try {
                        await bot.telegram.sendPhoto(
                            adminId,
                            { source: Buffer.from(screenshot.split(',')[1], 'base64') },
                            { caption: message, parse_mode: 'Markdown' }
                        );
                    } catch {
                        await bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' });
                    }
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
            requestId: request.id
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
        const pending = readDB(PENDING_DB_PATH, []);
        const request = pending.find(p => p.userId === userId && p.mediaId === mediaId);
        
        res.json({
            success: true,
            isPending: !!request,
            request: request || null
        });
    } catch (error) {
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
        const pending = readDB(PENDING_DB_PATH, []);
        const userPending = pending.filter(p => p.userId === userId);
        
        res.json({
            success: true,
            count: userPending.length,
            data: userPending
        });
    } catch (error) {
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
        const purchases = readDB(PURCHASES_DB_PATH, {});
        const userPurchases = purchases[userId] || [];
        
        const mediaDB = readDB(MEDIA_DB_PATH, []);
        const purchasedMedia = mediaDB
            .filter(m => userPurchases.includes(m.id))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({
            success: true,
            count: purchasedMedia.length,
            data: purchasedMedia
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== FIX MEDIA ====================
app.get('/api/fix-media', (req, res) => {
    try {
        const mediaDB = readDB(MEDIA_DB_PATH, []);
        let updated = 0;
        
        mediaDB.forEach(item => {
            if (item.isFree === undefined) {
                const isFree = (item.price === 0 || item.price === '0' || item.price === 'free');
                item.isFree = isFree;
                updated++;
            }
        });
        
        writeDB(MEDIA_DB_PATH, mediaDB);
        
        res.json({
            success: true,
            message: `Updated ${updated} media items`,
            totalMedia: mediaDB.length
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
function startServer() {
    initializeDatabase();
    
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
}

startServer();

module.exports = { app };
