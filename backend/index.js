// backend/index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-id']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const uploadDirs = ['uploads', 'uploads/screenshots', 'uploads/media'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'screenshot') {
            cb(null, 'uploads/screenshots/');
        } else if (file.fieldname === 'media') {
            cb(null, 'uploads/media/');
        } else {
            cb(null, 'uploads/');
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images and videos are allowed.'));
        }
    }
});

// In-memory storage
const db = {
    admins: [],
    users: [],
    media: [],
    payments: [],
    purchases: [],
    messages: [],
    stats: {
        totalUsers: 0,
        totalSales: 0,
        totalRevenue: 0
    }
};

// Add main admin from environment
if (process.env.MAIN_ADMIN_ID) {
    const mainAdminId = parseInt(process.env.MAIN_ADMIN_ID);
    if (!db.admins.some(a => a.id === mainAdminId)) {
        db.admins.push({
            id: mainAdminId,
            username: 'MainAdmin',
            firstName: 'Main',
            lastName: 'Admin',
            addedAt: new Date().toISOString(),
            addedBy: 'system',
            role: 'main_admin'
        });
    }
}

// Add second admin from environment if specified
if (process.env.SECOND_ADMIN_ID) {
    const secondAdminId = parseInt(process.env.SECOND_ADMIN_ID);
    if (!db.admins.some(a => a.id === secondAdminId)) {
        db.admins.push({
            id: secondAdminId,
            username: 'SecondAdmin',
            firstName: 'Second',
            lastName: 'Admin',
            addedAt: new Date().toISOString(),
            addedBy: process.env.MAIN_ADMIN_ID,
            role: 'admin'
        });
    }
}

