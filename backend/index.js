require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { startBot } = require('./bot');

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
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Get all media with purchase status
app.get('/api/media', (req, res) => {
  try {
    const { userId } = req.query;
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

// Get single media by ID
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
    const { userId, mediaId } = req.body;
    
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
      amount: media.price,
      date: new Date().toISOString(),
      status: 'pending'
    };
    
    pending.push(request);
    writeDB(PENDING_DB_PATH, pending);
    
    try {
      const ADMIN_ID = process.env.ADMIN_ID;
      if (ADMIN_ID) {
        const { bot } = require('./bot');
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `🆕 New Purchase Request!\n\n` +
          `👤 User: @${user.username || 'Unknown'}\n` +
          `📌 Media: ${media.title}\n` +
          `💰 Amount: $${media.price.toFixed(2)}\n` +
          `🆔 Request ID: ${request.id}\n\n` +
          `Use /approve ${request.id} to approve\n` +
          `Use /reject ${request.id} to reject`
        );
      }
    } catch (error) {
      console.error('Failed to notify admin:', error);
    }
    
    res.json({
      success: true,
      message: 'Purchase request sent for approval',
      requestId: request.id,
      media: {
        title: media.title,
        price: media.price
      },
      adminPaypal: process.env.ADMIN_PAYPAL_LINK || 'https://paypal.me/yourusername'
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
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📸 Media API: http://localhost:${PORT}/api/media`);
  console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
});

// Start the bot
startBot().catch(error => {
  console.error('❌ Bot startup error:', error.message);
});

module.exports = { app };
