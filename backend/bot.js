const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '@KING_OF_ALPHA';
const ADMIN_PAYPAL_LINK = process.env.ADMIN_PAYPAL_LINK || 'https://paypal.me/yourusername';

const MEDIA_DB_PATH = path.join(__dirname, 'database', 'media.json');
const USERS_DB_PATH = path.join(__dirname, 'database', 'users.json');
const PENDING_DB_PATH = path.join(__dirname, 'database', 'pending.json');
const PURCHASES_DB_PATH = path.join(__dirname, 'database', 'purchases.json');

const bot = new Telegraf(BOT_TOKEN);

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

// ==================== UPLOAD STATE ====================
let uploadStates = {};

// ==================== ADMIN COMMANDS ====================

// Start upload flow
bot.command('upload', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) {
    return ctx.reply('⛔ Only admins can upload media.');
  }
  
  // Initialize upload state
  uploadStates[userId] = { step: 'media' };
  
  ctx.reply(
    '📤 **Step 1/4: Send Media**\n\n' +
    'Please send me the **photo** or **video** you want to upload.\n\n' +
    'You can also send it as a file.\n' +
    'Type /cancel to cancel upload.',
    { parse_mode: 'Markdown' }
  );
});

// Cancel upload
bot.command('cancel', async (ctx) => {
  const userId = ctx.from.id;
  
  if (uploadStates[userId]) {
    delete uploadStates[userId];
    ctx.reply('❌ Upload cancelled.');
  } else {
    ctx.reply('ℹ️ No active upload to cancel.');
  }
});

// Handle photo upload (Step 1)
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) return;
  if (!uploadStates[userId] || uploadStates[userId].step !== 'media') return;
  
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    uploadStates[userId].fileId = fileId;
    uploadStates[userId].fileUrl = fileLink.href;
    uploadStates[userId].type = 'photo';
    uploadStates[userId].step = 'title';
    
    ctx.reply(
      '✅ **Photo received!**\n\n' +
      '📝 **Step 2/4: Enter Title**\n\n' +
      'Send me the **title** for this content.\n' +
      'Example: `Sunset Beach View`\n\n' +
      'Type /cancel to cancel upload.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Photo upload error:', error);
    ctx.reply('❌ Failed to process photo. Please try again.');
    delete uploadStates[userId];
  }
});

// Handle video upload (Step 1)
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) return;
  if (!uploadStates[userId] || uploadStates[userId].step !== 'media') return;
  
  try {
    const video = ctx.message.video;
    const fileId = video.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    uploadStates[userId].fileId = fileId;
    uploadStates[userId].fileUrl = fileLink.href;
    uploadStates[userId].type = 'video';
    uploadStates[userId].duration = video.duration;
    uploadStates[userId].step = 'title';
    
    ctx.reply(
      '✅ **Video received!**\n\n' +
      '📝 **Step 2/4: Enter Title**\n\n' +
      'Send me the **title** for this content.\n' +
      'Example: `Amazing Nature Video`\n\n' +
      'Type /cancel to cancel upload.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Video upload error:', error);
    ctx.reply('❌ Failed to process video. Please try again.');
    delete uploadStates[userId];
  }
});

// Handle document (file) upload (Step 1)
bot.on('document', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) return;
  if (!uploadStates[userId] || uploadStates[userId].step !== 'media') return;
  
  const doc = ctx.message.document;
  const mimeType = doc.mime_type || '';
  
  // Check if it's a photo or video
  if (mimeType.startsWith('image/')) {
    try {
      const fileId = doc.file_id;
      const fileLink = await ctx.telegram.getFileLink(fileId);
      
      uploadStates[userId].fileId = fileId;
      uploadStates[userId].fileUrl = fileLink.href;
      uploadStates[userId].type = 'photo';
      uploadStates[userId].step = 'title';
      
      ctx.reply(
        '✅ **Photo file received!**\n\n' +
        '📝 **Step 2/4: Enter Title**\n\n' +
        'Send me the **title** for this content.\n' +
        'Type /cancel to cancel upload.',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Document upload error:', error);
      ctx.reply('❌ Failed to process file. Please try again.');
      delete uploadStates[userId];
    }
  } else if (mimeType.startsWith('video/')) {
    try {
      const fileId = doc.file_id;
      const fileLink = await ctx.telegram.getFileLink(fileId);
      
      uploadStates[userId].fileId = fileId;
      uploadStates[userId].fileUrl = fileLink.href;
      uploadStates[userId].type = 'video';
      uploadStates[userId].step = 'title';
      
      ctx.reply(
        '✅ **Video file received!**\n\n' +
        '📝 **Step 2/4: Enter Title**\n\n' +
        'Send me the **title** for this content.\n' +
        'Type /cancel to cancel upload.',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Document upload error:', error);
      ctx.reply('❌ Failed to process file. Please try again.');
      delete uploadStates[userId];
    }
  } else {
    ctx.reply('❌ Unsupported file type. Please send a photo or video.');
  }
});

