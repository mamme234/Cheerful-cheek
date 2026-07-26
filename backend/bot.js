const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is not set in .env file!');
    process.exit(1);
}

const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '@KING_OF_ALPHA';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://cheerful-cheek.vercel.app';

const bot = new Telegraf(BOT_TOKEN);

// ==================== MONGODB IMPORT ====================
const { MongoClient } = require('mongodb');
const MONGODB_URI = process.env.MONGODB_URI;

let mediaCollection = null;
let bucket = null;

async function connectDB() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is not set!');
        return false;
    }

    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        const db = client.db('premium_gallery');
        mediaCollection = db.collection('media');
        const { GridFSBucket } = require('mongodb');
        bucket = new GridFSBucket(db, { bucketName: 'uploads' });
        console.log('✅ Bot connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        return false;
    }
}

// ==================== UPLOAD STATE ====================
let uploadStates = {};

// ==================== FUNCTION TO SAVE FILE TO GRIDFS ====================
async function saveFileToGridFS(fileUrl, fileType) {
    try {
        console.log(`📥 Downloading file from Telegram: ${fileUrl}`);
        
        // Download file from Telegram
        const response = await axios.get(fileUrl, { 
            responseType: 'arraybuffer',
            timeout: 60000
        });
        
        const buffer = Buffer.from(response.data);
        const filename = `upload_${Date.now()}.${fileType === 'video' ? 'mp4' : 'jpg'}`;
        
        console.log(`📤 Uploading to GridFS: ${filename} (${buffer.length} bytes)`);
        
        // Upload to GridFS
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: fileType === 'video' ? 'video/mp4' : 'image/jpeg',
            metadata: {
                uploadedAt: new Date(),
                type: fileType
            }
        });
        
        return new Promise((resolve, reject) => {
            uploadStream.write(buffer);
            uploadStream.end();
            
            uploadStream.on('finish', () => {
                const fileId = uploadStream.id.toString();
                const fileUrl = `/api/file/${fileId}`;
                console.log(`✅ File saved to GridFS: ${fileId}`);
                resolve({
                    gridFsId: fileId,
                    fileUrl: fileUrl,
                    filename: filename
                });
            });
            
            uploadStream.on('error', (err) => {
                console.error('GridFS upload error:', err);
                reject(err);
            });
        });
        
    } catch (error) {
        console.error('Error saving file to GridFS:', error);
        throw error;
    }
}

// ==================== START COMMAND ====================
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    console.log(`👤 User /start: ${userId}`);
    
    const users = await global.userCollection?.findOne({ id: userId });
    if (!users) {
        await global.userCollection?.insertOne({
            id: userId,
            username: ctx.from.username || 'Unknown',
            firstName: ctx.from.first_name || 'User',
            registeredAt: new Date().toISOString()
        });
    }
    
    const webAppUrl = `${FRONTEND_URL}?userId=${userId}&name=${encodeURIComponent(ctx.from.first_name || 'User')}&username=${encodeURIComponent(ctx.from.username || '')}`;
    
    ctx.reply(
        `👋 Welcome ${ctx.from.first_name || 'User'}!\n\n` +
        `📸 **Premium Gallery**\n\n` +
        `How it works:\n` +
        `1️⃣ Browse media in the gallery\n` +
        `2️⃣ Click "Buy" on any item\n` +
        `3️⃣ Pay via PayPal\n` +
        `4️⃣ Upload screenshot\n` +
        `5️⃣ Admin approves → content unlocked!`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎨 Open Gallery', web_app: { url: webAppUrl } }]
                ]
            }
        }
    );
});

// ==================== ADMIN UPLOAD ====================
bot.command('upload', async (ctx) => {
    const userId = ctx.from.id;
    console.log(`👑 Admin upload: ${userId}`);
    
    if (!ADMIN_IDS.includes(Number(userId))) {
        return ctx.reply('⛔ Only admins can upload media.');
    }
    
    uploadStates[userId] = { step: 'media' };
    ctx.reply(
        '📤 **Step 1/4: Send Media**\n\n' +
        'Please send me the **photo** or **video** you want to upload.\n\n' +
        'Type /cancel to cancel upload.',
        { parse_mode: 'Markdown' }
    );
});

bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    if (uploadStates[userId]) {
        delete uploadStates[userId];
        ctx.reply('❌ Upload cancelled.');
    } else {
        ctx.reply('ℹ️ No active upload to cancel.');
    }
});

// ==================== HANDLE PHOTO UPLOAD ====================
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    console.log(`📸 Photo received from: ${userId}`);
    
    if (!ADMIN_IDS.includes(Number(userId))) return;
    if (!uploadStates[userId] || uploadStates[userId].step !== 'media') return;
    
    try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const file = await ctx.telegram.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        
        console.log(`📸 Downloading photo from: ${fileUrl}`);
        
        // Download and save to GridFS
        const result = await saveFileToGridFS(fileUrl, 'photo');
        
        uploadStates[userId].fileId = result.gridFsId;
        uploadStates[userId].fileUrl = result.fileUrl;
        uploadStates[userId].type = 'photo';
        uploadStates[userId].step = 'title';
        
        ctx.reply(
            '✅ **Photo saved to MongoDB!**\n\n' +
            '📝 **Step 2/4: Enter Title**\n\n' +
            'Send me the **title** for this content.\n' +
            'Type /cancel to cancel upload.',
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('Photo upload error:', error);
        ctx.reply('❌ Failed to process photo. Please try again.');
        delete uploadStates[userId];
    }
});

// ==================== HANDLE VIDEO UPLOAD ====================
bot.on('video', async (ctx) => {
    const userId = ctx.from.id;
    console.log(`🎬 Video received from: ${userId}`);
    
    if (!ADMIN_IDS.includes(Number(userId))) return;
    if (!uploadStates[userId] || uploadStates[userId].step !== 'media') return;
    
    try {
        const video = ctx.message.video;
        const file = await ctx.telegram.getFile(video.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        
        console.log(`🎬 Downloading video from: ${fileUrl}`);
        
        // Download and save to GridFS
        const result = await saveFileToGridFS(fileUrl, 'video');
        
        uploadStates[userId].fileId = result.gridFsId;
        uploadStates[userId].fileUrl = result.fileUrl;
        uploadStates[userId].type = 'video';
        uploadStates[userId].duration = video.duration;
        uploadStates[userId].step = 'title';
        
        ctx.reply(
            '✅ **Video saved to MongoDB!**\n\n' +
            '📝 **Step 2/4: Enter Title**\n\n' +
            'Send me the **title** for this content.\n' +
            'Type /cancel to cancel upload.',
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('Video upload error:', error);
        ctx.reply('❌ Failed to process video. Please try again.');
        delete uploadStates[userId];
    }
});

// ==================== HANDLE TEXT INPUT ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    if (text.startsWith('/')) return;
    if (!ADMIN_IDS.includes(Number(userId))) return;
    if (!uploadStates[userId]) return;
    
    const state = uploadStates[userId];
    console.log(`📝 Text input: "${text}" from admin ${userId}, step: ${state.step}`);
    
    // Step 2: Title
    if (state.step === 'title') {
        state.title = text;
        state.step = 'description';
        
        ctx.reply(
            '✅ **Title saved!**\n\n' +
            `📌 Title: *${text}*\n\n` +
            '📝 **Step 3/4: Enter Description**\n\n' +
            'Send me the **description** for this content.\n' +
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
        
        try {
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
                approved: true,
                uploadedBy: userId
            };
            
            await mediaCollection.insertOne(newMedia);
            
            console.log(`✅ Media saved: ${newMedia.id} - ${newMedia.title}`);
            console.log(`📸 File ID: ${newMedia.fileId}`);
            
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

// Skip description
bot.command('skip', async (ctx) => {
    const userId = ctx.from.id;
    if (!ADMIN_IDS.includes(Number(userId))) return;
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
            '• `free` or `0` - For free content',
            { parse_mode: 'Markdown' }
        );
    } else {
        ctx.reply('ℹ️ You can only skip the description step.');
    }
});

// ==================== START BOT ====================
async function startBot() {
    try {
        // Connect to MongoDB first
        await connectDB();
        
        const me = await bot.telegram.getMe();
        console.log(`🤖 Bot connected: @${me.username}`);
        console.log(`👑 Admins: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'None set!'}`);
        
        await bot.launch();
        console.log('✅ Bot is running successfully!');
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        process.exit(1);
    }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = { 
    bot, 
    startBot,
    ADMIN_IDS
};
