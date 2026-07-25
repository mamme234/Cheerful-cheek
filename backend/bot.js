const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '@admin';
const ADMIN_PAYPAL_LINK = process.env.ADMIN_PAYPAL_LINK || 'https://paypal.me/yourusername';

const MEDIA_DB_PATH = path.join(__dirname, 'database', 'media.json');
const USERS_DB_PATH = path.join(__dirname, 'database', 'users.json');
const PENDING_DB_PATH = path.join(__dirname, 'database', 'pending.json');
const PURCHASES_DB_PATH = path.join(__dirname, 'database', 'purchases.json');

const bot = new Telegraf(BOT_TOKEN);

// Database helpers
const readDB = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return filePath.includes('media') ? [] : 
           filePath.includes('pending') ? [] : {};
  }
};

const writeDB = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Check if user has purchased specific media
const hasPurchased = (userId, mediaId) => {
  const purchases = readDB(PURCHASES_DB_PATH);
  return purchases[userId]?.includes(mediaId) || false;
};

// ==================== ADMIN COMMANDS ====================

// Admin upload command
bot.command('upload', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) {
    return ctx.reply('⛔ Only admins can upload media.');
  }
  
  ctx.reply(
    '📤 Send me a photo or video to add to the gallery.\n\n' +
    'Add a caption with format:\n' +
    '`Title | Description | Price`\n\n' +
    'Example: `Sunset Beach | Beautiful sunset view | 5.00`',
    { parse_mode: 'Markdown' }
  );
});

// Handle photo uploads
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) return ctx.reply('⛔ Admins only.');
  
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;
    const caption = ctx.message.caption || 'Untitled | No description | 5.00';
    
    // Parse caption: "Title | Description | Price"
    const parts = caption.split('|').map(s => s.trim());
    const title = parts[0] || 'Untitled';
    const description = parts[1] || 'No description';
    const price = parseFloat(parts[2]) || 5.00;
    
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    const mediaDB = readDB(MEDIA_DB_PATH);
    const newMedia = {
      id: `media_${Date.now()}`,
      type: 'photo',
      fileId: fileId,
      fileUrl: fileLink.href,
      title: title,
      description: description,
      price: price,
      date: new Date().toISOString(),
      views: 0,
      purchases: 0
    };
    
    mediaDB.push(newMedia);
    writeDB(MEDIA_DB_PATH, mediaDB);
    
    ctx.reply(
      `✅ Photo uploaded!\n\n` +
      `📌 Title: ${title}\n` +
      `📝 Description: ${description}\n` +
      `💰 Price: $${price.toFixed(2)}\n` +
      `🆔 ID: ${newMedia.id}`
    );
  } catch (error) {
    console.error('Upload error:', error);
    ctx.reply('❌ Failed to upload.');
  }
});

// Handle video uploads
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) return ctx.reply('⛔ Admins only.');
  
  try {
    const video = ctx.message.video;
    const fileId = video.file_id;
    const caption = ctx.message.caption || 'Untitled | No description | 5.00';
    
    const parts = caption.split('|').map(s => s.trim());
    const title = parts[0] || 'Untitled';
    const description = parts[1] || 'No description';
    const price = parseFloat(parts[2]) || 5.00;
    
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    const mediaDB = readDB(MEDIA_DB_PATH);
    const newMedia = {
      id: `media_${Date.now()}`,
      type: 'video',
      fileId: fileId,
      fileUrl: fileLink.href,
      title: title,
      description: description,
      duration: video.duration,
      price: price,
      date: new Date().toISOString(),
      views: 0,
      purchases: 0
    };
    
    mediaDB.push(newMedia);
    writeDB(MEDIA_DB_PATH, mediaDB);
    
    ctx.reply(
      `✅ Video uploaded!\n\n` +
      `📌 Title: ${title}\n` +
      `📝 Description: ${description}\n` +
      `💰 Price: $${price.toFixed(2)}\n` +
      `🆔 ID: ${newMedia.id}`
    );
  } catch (error) {
    console.error('Upload error:', error);
    ctx.reply('❌ Failed to upload.');
  }
});

