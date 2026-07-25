const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const MEDIA_DB_PATH = path.join(__dirname, 'database', 'media.json');

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Database helper functions
const readMediaDB = () => {
  try {
    const data = fs.readFileSync(MEDIA_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

const writeMediaDB = (data) => {
  fs.writeFileSync(MEDIA_DB_PATH, JSON.stringify(data, null, 2));
};

// Admin upload command
bot.command('upload', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) {
    return ctx.reply('⛔ Only admins can upload media.');
  }
  
  ctx.reply('📤 Send me a photo or video to add to the mini app gallery.');
});

// Handle photo uploads
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) {
    return ctx.reply('⛔ Only admins can upload media.');
  }
  
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;
    const caption = ctx.message.caption || 'No description';
    
    // Get file URL
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    // Save to database
    const mediaDB = readMediaDB();
    const newMedia = {
      id: Date.now().toString(),
      type: 'photo',
      fileId: fileId,
      fileUrl: fileLink.href,
      caption: caption,
      date: new Date().toISOString(),
      approved: true
    };
    
    mediaDB.push(newMedia);
    writeMediaDB(mediaDB);
    
    ctx.reply(`✅ Photo uploaded successfully!\nCaption: ${caption}`);
  } catch (error) {
    console.error('Upload error:', error);
    ctx.reply('❌ Failed to upload photo. Please try again.');
  }
});

// Handle video uploads
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) {
    return ctx.reply('⛔ Only admins can upload media.');
  }
  
  try {
    const video = ctx.message.video;
    const fileId = video.file_id;
    const caption = ctx.message.caption || 'No description';
    
    // Get file URL
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    // Save to database
    const mediaDB = readMediaDB();
    const newMedia = {
      id: Date.now().toString(),
      type: 'video',
      fileId: fileId,
      fileUrl: fileLink.href,
      caption: caption,
      duration: video.duration,
      date: new Date().toISOString(),
      approved: true
    };
    
    mediaDB.push(newMedia);
    writeMediaDB(mediaDB);
    
    ctx.reply(`✅ Video uploaded successfully!\nCaption: ${caption}`);
  } catch (error) {
    console.error('Upload error:', error);
    ctx.reply('❌ Failed to upload video. Please try again.');
  }
});

// List all media (for admin)
bot.command('list', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) {
    return ctx.reply('⛔ Only admins can view media list.');
  }
  
  const mediaDB = readMediaDB();
  
  if (mediaDB.length === 0) {
    return ctx.reply('📭 No media uploaded yet.');
  }
  
  let message = `📸 Total Media: ${mediaDB.length}\n\n`;
  mediaDB.slice(-5).reverse().forEach((item, index) => {
    message += `${index + 1}. ${item.type.toUpperCase()} - ${item.caption}\n`;
    message += `   ID: ${item.id}\n`;
  });
  
  ctx.reply(message);
});

// Delete media (for admin)
bot.command('delete', async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId !== ADMIN_ID) {
    return ctx.reply('⛔ Only admins can delete media.');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Usage: /delete <media_id>');
  }
  
  const mediaId = args[1];
  let mediaDB = readMediaDB();
  const filtered = mediaDB.filter(item => item.id !== mediaId);
  
  if (filtered.length === mediaDB.length) {
    return ctx.reply('❌ Media not found.');
  }
  
  writeMediaDB(filtered);
  ctx.reply('✅ Media deleted successfully!');
});

bot.launch();
console.log('🤖 Bot is running...');

module.exports = { bot };
