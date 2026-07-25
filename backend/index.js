require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // If file doesn't exist, create with default data
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
    // Ensure directory exists
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

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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
    
    // Sort by date (newest first)
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
    
    // Check if user has purchased
    let isPurchased = false;
    if (userId) {
      const purchases = readDB(PURCHASES_DB_PATH);
      isPurchased = purchases[userId]?.includes(id) || false;
    }
    
    // Only return file URL if purchased
    const response = {
      ...media,
      isPurchased: isPurchased,
      fileUrl: isPurchased ? media.fileUrl : null
    };
    
    // Increment view count if purchased
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

// Request purchase (user clicks buy)
app.post('/api/request-purchase', async (req, res) => {
  try {
    const { userId, mediaId } = req.body;
    
    if (!userId || !mediaId) {
      return res.status(400).json({
        success: false,
        error: 'User ID and Media ID required'
      });
    }
    
    // Get media details
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
    const user = users[userId] || { username: 'Unknown' };
    
    // Create pending request
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
    
    // Notify admin via Telegram (if bot is available)
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
      // Continue even if admin notification fails
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
    console.error('Error checking pending status:', error);
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

// Check multiple purchase statuses
app.post('/api/check-purchases', (req, res) => {
  try {
    const { userId, mediaIds } = req.body;
    
    if (!userId || !mediaIds || !Array.isArray(mediaIds)) {
      return res.status(400).json({
        success: false,
        error: 'User ID and mediaIds array required'
      });
    }
    
    const purchases = readDB(PURCHASES_DB_PATH);
    const userPurchases = purchases[userId] || [];
    
    const status = {};
    mediaIds.forEach(id => {
      status[id] = userPurchases.includes(id);
    });
    
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error('Error checking purchases:', error);
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
    
    // Get purchase stats
    const purchases = readDB(PURCHASES_DB_PATH);
    const userPurchases = purchases[userId] || [];
    
    // Get pending stats
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
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ADMIN API ROUTES (Protected) ====================

// Check if user is admin
const isAdmin = (req, res, next) => {
  const adminId = process.env.ADMIN_ID;
  const userId = req.headers['x-user-id'];
  
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
    console.error('Error fetching pending:', error);
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
    
    // Add stats to each user
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
    console.error('Error fetching users:', error);
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
    
    // Calculate total revenue
    let totalRevenue = 0;
    let totalPurchases = 0;
    
    mediaDB.forEach(media => {
      totalRevenue += (media.purchases || 0) * media.price;
      totalPurchases += (media.purchases || 0);
    });
    
    // Count unique users
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
    console.error('Error fetching stats:', error);
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
    error: 'Route not found'
  });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📸 Media API: https://cheerful-cheek.onrender.com:${PORT}/api/media`);
  console.log(`💚 Health check: https://cheerful-cheek.onrender.com:${PORT}/api/health`);
});

// Start the bot after server is running
startBot().catch(error => {
  console.error('❌ Bot startup error:', error.message);
  console.log('⚠️  Server is running but bot failed to start.');
  console.log('   Check your BOT_TOKEN in .env file');
});

// ==================== EXPORTS ====================
module.exports = { app };