// List all media
bot.command('list', async (ctx) => {
  const userId = ctx.from.id;
  if (userId !== ADMIN_ID) return ctx.reply('⛔ Admins only.');
  
  const mediaDB = readDB(MEDIA_DB_PATH);
  
  if (mediaDB.length === 0) {
    return ctx.reply('📭 No media uploaded.');
  }
  
  let message = `📸 Media List (${mediaDB.length} items)\n\n`;
  mediaDB.slice(-10).reverse().forEach((item, index) => {
    message += `${index + 1}. ${item.type.toUpperCase()} - ${item.title}\n`;
    message += `   💰 $${item.price} | 🛒 ${item.purchases} sold\n`;
    message += `   🆔 ${item.id}\n\n`;
  });
  
  ctx.reply(message);
});

// Delete media
bot.command('delete', async (ctx) => {
  const userId = ctx.from.id;
  if (userId !== ADMIN_ID) return ctx.reply('⛔ Admins only.');
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Usage: /delete <media_id>');
  }
  
  const mediaId = args[1];
  let mediaDB = readDB(MEDIA_DB_PATH);
  const filtered = mediaDB.filter(item => item.id !== mediaId);
  
  if (filtered.length === mediaDB.length) {
    return ctx.reply('❌ Media not found.');
  }
  
  writeDB(MEDIA_DB_PATH, filtered);
  ctx.reply('✅ Media deleted successfully!');
});

// ==================== APPROVAL COMMANDS ====================

// View pending approvals
bot.command('pending', async (ctx) => {
  const userId = ctx.from.id;
  if (userId !== ADMIN_ID) return ctx.reply('⛔ Admins only.');
  
  const pending = readDB(PENDING_DB_PATH);
  
  if (pending.length === 0) {
    return ctx.reply('📭 No pending approvals.');
  }
  
  let message = `⏳ Pending Approvals (${pending.length})\n\n`;
  pending.slice(-10).reverse().forEach((item, index) => {
    message += `${index + 1}. User: ${item.username || 'Unknown'}\n`;
    message += `   Media: ${item.mediaTitle}\n`;
    message += `   Amount: $${item.amount}\n`;
    message += `   ID: ${item.id}\n\n`;
  });
  
  ctx.reply(message);
});

// Approve purchase
bot.command('approve', async (ctx) => {
  const userId = ctx.from.id;
  if (userId !== ADMIN_ID) return ctx.reply('⛔ Admins only.');
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Usage: /approve <pending_id>\n\nGet pending IDs from /pending');
  }
  
  const pendingId = args[1];
  let pending = readDB(PENDING_DB_PATH);
  const request = pending.find(p => p.id === pendingId);
  
  if (!request) {
    return ctx.reply('❌ Pending request not found.');
  }
  
  // Add to purchases
  const purchases = readDB(PURCHASES_DB_PATH);
  if (!purchases[request.userId]) {
    purchases[request.userId] = [];
  }
  purchases[request.userId].push(request.mediaId);
  writeDB(PURCHASES_DB_PATH, purchases);
  
  // Update media purchase count
  const mediaDB = readDB(MEDIA_DB_PATH);
  const media = mediaDB.find(m => m.id === request.mediaId);
  if (media) {
    media.purchases = (media.purchases || 0) + 1;
    writeDB(MEDIA_DB_PATH, mediaDB);
  }
  
  // Remove from pending
  pending = pending.filter(p => p.id !== pendingId);
  writeDB(PENDING_DB_PATH, pending);
  
  // Notify admin
  ctx.reply(`✅ Approved!\n\nUser: ${request.username || 'Unknown'}\nMedia: ${request.mediaTitle}`);
  
  // Notify user
  try {
    await bot.telegram.sendMessage(
      request.userId,
      `✅ Your purchase has been approved!\n\n` +
      `📌 Media: ${request.mediaTitle}\n` +
      `💰 Amount: $${request.amount}\n\n` +
      `You can now view it in the gallery.`
    );
  } catch (error) {
    console.error('Failed to notify user:', error);
  }
});