// Initialize Telegram Bot
let bot = null;
if (process.env.BOT_TOKEN) {
    try {
        bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
        console.log('🤖 Telegram Bot initialized successfully');
        console.log('👥 Total Admins:', db.admins.length);

        // Start command
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (isAdmin) {
                const adminInfo = db.admins.find(a => a.id === chatId);
                const welcomeMessage = `
🎉 Welcome to Cheerful Chick Admin Panel!

👤 Admin: ${adminInfo.firstName} ${adminInfo.lastName}
👑 Role: ${adminInfo.role || 'admin'}

📋 Available Commands:
/upload - Upload new content
/videos - List all videos
/photos - List all photos
/edit - Edit content
/delete - Delete content
/users - View users
/sales - View sales
/broadcast - Send broadcast
/stats - View statistics
/approve [id] - Approve payment
/reject [id] - Reject payment
/admins - List all admins

Use these commands to manage your content.
                `;
                bot.sendMessage(chatId, welcomeMessage);
            } else {
                // User welcome
                const welcomeUser = `
🎉 Welcome to Cheerful Chick!

🌟 Browse premium content and make purchases.
💬 Chat with our admins for support.
📸 After payment, send a screenshot here for verification.

Start exploring the app now!
                `;
                bot.sendMessage(chatId, welcomeUser);
            }
        });

        // Handle payment screenshot from users
        bot.on('photo', async (msg) => {
            const chatId = msg.chat.id;
            
            // Check if user is an admin
            const isAdmin = db.admins.some(a => a.id === chatId);
            if (isAdmin) return;

            // Check if user has a pending payment
            const pendingPayment = db.payments.find(p => 
                p.userId === chatId && p.status === 'pending'
            );

            if (!pendingPayment) {
                bot.sendMessage(chatId, '❌ No pending payment found. Please make a payment first.');
                return;
            }

            try {
                const photo = msg.photo[msg.photo.length - 1];
                const file = await bot.getFile(photo.file_id);
                const filePath = file.file_path;
                const fileName = `screenshot-${Date.now()}.jpg`;
                const localPath = path.join(__dirname, 'uploads/screenshots', fileName);
                
                // Download file
                const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
                const response = await axios({
                    method: 'get',
                    url: url,
                    responseType: 'stream'
                });
                
                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                // Update payment with screenshot
                pendingPayment.screenshot = `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/uploads/screenshots/${fileName}`;
                pendingPayment.status = 'pending_approval';
                pendingPayment.screenshotDate = new Date().toISOString();

                // Notify user
                bot.sendMessage(chatId, '✅ Payment screenshot received! Admin will review and approve shortly.');

                // Forward to all admins
                const media = db.media.find(m => m.id === pendingPayment.itemId);
                const user = db.users.find(u => u.id === chatId);
                const userName = user ? user.firstName || 'User' : 'User';

                const adminMessage = `
💳 New Payment Screenshot Received!

👤 User: ${userName} (${chatId})
📦 Item: ${media ? media.title : 'Unknown'}
💰 Amount: $${pendingPayment.amount}
📅 Date: ${new Date().toISOString()}
🆔 Payment ID: ${pendingPayment.id}

📸 Screenshot attached below.

Use: /approve ${pendingPayment.id} to approve
Use: /reject ${pendingPayment.id} to reject
                `;

                // Send to all admins
                for (const admin of db.admins) {
                    try {
                        await bot.sendPhoto(admin.id, localPath, {
                            caption: adminMessage
                        });
                        console.log(`✅ Screenshot sent to admin: ${admin.id}`);
                    } catch (e) {
                        console.error(`Error sending to admin ${admin.id}:`, e);
                    }
                }

                // Also send to main admin if not already in list
                if (process.env.MAIN_ADMIN_ID) {
                    const mainAdminId = parseInt(process.env.MAIN_ADMIN_ID);
                    if (!db.admins.some(a => a.id === mainAdminId)) {
                        try {
                            await bot.sendPhoto(mainAdminId, localPath, {
                                caption: adminMessage
                            });
                        } catch (e) {
                            console.error('Error sending to main admin:', e);
                        }
                    }
                }

            } catch (error) {
                console.error('Error handling photo:', error);
                bot.sendMessage(chatId, '❌ Error processing screenshot. Please try again.');
            }
        });

        // Handle document uploads (for screenshots)
        bot.on('document', async (msg) => {
            const chatId = msg.chat.id;
            
            // Check if user is an admin
            const isAdmin = db.admins.some(a => a.id === chatId);
            if (isAdmin) return;

            // Check if user has a pending payment
            const pendingPayment = db.payments.find(p => 
                p.userId === chatId && p.status === 'pending'
            );

            if (!pendingPayment) {
                bot.sendMessage(chatId, '❌ No pending payment found. Please make a payment first.');
                return;
            }

            // Check if it's an image
            const file = msg.document;
            if (!file.mime_type || !file.mime_type.startsWith('image/')) {
                bot.sendMessage(chatId, '❌ Please send an image file as screenshot.');
                return;
            }

            try {
                const filePath = file.file_id;
                const fileName = `screenshot-${Date.now()}.jpg`;
                const localPath = path.join(__dirname, 'uploads/screenshots', fileName);
                
                // Download file
                const fileLink = await bot.getFile(filePath);
                const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileLink.file_path}`;
                const response = await axios({
                    method: 'get',
                    url: url,
                    responseType: 'stream'
                });
                
                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                // Update payment with screenshot
                pendingPayment.screenshot = `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/uploads/screenshots/${fileName}`;
                pendingPayment.status = 'pending_approval';
                pendingPayment.screenshotDate = new Date().toISOString();

                // Notify user
                bot.sendMessage(chatId, '✅ Payment screenshot received! Admin will review and approve shortly.');

                // Forward to all admins
                const media = db.media.find(m => m.id === pendingPayment.itemId);
                const user = db.users.find(u => u.id === chatId);
                const userName = user ? user.firstName || 'User' : 'User';

                const adminMessage = `
💳 New Payment Screenshot Received!

👤 User: ${userName} (${chatId})
📦 Item: ${media ? media.title : 'Unknown'}
💰 Amount: $${pendingPayment.amount}
📅 Date: ${new Date().toISOString()}
🆔 Payment ID: ${pendingPayment.id}

📸 Screenshot attached below.

Use: /approve ${pendingPayment.id} to approve
Use: /reject ${pendingPayment.id} to reject
                `;

                // Send to all admins
                for (const admin of db.admins) {
                    try {
                        await bot.sendDocument(admin.id, localPath, {
                            caption: adminMessage
                        });
                        console.log(`✅ Screenshot sent to admin: ${admin.id}`);
                    } catch (e) {
                        console.error(`Error sending to admin ${admin.id}:`, e);
                    }
                }

            } catch (error) {
                console.error('Error handling document:', error);
                bot.sendMessage(chatId, '❌ Error processing screenshot. Please try again.');
            }
        });

        // Approve payment command (all admins)
        bot.onText(/\/approve (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to approve payments.');
                return;
            }

            const paymentId = match[1];
            const payment = db.payments.find(p => p.id === paymentId);
            
            if (!payment) {
                bot.sendMessage(chatId, '❌ Payment not found.');
                return;
            }

            if (payment.status === 'approved') {
                bot.sendMessage(chatId, 'ℹ️ This payment is already approved.');
                return;
            }

            if (payment.status === 'rejected') {
                bot.sendMessage(chatId, 'ℹ️ This payment was already rejected.');
                return;
            }

            // Approve payment
            payment.status = 'approved';
            payment.approvedAt = new Date().toISOString();
            payment.approvedBy = chatId;

            // Create purchase record
            const purchase = {
                id: db.purchases.length + 1,
                userId: payment.userId,
                itemId: payment.itemId,
                amount: payment.amount,
                purchaseDate: new Date().toISOString(),
                paymentId: payment.id,
                status: 'approved',
                approvedBy: chatId
            };
            db.purchases.push(purchase);

            // Update stats
            db.stats.totalSales++;
            db.stats.totalRevenue += payment.amount;

            // Mark media as purchased
            const media = db.media.find(m => m.id === payment.itemId);
            if (media) {
                media.isPurchased = true;
                media.purchasedBy = media.purchasedBy || [];
                media.purchasedBy.push(payment.userId);
            }

            // Notify user
            try {
                await bot.sendMessage(payment.userId, `✅ Your payment for "${media ? media.title : 'item'}" has been approved! You can now access the content.`);
            } catch (e) {
                console.error('Error notifying user:', e);
            }

            // Notify all admins
            const adminName = db.admins.find(a => a.id === chatId);
            for (const admin of db.admins) {
                try {
                    if (admin.id !== chatId) {
                        await bot.sendMessage(admin.id, `✅ Payment ${paymentId} approved by ${adminName ? adminName.firstName : 'Admin'}`);
                    }
                } catch (e) {
                    console.error('Error notifying admin:', e);
                }
            }

            bot.sendMessage(chatId, `✅ Payment ${paymentId} approved successfully!`);
        });

        // Reject payment command (all admins)
        bot.onText(/\/reject (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to reject payments.');
                return;
            }

            const paymentId = match[1];
            const payment = db.payments.find(p => p.id === paymentId);
            
            if (!payment) {
                bot.sendMessage(chatId, '❌ Payment not found.');
                return;
            }

            if (payment.status === 'approved') {
                bot.sendMessage(chatId, 'ℹ️ This payment is already approved.');
                return;
            }

            if (payment.status === 'rejected') {
                bot.sendMessage(chatId, 'ℹ️ This payment was already rejected.');
                return;
            }

            // Reject payment
            payment.status = 'rejected';
            payment.rejectedAt = new Date().toISOString();
            payment.rejectedBy = chatId;

            // Notify user
            try {
                await bot.sendMessage(payment.userId, `❌ Your payment has been rejected. Please contact admin for more information.`);
            } catch (e) {
                console.error('Error notifying user:', e);
            }

            // Notify all admins
            const adminName = db.admins.find(a => a.id === chatId);
            for (const admin of db.admins) {
                try {
                    if (admin.id !== chatId) {
                        await bot.sendMessage(admin.id, `❌ Payment ${paymentId} rejected by ${adminName ? adminName.firstName : 'Admin'}`);
                    }
                } catch (e) {
                    console.error('Error notifying admin:', e);
                }
            }

            bot.sendMessage(chatId, `❌ Payment ${paymentId} rejected.`);
        });

        // Add admin command (main admin only)
        bot.onText(/\/addadmin (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const newAdminId = parseInt(match[1]);
            
            // Check if sender is main admin
            if (chatId.toString() !== process.env.MAIN_ADMIN_ID) {
                bot.sendMessage(chatId, '❌ Only the main admin can add new admins.');
                return;
            }
            
            // Check if already admin
            if (db.admins.some(a => a.id === newAdminId)) {
                bot.sendMessage(chatId, 'ℹ️ This user is already an admin.');
                return;
            }
            
            try {
                const userInfo = await bot.getChat(newAdminId);
                const newAdmin = {
                    id: newAdminId,
                    username: userInfo.username || 'Unknown',
                    firstName: userInfo.first_name || 'Unknown',
                    lastName: userInfo.last_name || '',
                    addedAt: new Date().toISOString(),
                    addedBy: chatId,
                    role: 'admin'
                };
                
                db.admins.push(newAdmin);
                bot.sendMessage(chatId, `✅ User ${newAdmin.firstName} has been added as admin!`);
                bot.sendMessage(newAdminId, `🎉 You have been added as an admin to Cheerful Chick Bot! Use /start to see available commands.`);
            } catch (error) {
                bot.sendMessage(chatId, `❌ Error adding admin: ${error.message}`);
            }
        });

        // Remove admin command (main admin only)
        bot.onText(/\/removeadmin (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const adminIdToRemove = parseInt(match[1]);
            
            if (chatId.toString() !== process.env.MAIN_ADMIN_ID) {
                bot.sendMessage(chatId, '❌ Only the main admin can remove admins.');
                return;
            }
            
            if (adminIdToRemove === parseInt(process.env.MAIN_ADMIN_ID)) {
                bot.sendMessage(chatId, '❌ Cannot remove the main admin.');
                return;
            }
            
            const index = db.admins.findIndex(a => a.id === adminIdToRemove);
            if (index === -1) {
                bot.sendMessage(chatId, '❌ Admin not found.');
                return;
            }
            
            const removedAdmin = db.admins[index];
            db.admins.splice(index, 1);
            bot.sendMessage(chatId, `✅ Admin ${removedAdmin.firstName} has been removed.`);
            bot.sendMessage(adminIdToRemove, '❌ You have been removed as an admin.');
        });

        // List admins command
        bot.onText(/\/admins/, (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
                return;
            }
            
            let adminList = '👥 List of Admins:\n\n';
            adminList += `⭐ Main Admin: ${process.env.MAIN_ADMIN_ID}\n\n`;
            
            db.admins.forEach((admin, index) => {
                adminList += `${index + 1}. ${admin.firstName} ${admin.lastName} (@${admin.username})\n`;
                adminList += `   ID: ${admin.id}\n`;
                adminList += `   Role: ${admin.role || 'admin'}\n`;
                adminList += `   Added: ${new Date(admin.addedAt).toLocaleDateString()}\n\n`;
            });
            
            if (db.admins.length === 0) {
                adminList += 'No additional admins added.';
            }
            
            bot.sendMessage(chatId, adminList);
        });

        // Upload command (all admins)
        const uploadStates = {};
        
        bot.onText(/\/upload/, (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to upload content.');
                return;
            }
            
            bot.sendMessage(chatId, '📤 Please send the media file (photo or video) you want to upload.');
            uploadStates[chatId] = { step: 'file' };
        });

        // Handle file uploads
        bot.on('photo', async (msg) => {
            const chatId = msg.chat.id;
            if (!uploadStates[chatId]) return;

            const isAdmin = db.admins.some(a => a.id === chatId);
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to upload content.');
                delete uploadStates[chatId];
                return;
            }

            try {
                const photo = msg.photo[msg.photo.length - 1];
                const file = await bot.getFile(photo.file_id);
                const fileName = `media-${Date.now()}.jpg`;
                const localPath = path.join(__dirname, 'uploads/media', fileName);
                
                const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
                const response = await axios({
                    method: 'get',
                    url: url,
                    responseType: 'stream'
                });
                
                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                uploadStates[chatId].filePath = `/uploads/media/${fileName}`;
                uploadStates[chatId].type = 'photo';
                uploadStates[chatId].step = 'title';
                
                bot.sendMessage(chatId, '📝 Enter the title for this content:');
            } catch (error) {
                console.error('Error handling photo upload:', error);
                bot.sendMessage(chatId, '❌ Error uploading photo. Please try again.');
                delete uploadStates[chatId];
            }
        });

        bot.on('video', async (msg) => {
            const chatId = msg.chat.id;
            if (!uploadStates[chatId]) return;

            const isAdmin = db.admins.some(a => a.id === chatId);
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to upload content.');
                delete uploadStates[chatId];
                return;
            }

            try {
                const video = msg.video;
                const file = await bot.getFile(video.file_id);
                const fileName = `media-${Date.now()}.mp4`;
                const localPath = path.join(__dirname, 'uploads/media', fileName);
                
                const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
                const response = await axios({
                    method: 'get',
                    url: url,
                    responseType: 'stream'
                });
                
                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                uploadStates[chatId].filePath = `/uploads/media/${fileName}`;
                uploadStates[chatId].type = 'video';
                uploadStates[chatId].duration = video.duration;
                uploadStates[chatId].step = 'title';
                
                bot.sendMessage(chatId, '📝 Enter the title for this content:');
            } catch (error) {
                console.error('Error handling video upload:', error);
                bot.sendMessage(chatId, '❌ Error uploading video. Please try again.');
                delete uploadStates[chatId];
            }
        });

        bot.on('text', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text;
            
            if (!uploadStates[chatId]) return;

            const state = uploadStates[chatId];

            switch (state.step) {
                case 'title':
                    state.title = text;
                    state.step = 'description';
                    bot.sendMessage(chatId, '📝 Enter the description:');
                    break;
                    
                case 'description':
                    state.description = text;
                    state.step = 'price';
                    bot.sendMessage(chatId, '💰 Enter the price (in USD, e.g., 9.99):');
                    break;
                    
                case 'price':
                    const price = parseFloat(text);
                    if (isNaN(price) || price < 0) {
                        bot.sendMessage(chatId, '❌ Invalid price. Please enter a valid number:');
                        return;
                    }
                    
                    state.price = price;
                    state.step = 'confirm';
                    
                    const preview = `
📋 Content Preview:
Title: ${state.title}
Description: ${state.description}
Price: $${price.toFixed(2)}
Type: ${state.type}

Confirm upload? (yes/no)
                    `;
                    bot.sendMessage(chatId, preview);
                    break;
                    
                case 'confirm':
                    if (text.toLowerCase() === 'yes') {
                        const newMedia = {
                            id: db.media.length + 1,
                            type: state.type,
                            title: state.title,
                            description: state.description,
                            price: state.price,
                            url: `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}${state.filePath}`,
                            thumbnail: `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}${state.filePath}`,
                            duration: state.duration || null,
                            date: new Date().toISOString().split('T')[0],
                            isPurchased: false,
                            filename: path.basename(state.filePath),
                            uploadDate: new Date().toISOString(),
                            uploadedBy: chatId
                        };
                        
                        db.media.push(newMedia);
                        
                        bot.sendMessage(chatId, `✅ Content uploaded successfully!`);
                        
                        // Notify all users
                        db.users.forEach(user => {
                            try {
                                bot.sendMessage(user.id, `🎉 New content available: ${state.title}`);
                            } catch (e) {
                                console.error('Error notifying user:', e);
                            }
                        });
                        
                        // Notify all admins
                        db.admins.forEach(admin => {
                            if (admin.id !== chatId) {
                                try {
                                    bot.sendMessage(admin.id, `📤 New content uploaded by ${chatId}: ${state.title}`);
                                } catch (e) {
                                    console.error('Error notifying admin:', e);
                                }
                            }
                        });
                        
                        delete uploadStates[chatId];
                    } else if (text.toLowerCase() === 'no') {
                        bot.sendMessage(chatId, '❌ Upload cancelled.');
                        delete uploadStates[chatId];
                    } else {
                        bot.sendMessage(chatId, 'Please reply with "yes" or "no".');
                    }
                    break;
            }
        });

        // Handle user messages
        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            // Skip if admin or command
            if (isAdmin || msg.text?.startsWith('/')) return;
            if (msg.photo || msg.document) return; // Handled by photo/document handlers
            
            // Save user message
            if (msg.text) {
                const message = {
                    id: db.messages.length + 1,
                    userId: chatId,
                    message: msg.text,
                    type: 'text',
                    timestamp: new Date().toISOString(),
                    read: false
                };
                db.messages.push(message);
                
                // Forward to all admins
                const user = db.users.find(u => u.id === chatId);
                const userName = user ? user.firstName || 'User' : 'User';
                
                for (const admin of db.admins) {
                    try {
                        await bot.sendMessage(admin.id, `💬 New message from ${userName} (${chatId}):\n\n${msg.text}`);
                    } catch (e) {
                        console.error('Error forwarding message to admin:', e);
                    }
                }
            }
        });

        console.log('✅ Bot commands registered successfully');

    } catch (error) {
        console.error('Error initializing bot:', error);
    }
}

// ============ API ROUTES ============

// Middleware to verify admin
const verifyAdmin = (req, res, next) => {
    const adminId = req.headers['x-admin-id'] || req.body.adminId;
    const isAdmin = db.admins.some(a => a.id === parseInt(adminId)) || 
                    adminId === process.env.MAIN_ADMIN_ID;
    
    if (adminId && isAdmin) {
        next();
    } else {
        res.status(403).json({ error: 'Unauthorized. Admin access required.' });
    }
};

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        admins: db.admins.length,
        users: db.users.length,
        media: db.media.length
    });
});

// ============ MEDIA ROUTES ============

// Get all media
app.get('/api/media', (req, res) => {
    res.json(db.media);
});

// Get media by category
app.get('/api/media/category/:category', (req, res) => {
    const { category } = req.params;
    let filtered = db.media;
    if (category === 'videos') {
        filtered = db.media.filter(m => m.type === 'video');
    } else if (category === 'photos') {
        filtered = db.media.filter(m => m.type === 'photo');
    } else if (category === 'new') {
        filtered = [...db.media].sort((a, b) => new Date(b.date) - new Date(a.date));
    } else if (category === 'popular') {
        filtered = [...db.media].sort((a, b) => (b.purchases || 0) - (a.purchases || 0));
    }
    res.json(filtered);
});

// Get media by ID
app.get('/api/media/:id', (req, res) => {
    const media = db.media.find(m => m.id === parseInt(req.params.id));
    if (media) {
        res.json(media);
    } else {
        res.status(404).json({ error: 'Media not found' });
    }
});

// Upload media (admin only)
app.post('/api/media/upload', verifyAdmin, upload.single('media'), async (req, res) => {
    try {
        const { title, description, price, type, adminId } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const newMedia = {
            id: db.media.length + 1,
            type: type || 'photo',
            title: title || 'Untitled',
            description: description || '',
            price: parseFloat(price) || 0,
            url: `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/uploads/media/${file.filename}`,
            thumbnail: `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/uploads/media/${file.filename}`,
            duration: req.body.duration || null,
            date: new Date().toISOString().split('T')[0],
            isPurchased: false,
            filename: file.filename,
            uploadDate: new Date().toISOString(),
            purchases: 0,
            uploadedBy: parseInt(adminId)
        };

        db.media.push(newMedia);

        res.status(201).json({
            success: true,
            message: 'Media uploaded successfully',
            media: newMedia
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete media (admin only)
app.delete('/api/media/:id', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = db.media.findIndex(m => m.id === id);
    if (index !== -1) {
        const media = db.media[index];
        if (media.filename) {
            const filePath = path.join(__dirname, 'uploads/media', media.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        db.media.splice(index, 1);
        res.json({ success: true, message: 'Media deleted successfully' });
    } else {
        res.status(404).json({ error: 'Media not found' });
    }
});

// ============ PAYMENT ROUTES ============

// Create payment request
app.post('/api/payments/create', (req, res) => {
    try {
        const { userId, userName, itemId, amount } = req.body;
        
        // Check if user already purchased this item
        const existingPurchase = db.purchases.find(p => 
            p.userId === parseInt(userId) && p.itemId === parseInt(itemId)
        );
        
        if (existingPurchase) {
            return res.status(400).json({ 
                error: 'You already purchased this item' 
            });
        }

        const payment = {
            id: uuidv4(),
            userId: parseInt(userId),
            userName: userName || 'User',
            itemId: parseInt(itemId),
            amount: parseFloat(amount),
            status: 'pending',
            timestamp: new Date().toISOString(),
            approvedAt: null,
            approvedBy: null,
            screenshot: null,
            screenshotDate: null
        };

        db.payments.push(payment);

        // Get media info
        const media = db.media.find(m => m.id === parseInt(itemId));

        res.status(201).json({
            success: true,
            message: 'Payment request created',
            paymentId: payment.id,
            instructions: {
                paypalEmail: process.env.PAYPAL_EMAIL || 'admin@cheerfulchick.com',
                amount: payment.amount,
                item: media ? media.title : 'Item'
            }
        });

    } catch (error) {
        console.error('Payment creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Submit payment screenshot (API endpoint)
app.post('/api/payments/submit', upload.single('screenshot'), async (req, res) => {
    try {
        const { userId, paymentId } = req.body;
        const screenshot = req.file;

        if (!screenshot) {
            return res.status(400).json({ error: 'Payment screenshot is required' });
        }

        const payment = db.payments.find(p => p.id === paymentId);
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        if (payment.status !== 'pending') {
            return res.status(400).json({ error: 'Payment already processed' });
        }

        // Update payment with screenshot
        payment.screenshot = `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/uploads/screenshots/${screenshot.filename}`;
        payment.status = 'pending_approval';
        payment.screenshotDate = new Date().toISOString();

        // Forward to all admins
        const media = db.media.find(m => m.id === payment.itemId);
        const user = db.users.find(u => u.id === payment.userId);
        const userName = user ? user.firstName || 'User' : 'User';

        const adminMessage = `
