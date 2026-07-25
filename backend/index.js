require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Import bot (with error handling)
let botModule;
try {
    botModule = require('./bot');
} catch (error) {
    console.error('⚠️ Bot module load error:', error.message);
    botModule = null;
}

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== DATABASE PATHS ====================
const MEDIA_DB_PATH = path.join(__dirname, 'database', 'media.json');
const USERS_DB_PATH = path.join(__dirname, 'database', 'users.json');
const PENDING_DB_PATH = path.join(__dirname, 'database', 'pending.json');
const PURCHASES_DB_PATH = path.join(__dirname, 'database', 'purchases.json');

// ==================== DATABASE HELPERS ====================
const readDB = (filePath) => {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        if (!fs.existsSync(filePath)) {
            const initialData = filePath.includes('media') ? [] : 
                               filePath.includes('pending') ? [] : {};
            fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return filePath.includes('media') ? [] : 
               filePath.includes('pending') ? [] : {};
    }
};

const writeDB = (filePath, data) => {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error);
    }
};

// ==================== MIDDLEWARE ====================
// CORS - Allow all origins for testing
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`📡 ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        botStatus: botModule ? 'loaded' : 'not_loaded'
    });
});

// Get all media with purchase status
app.get('/api/media', (req, res) => {
    try {
        const { userId } = req.query;
        console.log(`📸 Fetching media for user: ${userId || 'anonymous'}`);
        
        const mediaDB = readDB(MEDIA_DB_PATH);
        const purchases = readDB(PURCHASES_DB_PATH);
        
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
        console.error('❌ Error fetching media:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single media by ID
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
        console.error('❌ Error fetching media:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Request purchase
app.post('/api/request-purchase', async (req, res) => {
    try {
        const { userId, mediaId } = req.body;
        
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
        
        const purchases = readDB(PURCHASES_DB_PATH);
        if (purchases[userId]?.includes(mediaId)) {
            return res.status(400).json({
                success: false,
                error: 'Already purchased'
            });
        }
        
        const pending = readDB(PENDING_DB_PATH);
        const existing = pending.find(p => p.userId === userId && p.mediaId === mediaId);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Already pending approval'
            });
        }
        
        const users = readDB(USERS_DB_PATH);
        const user = users[userId] || { username: 'Unknown' };
        
        const request = {
            id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            userId: userId,
            username: user.username || 'Unknown',
            firstName: user.firstName || 'User',
            mediaId: mediaId,
            mediaTitle: media.title,
            amount: media.price || 5.00,
            date: new Date().toISOString(),
            status: 'pending'
        };
        
        pending.push(request);
        writeDB(PENDING_DB_PATH, pending);
        
        // Try to notify admin (non-blocking)
        try {
            const ADMIN_ID = process.env.ADMIN_ID;
            if (ADMIN_ID && botModule && botModule.bot) {
                await botModule.bot.telegram.sendMessage(
                    ADMIN_ID,
                    `🆕 New Purchase Request!\n\n` +
                    `👤 User: @${user.username || 'Unknown'}\n` +
                    `📌 Media: ${media.title}\n` +
                    `💰 Amount: $${(media.price || 5.00).toFixed(2)}\n` +
                    `🆔 Request ID: ${request.id}\n\n` +
                    `Use /approve ${request.id} to approve\n` +
                    `Use /reject ${request.id} to reject`
                );
                console.log('✅ Admin notified');
            } else {
                console.log('⚠️ Admin notification skipped (bot not available)');
            }
        } catch (error) {
            console.error('⚠️ Failed to notify admin:', error.message);
        }
        
        console.log(`✅ Purchase request created: ${request.id}`);
        
        res.json({
            success: true,
            message: 'Purchase request sent for approval',
            requestId: request.id,
            media: {
                title: media.title,
                price: media.price || 5.00
            },
            adminPaypal: process.env.ADMIN_PAYPAL_LINK || 'https://paypal.me/yourusername'
        });
        
    } catch (error) {
        console.error('❌ Request purchase error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Check pending status
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
        console.error('❌ Error checking pending:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get user's pending requests
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
        console.error('❌ Error fetching pending:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get user's purchases
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
        console.error('❌ Error fetching purchases:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get user info
app.get('/api/user/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const users = readDB(USERS_DB_PATH);
        const user = users[userId];
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const purchases = readDB(PURCHASES_DB_PATH);
        const userPurchases = purchases[userId] || [];
        
        const pending = readDB(PENDING_DB_PATH);
        const userPending = pending.filter(p => p.userId === userId);
        
        res.json({
            success: true,
            data: {
                ...user,
                purchaseCount: userPurchases.length,
                pendingCount: userPending.length
            }
        });
    } catch (error) {
        console.error('❌ Error fetching user:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== ADMIN API ROUTES ====================

// Check if user is admin
const isAdmin = (req, res, next) => {
    const adminId = process.env.ADMIN_ID;
    const userId = req.headers['x-user-id'] || req.query.userId;
    
    if (!userId || userId !== adminId) {
        return res.status(403).json({
            success: false,
            error: 'Unauthorized. Admin access required.'
        });
    }
    next();
};

// Get all pending requests (admin only)
app.get('/api/admin/pending', isAdmin, (req, res) => {
    try {
        const pending = readDB(PENDING_DB_PATH);
        res.json({
            success: true,
            count: pending.length,
            data: pending.sort((a, b) => new Date(b.date) - new Date(a.date))
        });
    } catch (error) {
        console.error('❌ Error fetching pending:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all users (admin only)
app.get('/api/admin/users', isAdmin, (req, res) => {
    try {
        const users = readDB(USERS_DB_PATH);
        const purchases = readDB(PURCHASES_DB_PATH);
        const pending = readDB(PENDING_DB_PATH);
        
        const usersWithStats = Object.values(users).map(user => ({
            ...user,
            purchaseCount: (purchases[user.id] || []).length,
            pendingCount: pending.filter(p => p.userId === user.id).length
        }));
        
        res.json({
            success: true,
            count: usersWithStats.length,
            data: usersWithStats
        });
    } catch (error) {
        console.error('❌ Error fetching users:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get revenue stats (admin only)
app.get('/api/admin/stats', isAdmin, (req, res) => {
    try {
        const mediaDB = readDB(MEDIA_DB_PATH);
        const purchases = readDB(PURCHASES_DB_PATH);
        const pending = readDB(PENDING_DB_PATH);
        
        let totalRevenue = 0;
        let totalPurchases = 0;
        
        mediaDB.forEach(media => {
            const count = media.purchases || 0;
            totalRevenue += count * media.price;
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
                averagePrice: totalPurchases > 0 ? (totalRevenue / totalPurchases) : 0
            }
        });
    } catch (error) {
        console.error('❌ Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
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
    console.log(`📸 Media API: https://cheerful-cheek.onrender.com/api/media`);
    console.log(`💚 Health check: https://cheerful-cheek.onrender.com/api/health`);
    console.log(`🌐 CORS: Enabled for all origins`);
    console.log('='.repeat(50));
});

// ==================== START BOT (WITHOUT CRASHING) ====================
async function startBot() {
    try {
        if (botModule && botModule.startBot) {
            await botModule.startBot();
        } else if (botModule && botModule.bot) {
            await botModule.bot.launch();
            console.log('🤖 Bot started successfully!');
        } else {
            console.log('⚠️ Bot module not available - running API only');
        }
    } catch (error) {
        console.error('❌ Bot startup error (API server still running):', error.message);
        console.log('⚠️  To fix bot, check your BOT_TOKEN in .env file');
        console.log('⚠️  Bot is offline, but API server is still running.');
    }
}

// Start bot in background (don't block)
setTimeout(startBot, 1000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Shutting down...');
    process.exit(0);
});

module.exports = { app };
