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

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    const mediaDB = readDB(MEDIA_DB_PATH);
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        mediaCount: mediaDB.length,
        admins: ADMIN_IDS || []
    });
});

// Debug - See all media in database
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
                    isFree: m.isFree,
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

// Get all media
app.get('/api/media', (req, res) => {
    try {
        const { userId } = req.query;
        console.log(`📸 Fetching media for user: ${userId || 'anonymous'}`);
        
        const mediaDB = readDB(MEDIA_DB_PATH);
        const purchases = readDB(PURCHASES_DB_PATH);
        
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

// Get single media
app.get('/api/media/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;
        
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

// Request purchase
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
        console.error('Error checking pending:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get user's pending
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
        console.error('Error fetching purchases:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Database: ${DB_DIR}`);
    console.log(`👑 Admins: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'None!'}`);
    console.log(`🔍 Debug: /api/debug/db`);
    console.log('='.repeat(50));
});

startBot().catch(error => {
    console.error('❌ Bot error:', error.message);
});

module.exports = { app };