💳 New Payment Screenshot Received!

👤 User: ${userName} (${payment.userId})
📦 Item: ${media ? media.title : 'Unknown'}
💰 Amount: $${payment.amount}
📅 Date: ${new Date().toISOString()}
🆔 Payment ID: ${payment.id}

📸 Screenshot attached.

Use: /approve ${payment.id} to approve
Use: /reject ${payment.id} to reject
        `;

        // Send to all admins via bot
        if (bot) {
            for (const admin of db.admins) {
                try {
                    await bot.sendPhoto(admin.id, screenshot.path, {
                        caption: adminMessage
                    });
                } catch (e) {
                    console.error(`Error sending to admin ${admin.id}:`, e);
                }
            }
        }

        res.json({
            success: true,
            message: 'Screenshot submitted for approval',
            paymentId: payment.id
        });

    } catch (error) {
        console.error('Screenshot submission error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get payment status
app.get('/api/payments/:id', (req, res) => {
    const payment = db.payments.find(p => p.id === req.params.id);
    if (payment) {
        res.json(payment);
    } else {
        res.status(404).json({ error: 'Payment not found' });
    }
});

// Get user purchases
app.get('/api/purchases/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const userPurchases = db.purchases.filter(p => p.userId === userId);
    const purchaseDetails = userPurchases.map(p => {
        const media = db.media.find(m => m.id === p.itemId);
        return {
            ...p,
            item: media || null
        };
    });
    res.json(purchaseDetails);
});

// ============ USER ROUTES ============

// Register or update user
app.post('/api/users/register', (req, res) => {
    const { id, firstName, lastName, username, photoUrl } = req.body;
    
    let user = db.users.find(u => u.id === parseInt(id));
    if (user) {
        user.lastActive = new Date().toISOString();
        user.firstName = firstName || user.firstName;
        user.lastName = lastName || user.lastName;
        user.username = username || user.username;
        user.photoUrl = photoUrl || user.photoUrl;
    } else {
        user = {
            id: parseInt(id),
            firstName: firstName || 'User',
            lastName: lastName || '',
            username: username || `user_${id}`,
            photoUrl: photoUrl || '',
            registeredAt: new Date().toISOString(),
            lastActive: new Date().toISOString()
        };
        db.users.push(user);
        db.stats.totalUsers = db.users.length;
    }
    
    res.json({ success: true, user });
});

// Get all users
app.get('/api/users', (req, res) => {
    const users = db.users.map(user => {
        const userMessages = db.messages.filter(m => 
            m.userId === user.id || m.recipientId === user.id
        );
        const lastMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
        const unreadCount = userMessages.filter(m => 
            m.recipientId === user.id && !m.read
        ).length;
        
        return {
            ...user,
            lastMessage: lastMessage ? lastMessage.message : 'No messages',
            lastActive: lastMessage ? lastMessage.timestamp : user.lastActive,
            unreadCount: unreadCount,
            online: false
        };
    });
    res.json(users);
});

// Get user data
app.get('/api/users/:id', (req, res) => {
    const user = db.users.find(u => u.id === parseInt(req.params.id));
    if (user) {
        const purchases = db.purchases.filter(p => p.userId === user.id);
        const totalSpent = purchases.reduce((sum, p) => sum + p.amount, 0);
        res.json({
            ...user,
            totalPurchases: purchases.length,
            totalSpent: totalSpent
        });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// ============ ADMIN ROUTES ============

// Get all admins
app.get('/api/admins', verifyAdmin, (req, res) => {
    res.json(db.admins);
});

// Get admin dashboard stats
app.get('/api/admin/stats', verifyAdmin, (req, res) => {
    const totalUsers = db.users.length;
    const totalMessages = db.messages.length;
    const unreadMessages = db.messages.filter(m => !m.read).length;
    const pendingPayments = db.payments.filter(p => p.status === 'pending_approval').length;
    const totalRevenue = db.purchases.reduce((sum, p) => sum + p.amount, 0);
    
    res.json({
        totalUsers,
        totalMessages,
        unreadMessages,
        pendingPayments,
        totalRevenue,
        totalPurchases: db.purchases.length,
        totalMedia: db.media.length,
        totalAdmins: db.admins.length
    });
});

// ============ CHAT ROUTES ============

// Get messages for user
app.get('/api/chat/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const userMessages = db.messages.filter(m => 
        m.userId === userId || m.recipientId === userId
    );
    res.json(userMessages);
});

// Send message
app.post('/api/chat/send', (req, res) => {
    const { userId, recipientId, message, type, senderName } = req.body;
    
    const newMessage = {
        id: db.messages.length + 1,
        userId: parseInt(userId),
        recipientId: parseInt(recipientId || process.env.MAIN_ADMIN_ID),
        message: message,
        type: type || 'text',
        timestamp: new Date().toISOString(),
        read: false,
        delivered: true,
        senderName: senderName || 'User'
    };
    
    db.messages.push(newMessage);

    // Notify all admins
    if (bot) {
        const user = db.users.find(u => u.id === parseInt(userId));
        const userName = user ? user.firstName || 'User' : 'User';
        
        db.admins.forEach(admin => {
            try {
                if (admin.id !== parseInt(userId)) {
                    bot.sendMessage(admin.id, `💬 New message from ${userName} (${userId}):\n\n${message}`);
                }
            } catch (e) {
                console.error('Error notifying admin:', e);
            }
        });
    }

    res.json({ success: true, message: newMessage });
});

// ============ SERVE STATIC FILES ============

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// Handle all other routes - serve index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ============ START SERVER ============

app.listen(PORT, () => {
    console.log('🚀 Cheerful Chick Server Started');
    console.log(`📱 Server running on port ${PORT}`);
    console.log(`🌐 App URL: ${process.env.APP_URL || `http://localhost:${PORT}`}`);
    console.log(`🤖 Bot Status: ${bot ? 'Connected' : 'Not configured'}`);
    console.log(`👥 Total Admins: ${db.admins.length}`);
    console.log(`👤 Total Users: ${db.users.length}`);
    console.log(`📁 Total Media: ${db.media.length}`);
    console.log('✅ Server is ready!');
});

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
});