// Handle title input (Step 2)
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  if (userId !== ADMIN_ID) return;
  if (!uploadStates[userId]) return;
  if (text.startsWith('/')) return; // Ignore commands
  
  const state = uploadStates[userId];
  
  // Step 2: Title
  if (state.step === 'title') {
    state.title = text;
    state.step = 'description';
    
    ctx.reply(
      '✅ **Title saved!**\n\n' +
      `📌 Title: *${text}*\n\n` +
      '📝 **Step 3/4: Enter Description**\n\n' +
      'Send me the **description** for this content.\n' +
      'Example: `Beautiful sunset view at the beach`\n' +
      'Or send /skip to skip description.\n\n' +
      'Type /cancel to cancel upload.',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Step 3: Description
  if (state.step === 'description') {
    state.description = text;
    state.step = 'price';
    
    ctx.reply(
      '✅ **Description saved!**\n\n' +
      `📌 Title: *${state.title}*\n` +
      `📝 Description: *${text}*\n\n` +
      '💰 **Step 4/4: Enter Price**\n\n' +
      'Send me the **price** for this content.\n' +
      'Examples:\n' +
      '• `5.00` - For paid content\n' +
      '• `free` or `0` - For free content\n\n' +
      'Type /cancel to cancel upload.',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Step 4: Price
  if (state.step === 'price') {
    let price = 0;
    let isFree = false;
    
    // Check if free
    if (text.toLowerCase() === 'free' || text === '0') {
      isFree = true;
      price = 0;
    } else {
      const parsed = parseFloat(text);
      if (isNaN(parsed) || parsed < 0) {
        ctx.reply('❌ Invalid price. Please enter a number (e.g., `5.00`) or `free`.', { parse_mode: 'Markdown' });
        return;
      }
      price = parsed;
    }
    
    // Save to database
    try {
      const mediaDB = readDB(MEDIA_DB_PATH);
      const newMedia = {
        id: `media_${Date.now()}`,
        type: state.type,
        fileId: state.fileId,
        fileUrl: state.fileUrl,
        title: state.title,
        description: state.description || 'No description',
        price: price,
        isFree: isFree,
        date: new Date().toISOString(),
        views: 0,
        purchases: 0,
        approved: true
      };
      
      mediaDB.push(newMedia);
      writeDB(MEDIA_DB_PATH, mediaDB);
      
      // Clear upload state
      delete uploadStates[userId];
      
      ctx.reply(
        `✅ **Content uploaded successfully!**\n\n` +
        `📌 Title: *${newMedia.title}*\n` +
        `📝 Description: *${newMedia.description}*\n` +
        `💰 Price: *${isFree ? 'FREE 🎉' : '$' + price.toFixed(2)}*\n` +
        `📷 Type: *${newMedia.type}*\n` +
        `🆔 ID: *${newMedia.id}*\n\n` +
        `The content is now available in the gallery!`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Save error:', error);
      ctx.reply('❌ Failed to save content. Please try again.');
      delete uploadStates[userId];
    }
  }
});

// Skip description (Step 3)
bot.command('skip', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) return;
  if (!uploadStates[userId]) return;
  
  const state = uploadStates[userId];
  
  if (state.step === 'description') {
    state.description = 'No description';
    state.step = 'price';
    
    ctx.reply(
      '✅ **Skipped description!**\n\n' +
      `📌 Title: *${state.title}*\n` +
      `📝 Description: *No description*\n\n` +
      '💰 **Step 4/4: Enter Price**\n\n' +
      'Send me the **price** for this content.\n' +
      'Examples:\n' +
      '• `5.00` - For paid content\n' +
      '• `free` or `0` - For free content\n\n' +
      'Type /cancel to cancel upload.',
      { parse_mode: 'Markdown' }
    );
  } else {
    ctx.reply('ℹ️ You can only skip the description step.');
  }
});

// ==================== OTHER ADMIN COMMANDS ====================

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
    const priceText = item.isFree ? 'FREE' : `$${item.price}`;
    message += `${index + 1}. ${item.type.toUpperCase()} - ${item.title}\n`;
    message += `   💰 ${priceText} | 🛒 ${item.purchases} sold\n`;
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

// ==================== PENDING APPROVALS ====================

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
  
  ctx.reply(`✅ Approved!\n\nUser: ${request.username || 'Unknown'}\nMedia: ${request.mediaTitle}`);
  
  // Notify user
  try {
    await bot.telegram.sendMessage(
      request.userId,
      `✅ **Purchase Approved!**\n\n` +
      `📌 Media: *${request.mediaTitle}*\n` +
      `💰 Amount: $${request.amount}\n\n` +
      `You can now view it in the gallery.`,
      { parse_mode: 'Markdown' }
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
      `❌ **Purchase Rejected**\n\n` +
      `📌 Media: *${request.mediaTitle}*\n\n` +
      `Please contact admin ${ADMIN_USERNAME} for details.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Failed to notify user:', error);
  }
});

// ==================== STATS ====================

bot.command('stats', async (ctx) => {
  const userId = ctx.from.id;
  if (userId !== ADMIN_ID) return ctx.reply('⛔ Admins only.');
  
  const mediaDB = readDB(MEDIA_DB_PATH);
  const purchases = readDB(PURCHASES_DB_PATH);
  const pending = readDB(PENDING_DB_PATH);
  
  let totalRevenue = 0;
  let totalPurchases = 0;
  
  mediaDB.forEach(media => {
    const count = media.purchases || 0;
    if (!media.isFree) {
      totalRevenue += count * media.price;
    }
    totalPurchases += count;
  });
  
  const uniqueUsers = Object.keys(purchases).length;
  const freeItems = mediaDB.filter(m => m.isFree).length;
  const paidItems = mediaDB.filter(m => !m.isFree).length;
  
  ctx.reply(
    `📊 **Revenue Stats**\n\n` +
    `💰 Total Revenue: $${totalRevenue.toFixed(2)}\n` +
    `🛒 Total Purchases: ${totalPurchases}\n` +
    `👤 Unique Users: ${uniqueUsers}\n` +
    `📸 Total Media: ${mediaDB.length}\n` +
    `🆓 Free Items: ${freeItems}\n` +
    `💎 Paid Items: ${paidItems}\n` +
    `⏳ Pending Approvals: ${pending.length}\n` +
    `📈 Average Price: ${totalPurchases > 0 ? '$' + (totalRevenue / totalPurchases).toFixed(2) : '$0.00'}`,
    { parse_mode: 'Markdown' }
  );
});

// ==================== USER COMMANDS ====================

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
    `📸 **Premium Gallery**\n` +
    `💰 Pay per view content\n` +
    `🛒 Your purchases: ${userPurchases.length}\n` +
    `⏳ Pending approvals: ${userPending.length}\n\n` +
    `How it works:\n` +
    `1️⃣ Browse media in the gallery\n` +
    `2️⃣ Click "Buy" on any item\n` +
    `3️⃣ Pay via PayPal to ${ADMIN_USERNAME}\n` +
    `4️⃣ Upload screenshot\n` +
    `5️⃣ Admin approves → content unlocked!`,
    {
      parse_mode: 'Markdown',
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
    const priceText = item.isFree ? 'FREE' : `$${item.price}`;
    message += `${index + 1}. ${item.type.toUpperCase()} - ${item.title}\n`;
    message += `   💰 ${priceText}\n\n`;
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

// ==================== START BOT ====================

async function startBot() {
  try {
    const me = await bot.telegram.getMe();
    console.log(`🤖 Bot connected: @${me.username}`);
    console.log(`📌 Bot ID: ${me.id}`);
    
    await bot.launch();
    console.log('✅ Bot is running successfully!');
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
    console.error('Please check your BOT_TOKEN in .env file');
    process.exit(1);
  }
}

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = { 
  bot, 
  readDB, 
  writeDB, 
  MEDIA_DB_PATH, 
  USERS_DB_PATH, 
  PENDING_DB_PATH, 
  PURCHASES_DB_PATH, 
  ADMIN_ID,
  startBot
};
