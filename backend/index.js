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
        fileSize: 50 * 1024 * 1024 // 50MB limit
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

// Initialize Telegram Bot
let bot = null;
if (process.env.BOT_TOKEN) {
    try {
        bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
        console.log('🤖 Telegram Bot initialized successfully');
        
        // Bot commands
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (isAdmin) {
                const welcomeMessage = `
🎉 Welcome to Cheerful Chick Admin Panel!

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
/addadmin [id] - Add new admin
/removeadmin [id] - Remove admin
/admins - List all admins

Use these commands to manage your content.
                `;
                bot.sendMessage(chatId, welcomeMessage);
            } else {
                bot.sendMessage(chatId, '⚠️ You are not authorized to use this bot. Contact the main admin for access.');
            }
        });

        // Add admin command (main admin only)
        bot.onText(/\/addadmin (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const newAdminId = parseInt(match[1]);
            
            // Check if the sender is the main admin
            if (chatId.toString() !== process.env.MAIN_ADMIN_ID) {
                bot.sendMessage(chatId, '❌ Only the main admin can add new admins.');
                return;
            }
            
            // Check if already an admin
            if (db.admins.some(a => a.id === newAdminId)) {
                bot.sendMessage(chatId, 'ℹ️ This user is already an admin.');
                return;
            }
            
            // Get user info
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
                
                // Notify the new admin
                bot.sendMessage(newAdminId, `🎉 You have been added as an admin to Cheerful Chick Bot! Use /start to see available commands.`);
            } catch (error) {
                bot.sendMessage(chatId, `❌ Error adding admin: ${error.message}`);
            }
        });

        // Remove admin command (main admin only)
        bot.onText(/\/removeadmin (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const adminIdToRemove = parseInt(match[1]);
            
            // Check if the sender is the main admin
            if (chatId.toString() !== process.env.MAIN_ADMIN_ID) {
                bot.sendMessage(chatId, '❌ Only the main admin can remove admins.');
                return;
            }
            
            // Prevent removing self
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
            
            // Notify the removed admin
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
                adminList += `   Added: ${new Date(admin.addedAt).toLocaleDateString()}\n\n`;
            });
            
            if (db.admins.length === 0) {
                adminList += 'No additional admins added.';
            }
            
            bot.sendMessage(chatId, adminList);
        });

        // Payment approval command (all admins)
        bot.onText(/\/approve (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId) || chatId.toString() === process.env.MAIN_ADMIN_ID;
            
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to approve payments.');
                return;
            }
            
            const paymentId = match[1];
            
            try {
                const payment = db.payments.find(p => p.id === paymentId);
                if (payment && payment.status === 'pending') {
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
                        status: 'approved'
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
                    if (bot) {
                        try {
                            await bot.sendMessage(payment.userId, `✅ Your payment for "${media ? media.title : 'item'}" has been approved! You can now access the content.`);
                        } catch (e) {
                            console.error('Error notifying user:', e);
                        }
                    }

                    // Notify all admins
                    db.admins.forEach(admin => {
                        try {
                            bot.sendMessage(admin.id, `✅ Payment ${paymentId} approved by admin ${chatId}`);
                        } catch (e) {
                            console.error('Error notifying admin:', e);
                        }
                    });

                    bot.sendMessage(chatId, `✅ Payment ${paymentId} has been approved successfully!`);
                } else if (payment && payment.status === 'approved') {
                    bot.sendMessage(chatId, `ℹ️ Payment ${paymentId} is already approved.`);
                } else {
                    bot.sendMessage(chatId, `❌ Payment not found or already processed.`);
                }
            } catch (error) {
                bot.sendMessage(chatId, `❌ Error approving payment: ${error.message}`);
            }
        });

        // Upload command (all admins)
        bot.onText(/\/upload/, (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId) || chatId.toString() === process.env.MAIN_ADMIN_ID;
            
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to upload content.');
                return;
            }
            
            bot.sendMessage(chatId, '📤 Please send the media file (photo or video) you want to upload.');
            
            // Store upload state
            uploadStates[chatId] = { step: 'file' };
        });

        // Handle file uploads from bot
        bot.on('photo', async (msg) => {
            const chatId = msg.chat.id;
            if (!uploadStates[chatId]) return;

            const isAdmin = db.admins.some(a => a.id === chatId) || chatId.toString() === process.env.MAIN_ADMIN_ID;
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to upload content.');
                delete uploadStates[chatId];
                return;
            }

            try {
                const photo = msg.photo[msg.photo.length - 1];
                const file = await bot.getFile(photo.file_id);
                const filePath = file.file_path;
                const fileName = `media-${Date.now()}.jpg`;
                const localPath = path.join(__dirname, 'uploads/media', fileName);
                
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

            const isAdmin = db.admins.some(a => a.id === chatId) || chatId.toString() === process.env.MAIN_ADMIN_ID;
            if (!isAdmin) {
                bot.sendMessage(chatId, '❌ You are not authorized to upload content.');
                delete uploadStates[chatId];
                return;
            }

            try {
                const video = msg.video;
                const file = await bot.getFile(video.file_id);
                const filePath = file.file_path;
                const fileName = `media-${Date.now()}.mp4`;
                const localPath = path.join(__dirname, 'uploads/media', fileName);
                
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
                    
                    // Show preview
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
                        // Save to database
                        const newMedia = {
                            id: db.media.length + 1,
                            type: state.type,
                            title: state.title,
                            description: state.description,
                            price: state.price,
                            url: `${process.env.APP_URL}${state.filePath}`,
                            thumbnail: `${process.env.APP_URL}${state.filePath}`,
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
                        if (bot) {
                            db.users.forEach(user => {
                                try {
                                    bot.sendMessage(user.id, `🎉 New content available: ${state.title}`);
                                } catch (e) {
                                    console.error('Error notifying user:', e);
                                }
                            });
                        }
                        
                        // Notify all admins
                        db.admins.forEach(admin => {
                            try {
                                if (admin.id !== chatId) {
                                    bot.sendMessage(admin.id, `📤 New content uploaded by admin ${chatId}: ${state.title}`);
                                }
                            } catch (e) {
                                console.error('Error notifying admin:', e);
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

        // Handle new user messages
        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            
            // Check if user is not admin
            const isAdmin = db.admins.some(a => a.id === chatId) || chatId.toString() === process.env.MAIN_ADMIN_ID;
            if (isAdmin) return;
            
            // Forward user messages to all admins
            if (msg.text && !msg.text.startsWith('/')) {
                const user = db.users.find(u => u.id === chatId);
                const userName = user ? user.firstName || 'User' : 'User';
                
                // Notify all admins
                db.admins.forEach(admin => {
                    try {
                        bot.sendMessage(admin.id, `💬 New message from ${userName} (${chatId}):\n\n${msg.text}`);
                    } catch (e) {
                        console.error('Error notifying admin:', e);
                    }
                });
                
                // Also notify main admin
                if (process.env.MAIN_ADMIN_ID) {
                    try {
                        bot.sendMessage(process.env.MAIN_ADMIN_ID, `💬 New message from ${userName} (${chatId}):\n\n${msg.text}`);
                    } catch (e) {
                        console.error('Error notifying main admin:', e);
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error initializing bot:', error);
    }
}

// Upload states for bot
const uploadStates = {};

// In-memory storage (replace with MongoDB in production)
const db = {
    admins: [], // List of admin users
    users: [],
    media: [
        {
            id: 1,
            type: 'video',
            title: 'Welcome Video',
            description: 'Welcome to Cheerful Chick!',
            price: 0,
            url: 'https://www.w3schools.com/html/mov_bbb.mp4',
            thumbnail: 'https://via.placeholder.com/300x200/1a1a1a/d4af37?text=Welcome',
            duration: '0:30',
            date: new Date().toISOString().split('T')[0],
            isPurchased: false,
            uploadDate: new Date().toISOString(),
            uploadedBy: process.env.MAIN_ADMIN_ID
        }
    ],
    payments: [],
    purchases: [],
    messages: [],
    stats: {
        totalUsers: 0,
        totalSales: 0,
        totalRevenue: 0
    }
};

// Add main admin to admins list if not already present
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

// ============ API ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
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
            url: `${process.env.APP_URL}/uploads/media/${file.filename}`,
            thumbnail: `${process.env.APP_URL}/uploads/media/${file.filename}`,
            duration: req.body.duration || null,
            date: new Date().toISOString().split('T')[0],
            isPurchased: false,
            filename: file.filename,
            uploadDate: new Date().toISOString(),
            purchases: 0,
            uploadedBy: parseInt(adminId)
        };

        db.media.push(newMedia);

        // Notify all users about new content
        if (bot) {
            db.users.forEach(user => {
                try {
                    bot.sendMessage(user.id, `🎉 New content available: ${title}`);
                } catch (e) {
                    console.error('Error notifying user:', e);
                }
            });
            
            // Notify all admins
            db.admins.forEach(admin => {
                try {
                    if (admin.id !== parseInt(adminId)) {
                        bot.sendMessage(admin.id, `📤 New content uploaded by admin: ${title}`);
                    }
                } catch (e) {
                    console.error('Error notifying admin:', e);
                }
            });
        }

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
        // Delete file
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

// Submit payment with screenshot
app.post('/api/payments/submit', upload.single('screenshot'), async (req, res) => {
    try {
        const { userId, userName, itemId, amount } = req.body;
        const screenshot = req.file;

        if (!screenshot) {
            return res.status(400).json({ error: 'Payment screenshot is required' });
        }

        const payment = {
            id: uuidv4(),
            userId: parseInt(userId),
            userName: userName || 'User',
            itemId: parseInt(itemId),
            amount: parseFloat(amount),
            status: 'pending',
            screenshot: `${process.env.APP_URL}/uploads/screenshots/${screenshot.filename}`,
            timestamp: new Date().toISOString(),
            approvedAt: null,
            approvedBy: null
        };

        db.payments.push(payment);

        // Notify all admins about new payment
        if (bot) {
            const message = `
💳 New Payment Submitted!

User: ${userName} (${userId})
Item ID: ${itemId}
Amount: $${amount}
Payment ID: ${payment.id}

Use: /approve ${payment.id} to approve
            `;
            
            // Notify all admins
            db.admins.forEach(admin => {
                try {
                    bot.sendMessage(admin.id, message);
                    
                    // Send screenshot to admin
                    if (screenshot) {
                        const photoPath = path.join(__dirname, 'uploads/screenshots', screenshot.filename);
                        bot.sendPhoto(admin.id, photoPath, {
                            caption: `📸 Payment screenshot for ${payment.id}`
                        });
                    }
                } catch (e) {
                    console.error('Error notifying admin:', e);
                }
            });
            
            // Also notify main admin
            if (process.env.MAIN_ADMIN_ID) {
                try {
                    bot.sendMessage(process.env.MAIN_ADMIN_ID, message);
                    if (screenshot) {
                        const photoPath = path.join(__dirname, 'uploads/screenshots', screenshot.filename);
                        bot.sendPhoto(process.env.MAIN_ADMIN_ID, photoPath, {
                            caption: `📸 Payment screenshot for ${payment.id}`
                        });
                    }
                } catch (e) {
                    console.error('Error notifying main admin:', e);
                }
            }
        }

        res.status(201).json({
            success: true,
            message: 'Payment submitted for approval',
            paymentId: payment.id
        });

    } catch (error) {
        console.error('Payment submission error:', error);
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

// Approve payment (admin only)
app.post('/api/payments/approve', verifyAdmin, (req, res) => {
    const { paymentId, adminId } = req.body;
    const payment = db.payments.find(p => p.id === paymentId);
    
    if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status === 'approved') {
        return res.status(400).json({ error: 'Payment already approved' });
    }

    // Update payment status
    payment.status = 'approved';
    payment.approvedAt = new Date().toISOString();
    payment.approvedBy = parseInt(adminId);

    // Create purchase record
    const purchase = {
        id: db.purchases.length + 1,
        userId: payment.userId,
        itemId: payment.itemId,
        amount: payment.amount,
        purchaseDate: new Date().toISOString(),
        paymentId: payment.id,
        status: 'approved',
        approvedBy: parseInt(adminId)
    };
    db.purchases.push(purchase);

    // Update stats
    db.stats.totalSales++;
    db.stats.totalRevenue += payment.amount;

    // Find the media item and mark as purchased
    const media = db.media.find(m => m.id === payment.itemId);
    if (media) {
        media.isPurchased = true;
        media.purchases = (media.purchases || 0) + 1;
        if (!media.purchasedBy) media.purchasedBy = [];
        media.purchasedBy.push(payment.userId);
    }

    // Notify user about approval
    if (bot) {
        try {
            bot.sendMessage(payment.userId, `✅ Your payment for "${media ? media.title : 'item'}" has been approved! You can now access the content.`);
        } catch (e) {
            console.error('Error notifying user:', e);
        }
    }

    res.json({
        success: true,
        message: 'Payment approved successfully',
        purchase: purchase
    });
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
        // Get last message for each user
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

// Add admin (main admin only)
app.post('/api/admins/add', verifyAdmin, (req, res) => {
    const { adminId, username, firstName, lastName } = req.body;
    const requesterId = req.headers['x-admin-id'];
    
    // Check if requester is main admin
    if (requesterId !== process.env.MAIN_ADMIN_ID) {
        return res.status(403).json({ error: 'Only main admin can add new admins' });
    }
    
    // Check if already admin
    if (db.admins.some(a => a.id === parseInt(adminId))) {
        return res.status(400).json({ error: 'User is already an admin' });
    }
    
    const newAdmin = {
        id: parseInt(adminId),
        username: username || 'Unknown',
        firstName: firstName || 'Unknown',
        lastName: lastName || '',
        addedAt: new Date().toISOString(),
        addedBy: parseInt(requesterId),
        role: 'admin'
    };
    
    db.admins.push(newAdmin);
    
    // Notify the new admin
    if (bot) {
        try {
            bot.sendMessage(adminId, '🎉 You have been added as an admin to Cheerful Chick Bot! Use /start to see available commands.');
        } catch (e) {
            console.error('Error notifying new admin:', e);
        }
    }
    
    res.json({ success: true, admin: newAdmin });
});

// Remove admin (main admin only)
app.delete('/api/admins/remove/:id', verifyAdmin, (req, res) => {
    const adminId = parseInt(req.params.id);
    const requesterId = req.headers['x-admin-id'];
    
    // Check if requester is main admin
    if (requesterId !== process.env.MAIN_ADMIN_ID) {
        return res.status(403).json({ error: 'Only main admin can remove admins' });
    }
    
    // Prevent removing self
    if (adminId === parseInt(process.env.MAIN_ADMIN_ID)) {
        return res.status(400).json({ error: 'Cannot remove main admin' });
    }
    
    const index = db.admins.findIndex(a => a.id === adminId);
    if (index === -1) {
        return res.status(404).json({ error: 'Admin not found' });
    }
    
    const removedAdmin = db.admins[index];
    db.admins.splice(index, 1);
    
    // Notify the removed admin
    if (bot) {
        try {
            bot.sendMessage(adminId, '❌ You have been removed as an admin.');
        } catch (e) {
            console.error('Error notifying removed admin:', e);
        }
    }
    
    res.json({ success: true, message: 'Admin removed', admin: removedAdmin });
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

    // Notify all admins about new message
    if (bot) {
        const user = db.users.find(u => u.id === parseInt(userId));
        const userName = user ? user.firstName || 'User' : 'User';
        
        // Notify all admins
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

// Mark message as read
app.post('/api/chat/read/:messageId', (req, res) => {
    const message = db.messages.find(m => m.id === parseInt(req.params.messageId));
    if (message) {
        message.read = true;
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Message not found' });
    }
});

// Mark all messages as read for a user
app.post('/api/chat/read/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const adminId = parseInt(req.headers['x-admin-id'] || process.env.MAIN_ADMIN_ID);
    
    db.messages.forEach(msg => {
        if (msg.userId === userId && msg.recipientId === adminId) {
            msg.read = true;
        }
    });
    
    res.json({ success: true });
});

// Send notification to user (admin)
app.post('/api/chat/notify', verifyAdmin, (req, res) => {
    const { userId, message } = req.body;
    
    if (bot) {
        try {
            bot.sendMessage(userId, `📩 Admin: ${message}`);
            res.json({ success: true, message: 'Notification sent' });
        } catch (error) {
            console.error('Error sending notification:', error);
            res.status(500).json({ error: 'Failed to send notification' });
        }
    } else {
        res.status(500).json({ error: 'Bot not configured' });
    }
});

// ============ STATS ROUTES ============

// Get statistics (admin only)
app.get('/api/stats', verifyAdmin, (req, res) => {
    res.json({
        ...db.stats,
        totalMedia: db.media.length,
        totalPayments: db.payments.length,
        pendingPayments: db.payments.filter(p => p.status === 'pending').length,
        totalAdmins: db.admins.length,
        users: db.users.map(u => ({
            id: u.id,
            username: u.username,
            firstName: u.firstName,
            registeredAt: u.registeredAt,
            lastActive: u.lastActive
        })),
        media: db.media.map(m => ({
            id: m.id,
            title: m.title,
            type: m.type,
            price: m.price,
            purchases: m.purchases || 0,
            date: m.date,
            uploadedBy: m.uploadedBy
        }))
    });
});

// ============ ADMIN DASHBOARD STATS ============

// Get admin dashboard stats
app.get('/api/admin/stats', verifyAdmin, (req, res) => {
    const totalUsers = db.users.length;
    const totalMessages = db.messages.length;
    const unreadMessages = db.messages.filter(m => !m.read).length;
    const pendingPayments = db.payments.filter(p => p.status === 'pending').length;
    const totalRevenue = db.purchases.reduce((sum, p) => sum + p.amount, 0);
    
    // Get recent activity
    const recentUsers = db.users
        .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive))
        .slice(0, 5);
    
    const recentPayments = db.payments
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5);
    
    res.json({
        totalUsers,
        totalMessages,
        unreadMessages,
        pendingPayments,
        totalRevenue,
        totalPurchases: db.purchases.length,
        totalMedia: db.media.length,
        totalAdmins: db.admins.length,
        recentUsers,
        recentPayments
    });
});

// ============ SERVE FRONTEND ============

// Serve static files
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

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
});
