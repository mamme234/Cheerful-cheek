require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, GridFSBucket } = require('mongodb');
const { startBot, ADMIN_IDS } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MONGODB SETUP ====================
const MONGODB_URI = process.env.MONGODB_URI;
let db = null;
let mediaCollection = null;
let usersCollection = null;
let pendingCollection = null;
let purchasesCollection = null;
let bucket = null;

async function connectDB() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is not set in environment variables!');
        console.log('📌 Get your MongoDB URI from: https://cloud.mongodb.com');
        process.exit(1);
    }

    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ Connected to MongoDB Atlas');
        
        db = client.db('premium_gallery');
        mediaCollection = db.collection('media');
        usersCollection = db.collection('users');
        pendingCollection = db.collection('pending');
        purchasesCollection = db.collection('purchases');
        
        // Setup GridFS for file storage
        bucket = new GridFSBucket(db, { bucketName: 'uploads' });
        
        // Create indexes
        await mediaCollection.createIndex({ id: 1 }, { unique: true });
        await usersCollection.createIndex({ id: 1 }, { unique: true });
        await pendingCollection.createIndex({ id: 1 }, { unique: true });
        
        console.log('✅ Database collections ready');
        console.log('✅ GridFS ready for file storage');
        
        // Add sample data if empty
        const count = await mediaCollection.countDocuments();
        if (count === 0) {
            console.log('📸 Adding sample data...');
            await addSampleData();
        }
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        return false;
    }
}

