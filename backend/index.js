require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Import bot
require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*'
}));
app.use(express.json());
app.use(express.static('public'));

// Database path
const MEDIA_DB_PATH = path.join(__dirname, 'database', 'media.json');

// Helper functions
const readMediaDB = () => {
  try {
    const data = fs.readFileSync(MEDIA_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

// API Routes

// Get all approved media
app.get('/api/media', (req, res) => {
  try {
    const mediaDB = readMediaDB();
    // In production, check if user has paid here
    const approvedMedia = mediaDB.filter(item => item.approved === true);
    res.json({
      success: true,
      count: approvedMedia.length,
      data: approvedMedia
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single media by ID
app.get('/api/media/:id', (req, res) => {
  try {
    const mediaDB = readMediaDB();
    const media = mediaDB.find(item => item.id === req.params.id);
    
    if (!media) {
      return res.status(404).json({
        success: false,
        error: 'Media not found'
      });
    }
    
    res.json({
      success: true,
      data: media
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint for Telegram (optional)
app.post('/webhook', (req, res) => {
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📸 Media API: http://localhost:${PORT}/api/media`);
});