// Reject purchase
bot.command('reject', async (ctx) => {
  const userId = ctx.from.id;
  if (userId !== ADMIN_ID) return ctx.reply('⛔ Admins only.');
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Usage: /reject <pending_id>\n\nGet pending IDs from /pending');
  }
  
  const pendingId = args[1];
  let pending = readDB(PENDING_DB_PATH);
  const request = pending.find(p => p.id === pendingId);
  
  if (!request) {
    return ctx.reply('❌ Pending request not found.');
  }
  
  // Remove from pending
  pending = pending.filter(p => p.id !== pendingId);
  writeDB(PENDING_DB_PATH, pending);
  
  ctx.reply(`❌ Rejected: ${request.mediaTitle}`);
  
  // Notify user
  try {
    await bot.telegram.sendMessage(
      request.userId,
      `❌ Your purchase request was rejected.\n\n` +
      `Media: ${request.mediaTitle}\n` +
      `Reason: Please contact admin ${ADMIN_USERNAME} for details.`
    );
  } catch (error) {
    console.error('Failed to notify user:', error);
  }
});

// ==================== USER COMMANDS ====================

// Start command
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const users = readDB(USERS_DB_PATH);
  
  if (!users[userId]) {
    users[userId] = {
      id: userId,
      username: ctx.from.username || 'Unknown',
      firstName: ctx.from.first_name || 'User',
      registeredAt: new Date().toISOString()
    };
    writeDB(USERS_DB_PATH, users);
  }
  
  const pending = readDB(PENDING_DB_PATH);
  const userPending = pending.filter(p => p.userId === userId);
  
  const purchases = readDB(PURCHASES_DB_PATH);
  const userPurchases = purchases[userId] || [];
  
  ctx.reply(
    `👋 Welcome ${ctx.from.first_name || 'User'}!\n\n` +
    `📸 Premium Media Gallery\n` +
    `💰 Pay per view: $${process.env.PRICE_PER_ITEM || 5.00}\n` +
    `🛒 Your purchases: ${userPurchases.length}\n` +
    `⏳ Pending approvals: ${userPending.length}\n\n` +
    `How it works:\n` +
    `1️⃣ Browse media in the gallery\n` +
    `2️⃣ Click "Buy" on any item\n` +
    `3️⃣ Pay via PayPal to ${ADMIN_USERNAME}\n` +
    `4️⃣ Admin approves → content unlocked!`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎨 Open Gallery', web_app: { url: process.env.FRONTEND_URL } }],
          [{ text: '📋 My Purchases', callback_data: 'my_purchases' }],
          [{ text: '⏳ Pending Requests', callback_data: 'my_pending' }]
        ]
      }
    }
  );
});

// My purchases
bot.action('my_purchases', async (ctx) => {
  const userId = ctx.from.id;
  const purchases = readDB(PURCHASES_DB_PATH);
  const userPurchases = purchases[userId] || [];
  
  if (userPurchases.length === 0) {
    return ctx.reply('📭 You haven\'t purchased any content yet.');
  }
  
  const mediaDB = readDB(MEDIA_DB_PATH);
  const purchasedMedia = mediaDB.filter(m => userPurchases.includes(m.id));
  
  let message = `📋 Your Purchases (${purchasedMedia.length})\n\n`;
  purchasedMedia.forEach((item, index) => {
    message += `${index + 1}. ${item.type.toUpperCase()} - ${item.title}\n`;
    message += `   💰 $${item.price}\n\n`;
  });
  
  ctx.reply(message);
});

// My pending
bot.action('my_pending', async (ctx) => {
  const userId = ctx.from.id;
  const pending = readDB(PENDING_DB_PATH);
  const userPending = pending.filter(p => p.userId === userId);
  
  if (userPending.length === 0) {
    return ctx.reply('⏳ No pending requests.');
  }
  
  let message = `⏳ Your Pending Requests (${userPending.length})\n\n`;
  userPending.forEach((item, index) => {
    message += `${index + 1}. ${item.mediaTitle}\n`;
    message += `   💰 $${item.amount}\n`;
    message += `   Status: Waiting for approval\n\n`;
  });
  
  ctx.reply(message);
});

bot.launch();
console.log('🤖 Bot is running...');

module.exports = { bot, readDB, writeDB, hasPurchased, MEDIA_DB_PATH, USERS_DB_PATH, PENDING_DB_PATH, PURCHASES_DB_PATH, ADMIN_ID };