async function addSampleData() {
    try {
        const sampleMedia = [
            {
                id: `media_${Date.now()}_1`,
                type: 'photo',
                fileId: 'sample_1',
                fileUrl: 'https://picsum.photos/400/400?random=1',
                title: '🎉 Welcome to Premium Gallery',
                description: 'Sample content - use /upload to add your own',
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
                title: '🎁 Free Sample',
                description: 'This content is free!',
                price: 0,
                isFree: true,
                date: new Date().toISOString(),
                views: 0,
                purchases: 0,
                approved: true,
                uploadedBy: 123456789
            }
        ];
        
        await mediaCollection.insertMany(sampleMedia);
        console.log(`✅ Added ${sampleMedia.length} sample items to database`);
    } catch (error) {
        console.error('Error adding sample data:', error);
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
app.get('/api/health', async (req, res) => {
    try {
        const count = await mediaCollection.countDocuments();
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            mediaCount: count,
            database: 'MongoDB Atlas with GridFS',
            admins: ADMIN_IDS || []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== DEBUG ====================
app.get('/api/debug/db', async (req, res) => {
    try {
        const media = await mediaCollection.find({}).toArray();
        const purchases = await purchasesCollection.find({}).toArray();
        const pending = await pendingCollection.find({}).toArray();
        const users = await usersCollection.find({}).toArray();
        
        res.json({
            success: true,
            data: {
                mediaCount: media.length,
                media: media.map(m => ({
                    id: m.id,
                    title: m.title,
                    type: m.type,
                    price: m.price,
                    isFree: m.isFree,
                    fileUrl: m.fileUrl ? 'stored' : 'missing',
                    date: m.date
                })),
                purchaseCount: purchases.length,
                pendingCount: pending.length,
                userCount: users.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== GET ALL MEDIA ====================
app.get('/api/media', async (req, res) => {
    try {
        const { userId } = req.query;
        console.log(`📸 Fetching media for user: ${userId || 'anonymous'}`);
        
        const media = await mediaCollection.find({ approved: true }).toArray();
        
        const userPurchases = [];
        if (userId) {
            const purchases = await purchasesCollection.findOne({ userId: userId });
            if (purchases) {
                userPurchases.push(...purchases.mediaIds);
            }
        }
        
        const mediaWithStatus = media.map(item => ({
            ...item,
            isPurchased: userPurchases.includes(item.id)
        }));
        
        mediaWithStatus.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log(`✅ Returning ${mediaWithStatus.length} media items`);
        
        res.json({
            success: true,
            count: mediaWithStatus.length,
            data: mediaWithStatus
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
app.get('/api/media/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;
        
        const media = await mediaCollection.findOne({ id: id });
        
        if (!media) {
            return res.status(404).json({
                success: false,
                error: 'Media not found'
            });
        }
        
        let isPurchased = false;
        if (userId) {
            const purchases = await purchasesCollection.findOne({ userId: userId });
            if (purchases) {
                isPurchased = purchases.mediaIds.includes(id);
            }
        }
        
        const response = {
            ...media,
            isPurchased: isPurchased,
            fileUrl: isPurchased ? media.fileUrl : null
        };
        
        if (isPurchased) {
            await mediaCollection.updateOne(
                { id: id },
                { $inc: { views: 1 } }
            );
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
        
        if (!userId || !mediaId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and Media ID required'
            });
        }
        
        const media = await mediaCollection.findOne({ id: mediaId });
        
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
        
        const existingPurchase = await purchasesCollection.findOne({ userId: userId });
        if (existingPurchase && existingPurchase.mediaIds.includes(mediaId)) {
            return res.status(400).json({
                success: false,
                error: 'Already purchased'
            });
        }
        
        if (existingPurchase) {
            await purchasesCollection.updateOne(
                { userId: userId },
                { $addToSet: { mediaIds: mediaId } }
            );
        } else {
            await purchasesCollection.insertOne({
                userId: userId,
                mediaIds: [mediaId],
                date: new Date().toISOString()
            });
        }
        
        await mediaCollection.updateOne(
            { id: mediaId },
            { $inc: { purchases: 1 } }
        );
        
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
app.post('/api/request-purchase', async (req, res) => {
    try {
        const { userId, mediaId, screenshot, filename } = req.body;
        
        if (!userId || !mediaId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and Media ID required'
            });
        }
        
        const media = await mediaCollection.findOne({ id: mediaId });
        
        if (!media) {
            return res.status(404).json({
                success: false,
                error: 'Media not found'
            });
        }
        
        const existingPurchase = await purchasesCollection.findOne({ userId: userId });
        if (existingPurchase && existingPurchase.mediaIds.includes(mediaId)) {
            return res.status(400).json({
                success: false,
                error: 'Already purchased'
            });
        }
        
        const existingPending = await pendingCollection.findOne({ 
            userId: userId, 
            mediaId: mediaId 
        });
        if (existingPending) {
            return res.status(400).json({
                success: false,
                error: 'Already pending approval'
            });
        }
        
        const user = await usersCollection.findOne({ id: userId });
        
        const request = {
            id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            userId: userId,
            username: user?.username || 'Unknown',
            firstName: user?.firstName || 'User',
            mediaId: mediaId,
            mediaTitle: media.title,
            amount: media.price || 5.00,
            screenshot: screenshot || null,
            filename: filename || 'screenshot.jpg',
            date: new Date().toISOString(),
            status: 'pending'
        };
        
        await pendingCollection.insertOne(request);
        
        for (const adminId of ADMIN_IDS) {
            try {
                const { bot } = require('./bot');
                
                let message = 
                    `🆕 **New Purchase Request!**\n\n` +
                    `👤 User: @${user?.username || 'Unknown'}\n` +
                    `📌 Media: *${media.title}*\n` +
                    `💰 Amount: $${(media.price || 5.00).toFixed(2)}\n` +
                    `🆔 Request ID: *${request.id}*\n\n` +
                    `Use /approve ${request.id} to approve\n` +
                    `Use /reject ${request.id} to reject`;
                
                bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' })
                    .then(() => console.log(`✅ Admin ${adminId} notified`))
                    .catch((err) => console.error(`Failed to notify admin ${adminId}:`, err.message));
                
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
app.get('/api/pending-status/:userId/:mediaId', async (req, res) => {
    try {
        const { userId, mediaId } = req.params;
        const request = await pendingCollection.findOne({ 
            userId: userId, 
            mediaId: mediaId 
        });
        
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
app.get('/api/my-pending/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const pending = await pendingCollection.find({ userId: userId }).toArray();
        
        res.json({
            success: true,
            count: pending.length,
            data: pending
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== GET USER'S PURCHASES ====================
app.get('/api/my-purchases/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const purchases = await purchasesCollection.findOne({ userId: userId });
        const purchasedIds = purchases?.mediaIds || [];
        
        const media = await mediaCollection
            .find({ id: { $in: purchasedIds } })
            .toArray();
        
        res.json({
            success: true,
            count: media.length,
            data: media.sort((a, b) => new Date(b.date) - new Date(a.date))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== FIX MEDIA ====================
app.get('/api/fix-media', async (req, res) => {
    try {
        const media = await mediaCollection.find({}).toArray();
        let updated = 0;
        
        for (const item of media) {
            if (item.isFree === undefined) {
                const isFree = (item.price === 0 || item.price === '0' || item.price === 'free');
                await mediaCollection.updateOne(
                    { id: item.id },
                    { $set: { isFree: isFree } }
                );
                updated++;
            }
        }
        
        res.json({
            success: true,
            message: `Updated ${updated} media items`,
            totalMedia: media.length
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
async function startServer() {
    const dbConnected = await connectDB();
    
    if (!dbConnected) {
        console.error('❌ Failed to connect to MongoDB. Server will not start.');
        process.exit(1);
    }
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log('='.repeat(50));
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📁 Database: MongoDB Atlas with GridFS`);
        console.log(`👑 Admins: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'None!'}`);
        console.log(`🔍 Debug: /api/debug/db`);
        console.log('='.repeat(50));
    });
    
    startBot().catch(error => {
        console.error('❌ Bot error (server still running):', error.message);
    });
}

startServer();

module.exports = { app };
