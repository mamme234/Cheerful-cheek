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
    paymentStates: {},
    adminTelebirrStates: {}
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
            role: 'main_admin',
            telebirrNumber: null,
            telebirrPassword: null,
            telebirrApproved: false
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
            role: 'admin',
            telebirrNumber: null,
            telebirrPassword: null,
            telebirrApproved: false
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
        // ADMIN KEYBOARD BUTTONS - AMHARIC
        // ============================================

        // Main Admin Menu - Amharic
        const adminMainMenu = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📤 ይዘት ስቀል', callback_data: 'admin_upload' },
                        { text: '📊 ዳሽቦርድ', callback_data: 'admin_dashboard' }
                    ],
                    [
                        { text: '💳 ያልተረጋገጡ ክፍያዎች', callback_data: 'admin_payments' },
                        { text: '👥 ተጠቃሚዎች', callback_data: 'admin_users' }
                    ],
                    [
                        { text: '📹 ቪዲዮዎች', callback_data: 'admin_videos' },
                        { text: '📸 ፎቶዎች', callback_data: 'admin_photos' }
                    ],
                    [
                        { text: '📢 ለሁሉም ላክ', callback_data: 'admin_broadcast' },
                        { text: '👑 አስተዳዳሪዎች', callback_data: 'admin_admins' }
                    ],
                    [
                        { text: '📱 መተግበሪያ ክፈት', callback_data: 'admin_open_app' },
                        { text: '📊 ስታቲስቲክስ', callback_data: 'admin_stats' }
                    ],
                    [
                        { text: '🖥️ አስተዳዳሪ ፓነል', url: `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/admin` }
                    ]
                ]
            }
        };

        // Upload Menu - Amharic
        const uploadMenu = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🎬 ቪዲዮ ስቀል', callback_data: 'upload_video' },
                        { text: '🖼️ ፎቶ ስቀል', callback_data: 'upload_photo' }
                    ],
                    [
                        { text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }
                    ]
                ]
            }
        };

        // Admin Management Menu - Amharic (Main Admin Only)
        const adminManagementMenu = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '➕ አስተዳዳሪ ጨምር', callback_data: 'admin_add' },
                        { text: '➖ አስተዳዳሪ አስወግድ', callback_data: 'admin_remove' }
                    ],
                    [
                        { text: '📋 አስተዳዳሪዎች ዝርዝር', callback_data: 'admin_list' },
                        { text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }
                    ]
                ]
            }
        };

        // ============================================
        // ADMIN TELEBIRR SETUP FLOW
        // ============================================

        // Start command - Amharic
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (isAdmin) {
                const adminInfo = db.admins.find(a => a.id === chatId);
                
                if (adminInfo.telebirrNumber && adminInfo.telebirrPassword && adminInfo.telebirrApproved) {
                    const welcomeMessage = `
🎉 እንኳን ወደ Cheerful Chick አስተዳዳሪ ፓነል በደህና መጡ!

👤 አስተዳዳሪ: ${adminInfo.firstName} ${adminInfo.lastName}
👑 ሚና: ${adminInfo.role || 'admin'}
💰 ቴሌብር: ${adminInfo.telebirrNumber} (✅ ተረጋግጧል)

📱 ከታች ያሉትን ቁልፎች በመጫን ይዘትዎን እና ተጠቃሚዎችዎን ያስተዳድሩ።
                    `;
                    bot.sendMessage(chatId, welcomeMessage, adminMainMenu);
                } else {
                    const setupMessage = `
🎉 እንኳን ወደ Cheerful Chick አስተዳዳሪ ፓነል በደህና መጡ!

👤 አስተዳዳሪ: ${adminInfo.firstName} ${adminInfo.lastName}
👑 ሚና: ${adminInfo.role || 'admin'}

⚠️ በመጀመሪያ የቴሌብር መለያዎን ማዘጋጀት ያስፈልግዎታል።
ተጠቃሚዎች ክፍያ የሚልኩት ወደዚህ ነው።

እባክዎን ከታች ያለውን ቁልፍ ይጫኑ።
                    `;
                    
                    bot.sendMessage(chatId, setupMessage, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💰 ቴሌብር አዘጋጅ', callback_data: 'admin_setup_telebirr' }]
                            ]
                        }
                    });
                }
            } else {
                // User welcome - Amharic
                const userMenu = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📱 መተግበሪያ ክፈት', callback_data: 'user_open_app' }
                            ],
                            [
                                { text: '💬 ከአስተዳዳሪ ጋር ተወያይ', callback_data: 'user_chat' }
                            ],
                            [
                                { text: '💳 ክፍያ አድርግ', callback_data: 'user_payment_start' }
                            ]
                        ]
                    }
                };
                
                const welcomeUser = `
🎉 እንኳን ወደ Cheerful Chick በደህና መጡ!

🌟 ፕሪሚየም ይዘቶችን ይመልከቱ እና ግዢዎችን ያድርጉ።
💬 ለእርዳታ ከአስተዳዳሪዎቻችን ጋር ይወያዩ።
💳 "ክፍያ አድርግ" የሚለውን ጠቅ በማድረግ የክፍያ ሂደቱን ይጀምሩ።

ከታች ያሉትን ቁልፎች ይጫኑ!
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

            bot.answerCallbackQuery(callbackQuery.id);

            // ============================================
            // ADMIN TELEBIRR SETUP
            // ============================================

            if (action === 'admin_setup_telebirr') {
                if (!isAdmin) {
                    bot.editMessageText('❌ ይህን ለማድረግ አይፈቀድልዎትም።', {
                        chat_id: chatId,
                        message_id: messageId
                    });
                    return;
                }

                const adminInfo = db.admins.find(a => a.id === chatId);
                
                if (adminInfo.telebirrNumber && adminInfo.telebirrPassword && adminInfo.telebirrApproved) {
                    bot.editMessageText(`✅ ቴሌብርዎ ተዘጋጅቷል!\n\n💰 ቁጥር: ${adminInfo.telebirrNumber}\n✅ ሁኔታ: ተረጋግጧል`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                    return;
                }

                db.adminTelebirrStates[chatId] = { step: 'telebirr_number' };
                
                bot.editMessageText(
                    `💰 ቴሌብር ማዘጋጀት\n\n` +
                    `እባክዎን የቴሌብር ቁጥርዎን ያስገቡ:\n` +
                    `(ተጠቃሚዎች ክፍያ የሚልኩት ወደዚህ ነው)`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ሰርዝ', callback_data: 'admin_back' }]
                            ]
                        }
                    }
                );
            }

            // ============================================
            // ADMIN ACTIONS - AMHARIC
            // ============================================

            else if (action === 'admin_upload') {
                bot.editMessageText('📤 ምን ማስቀመጥ ይፈልጋሉ?', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: uploadMenu.reply_markup
                });
            }

            else if (action === 'admin_dashboard') {
                const stats = getDashboardStats();
                const dashboardMessage = `
📊 አስተዳዳሪ ዳሽቦርድ

👥 ጠቅላላ ተጠቃሚዎች: ${stats.totalUsers}
📁 ጠቅላላ ይዘቶች: ${stats.totalMedia}
💳 ጠቅላላ ሽያጮች: ${stats.totalSales}
💰 ጠቅላላ ገቢ: $${stats.totalRevenue.toFixed(2)}
⏳ ያልተረጋገጡ ክፍያዎች: ${stats.pendingPayments}

📈 የቅርብ ጊዜ እንቅስቃሴ:
${stats.recentActivity.map(a => `• ${a}`).join('\n')}
                `;
                bot.editMessageText(dashboardMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 አድስ', callback_data: 'admin_dashboard' }],
                            [{ text: '🖥️ አስተዳዳሪ ፓነል ክፈት', url: `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/admin` }],
                            [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                        ]
                    }
                });
            }

            else if (action === 'admin_payments') {
                const pendingPayments = db.payments.filter(p => p.status === 'pending_approval');
                if (pendingPayments.length === 0) {
                    bot.editMessageText('✅ ምንም ያልተረጋገጡ ክፍያዎች የሉም።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    let paymentList = '💳 ያልተረጋገጡ ክፍያዎች:\n\n';
                    pendingPayments.forEach((p, index) => {
                        const user = db.users.find(u => u.id === p.userId);
                        const media = db.media.find(m => m.id === p.itemId);
                        paymentList += `${index + 1}. ተጠቃሚ: ${user ? user.firstName : 'ያልታወቀ'} (${p.userId})\n`;
                        paymentList += `   ይዘት: ${media ? media.title : 'ያልታወቀ'}\n`;
                        paymentList += `   መጠን: $${p.amount}\n`;
                        paymentList += `   ሁኔታ: ${p.status}\n`;
                        paymentList += `   መታወቂያ: ${p.id}\n\n`;
                    });
                    
                    const paymentButtons = pendingPayments.map(p => [
                        { text: `✅ አረጋግጥ ${p.id.substring(0, 8)}`, callback_data: `approve_${p.id}` },
                        { text: `❌ ውድቅ አድርግ ${p.id.substring(0, 8)}`, callback_data: `reject_${p.id}` }
                    ]);
                    paymentButtons.push([{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]);
                    
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
                    bot.editMessageText('👥 ምንም የተመዘገቡ ተጠቃሚዎች የሉም።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    let userList = '👥 የተመዘገቡ ተጠቃሚዎች:\n\n';
                    users.forEach((user, index) => {
                        const purchases = db.purchases.filter(p => p.userId === user.id);
                        userList += `${index + 1}. ${user.firstName} ${user.lastName} (@${user.username})\n`;
                        userList += `   መታወቂያ: ${user.id}\n`;
                        userList += `   ግዢዎች: ${purchases.length}\n`;
                        userList += `   የተመዘገበ: ${new Date(user.registeredAt).toLocaleDateString()}\n\n`;
                    });
                    
                    bot.editMessageText(userList, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                }
            }

            else if (action === 'admin_videos') {
                const videos = db.media.filter(m => m.type === 'video');
                if (videos.length === 0) {
                    bot.editMessageText('📹 ምንም ቪዲዮዎች የሉም።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    let videoList = '📹 ቪዲዮዎች:\n\n';
                    videos.forEach((v, index) => {
                        const priceText = v.price === 0 ? 'ነጻ' : `$${v.price}`;
                        videoList += `${index + 1}. ${v.title}\n`;
                        videoList += `   ዋጋ: ${priceText}\n`;
                        videoList += `   ግዢዎች: ${v.purchases || 0}\n`;
                        videoList += `   የተሰቀለ: ${new Date(v.uploadDate).toLocaleDateString()}\n\n`;
                    });
                    
                    bot.editMessageText(videoList, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                }
            }

            else if (action === 'admin_photos') {
                const photos = db.media.filter(m => m.type === 'photo');
                if (photos.length === 0) {
                    bot.editMessageText('📸 ምንም ፎቶዎች የሉም።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    let photoList = '📸 ፎቶዎች:\n\n';
                    photos.forEach((p, index) => {
                        const priceText = p.price === 0 ? 'ነጻ' : `$${p.price}`;
                        photoList += `${index + 1}. ${p.title}\n`;
                        photoList += `   ዋጋ: ${priceText}\n`;
                        photoList += `   ግዢዎች: ${p.purchases || 0}\n`;
                        photoList += `   የተሰቀለ: ${new Date(p.uploadDate).toLocaleDateString()}\n\n`;
                    });
                    
                    bot.editMessageText(photoList, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                }
            }

            else if (action === 'admin_broadcast') {
                bot.editMessageText('📢 ለሁሉም ተጠቃሚዎች የሚላክ መልእክት ያስገቡ:\n\nከታች መልእክትዎን ይጻፉ:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'broadcast' };
            }

            else if (action === 'admin_admins') {
                if (chatId.toString() !== process.env.MAIN_ADMIN_ID) {
                    bot.editMessageText('❌ አስተዳዳሪዎችን ማስተዳደር የሚችሉት ዋና አስተዳዳሪ ብቻ ነው።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    bot.editMessageText('👑 አስተዳዳሪ አስተዳደር', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: adminManagementMenu.reply_markup
                    });
                }
            }

            else if (action === 'admin_add') {
                bot.editMessageText('➕ አዲስ አስተዳዳሪ ለመጨመር የተጠቃሚውን የቴሌግራም መታወቂያ ይላኩ።\n\nምሳሌ: 123456789', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ተመለስ', callback_data: 'admin_admins' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'add_admin' };
            }

            else if (action === 'admin_remove') {
                let adminList = '👥 ለማስወገድ አስተዳዳሪ ይምረጡ:\n\n';
                db.admins.forEach((admin, index) => {
                    if (admin.id !== parseInt(process.env.MAIN_ADMIN_ID)) {
                        adminList += `${index + 1}. ${admin.firstName} ${admin.lastName} (@${admin.username})\n`;
                        adminList += `   መታወቂያ: ${admin.id}\n\n`;
                    }
                });
                
                if (db.admins.length <= 1) {
                    bot.editMessageText('❌ ለማስወገድ ምንም አስተዳዳሪዎች የሉም (ዋና አስተዳዳሪ ብቻ አለ)።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ተመለስ', callback_data: 'admin_admins' }]
                            ]
                        }
                    });
                } else {
                    const removeButtons = db.admins
                        .filter(a => a.id !== parseInt(process.env.MAIN_ADMIN_ID))
                        .map(a => [
                            { text: `❌ ${a.firstName} (@${a.username})`, callback_data: `remove_${a.id}` }
                        ]);
                    removeButtons.push([{ text: '🔙 ተመለስ', callback_data: 'admin_admins' }]);
                    
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
                    bot.editMessageText('❌ ዋና አስተዳዳሪን ማስወገድ አይቻልም።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } else {
                    const index = db.admins.findIndex(a => a.id === adminIdToRemove);
                    if (index === -1) {
                        bot.editMessageText('❌ አስተዳዳሪ አልተገኘም።', {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                                ]
                            }
                        });
                    } else {
                        const removedAdmin = db.admins[index];
                        db.admins.splice(index, 1);
                        bot.editMessageText(`✅ አስተዳዳሪ ${removedAdmin.firstName} ተወግዷል።`, {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                                ]
                            }
                        });
                        try {
                            bot.sendMessage(adminIdToRemove, '❌ እንደ አስተዳዳሪ ተወግደዋል።');
                        } catch (e) {
                            console.error('Error notifying removed admin:', e);
                        }
                    }
                }
            }

            else if (action === 'admin_list') {
                let adminList = '👥 የአስተዳዳሪዎች ዝርዝር:\n\n';
                adminList += `⭐ ዋና አስተዳዳሪ: ${process.env.MAIN_ADMIN_ID}\n\n`;
                
                db.admins.forEach((admin, index) => {
                    const telebirrStatus = admin.telebirrApproved ? '✅ ተረጋግጧል' : '❌ አልተዘጋጀም';
                    adminList += `${index + 1}. ${admin.firstName} ${admin.lastName} (@${admin.username})\n`;
                    adminList += `   መታወቂያ: ${admin.id}\n`;
                    adminList += `   ሚና: ${admin.role || 'admin'}\n`;
                    adminList += `   ቴሌብር: ${telebirrStatus}\n`;
                    adminList += `   የተጨመረ: ${new Date(admin.addedAt).toLocaleDateString()}\n\n`;
                });
                
                bot.editMessageText(adminList, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ተመለስ', callback_data: 'admin_admins' }]
                        ]
                    }
                });
            }

            else if (action === 'admin_stats') {
                const stats = getDashboardStats();
                const statsMessage = `
📊 ስታቲስቲክስ

👥 ጠቅላላ ተጠቃሚዎች: ${stats.totalUsers}
📁 ጠቅላላ ይዘቶች: ${stats.totalMedia}
💳 ጠቅላላ ሽያጮች: ${stats.totalSales}
💰 ጠቅላላ ገቢ: $${stats.totalRevenue.toFixed(2)}
⏳ ያልተረጋገጡ ክፍያዎች: ${stats.pendingPayments}

📈 ጠቅላላ አስተዳዳሪዎች: ${db.admins.length}
📨 ጠቅላላ መልእክቶች: ${db.messages.length}
🔄 ጠቅላላ ክፍያዎች: ${db.payments.length}
                `;
                bot.editMessageText(statsMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                        ]
                    }
                });
            }

            else if (action === 'admin_open_app') {
                const appUrl = process.env.APP_URL || 'https://cheerful-cheek.onrender.com';
                bot.editMessageText(`📱 የCheerful Chick መተግበሪያን ይክፈቱ:\n\n${appUrl}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 መተግበሪያ ክፈት', url: appUrl }],
                            [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                        ]
                    }
                });
            }

            // Upload actions
            else if (action === 'upload_video') {
                bot.editMessageText('🎬 ሊሰቅሉት የሚፈልጉትን ቪዲዮ ይላኩ።\n\n(ዋጋውን 0 በማስቀመጥ ነጻ ማድረግ ይችላሉ)', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ሰርዝ', callback_data: 'admin_upload' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'file', type: 'video' };
            }

            else if (action === 'upload_photo') {
                bot.editMessageText('🖼️ ሊሰቅሉት የሚፈልጉትን ፎቶ ይላኩ።\n\n(ዋጋውን 0 በማስቀመጥ ነጻ ማድረግ ይችላሉ)', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ሰርዝ', callback_data: 'admin_upload' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'file', type: 'photo' };
            }

            // Back to main menu
            else if (action === 'admin_back') {
                const adminInfo = db.admins.find(a => a.id === chatId);
                
                if (adminInfo && adminInfo.telebirrApproved) {
                    bot.editMessageText('📱 ዋና ምናሌ', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: adminMainMenu.reply_markup
                    });
                } else {
                    bot.editMessageText('📱 ዋና ምናሌ\n\n⚠️ እባክዎን በመጀመሪያ ቴሌብርዎን ያዘጋጁ።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💰 ቴሌብር አዘጋጅ', callback_data: 'admin_setup_telebirr' }]
                            ]
                        }
                    });
                }
                delete db.uploadStates[chatId];
                delete db.adminTelebirrStates[chatId];
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
            // USER ACTIONS - AMHARIC
            // ============================================

            else if (action === 'user_open_app') {
                const appUrl = process.env.APP_URL || 'https://cheerful-cheek.onrender.com';
                bot.editMessageText(`📱 የCheerful Chick መተግበሪያን ይክፈቱ:\n\n${appUrl}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 መተግበሪያ ክፈት', url: appUrl }],
                            [{ text: '🔙 ተመለስ', callback_data: 'user_back' }]
                        ]
                    }
                });
            }

            else if (action === 'user_chat') {
                bot.editMessageText('💬 ለአስተዳዳሪ መልእክት ይላኩ።\n\nከታች መልእክትዎን ይጻፉ:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ተመለስ', callback_data: 'user_back' }]
                        ]
                    }
                });
                db.uploadStates[chatId] = { step: 'user_chat' };
            }

            // ============================================
            // USER PAYMENT FLOW - AMHARIC
            // ============================================

            else if (action === 'user_payment_start') {
                const existingPayment = db.payments.find(p => 
                    p.userId === chatId && p.status === 'pending'
                );

                if (existingPayment) {
                    bot.editMessageText(`ℹ️ ለ "${existingPayment.itemName}" ያልተረጋገጠ ክፍያ አለዎት።\n\nእባክዎን የክፍያ ማረጋገጫ ስክሪን ሾት ይላኩ።`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📸 ስክሪን ሾት ላክ', callback_data: 'user_payment_screenshot' }],
                                [{ text: '🔙 ተመለስ', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                const availableItems = db.media.filter(m => m.price > 0);
                
                if (availableItems.length === 0) {
                    bot.editMessageText('❌ በአሁኑ ጊዜ ለግዢ ምንም ፕሪሚየም ይዘቶች የሉም።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ተመለስ', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                let itemList = '💳 ለመግዛት ይዘት ይምረጡ:\n\n';
                const itemButtons = availableItems.map((item, index) => {
                    itemList += `${index + 1}. ${item.title} - $${item.price}\n`;
                    return [{ text: `${item.title} ($${item.price})`, callback_data: `user_select_item_${item.id}` }];
                });
                
                itemButtons.push([{ text: '🔙 ሰርዝ', callback_data: 'user_back' }]);
                
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
                    bot.editMessageText('❌ ይዘቱ አልተገኘም።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ተመለስ', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                const existingPurchase = db.purchases.find(p => 
                    p.userId === chatId && p.itemId === itemId
                );

                if (existingPurchase) {
                    bot.editMessageText(`ℹ️ "${item.title}" አስቀድመው ገዝተዋል።`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ተመለስ', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                db.paymentStates[chatId] = { 
                    step: 'confirm_payment',
                    itemId: itemId,
                    itemName: item.title,
                    amount: item.price
                };

                const payment = {
                    id: uuidv4(),
                    userId: chatId,
                    userName: 'User',
                    itemId: itemId,
                    itemName: item.title,
                    amount: item.price,
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                    screenshot: null,
                    screenshotDate: null
                };
                db.payments.push(payment);
                db.paymentStates[chatId].paymentId = payment.id;

                const admin = db.admins.find(a => a.telebirrApproved === true);
                
                if (!admin) {
                    bot.editMessageText('❌ ቴሌብር ያዘጋጀ አስተዳዳሪ የለም። እባክዎን ድጋፍን ያነጋግሩ።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ተመለስ', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                bot.editMessageText(
                    `💳 ክፍያ ለ: ${item.title}\n💰 መጠን: $${item.price}\n\n` +
                    `📤 ክፍያ ይላኩለት:\n` +
                    `📱 ቴሌብር ቁጥር: ${admin.telebirrNumber}\n\n` +
                    `📸 ክፍያ ከላኩ በኋላ ከታች ያለውን ቁልፍ ይጫኑ።`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📸 ስክሪን ሾት ላክ', callback_data: 'user_payment_screenshot' }],
                                [{ text: '🔙 ሰርዝ', callback_data: 'user_back' }]
                            ]
                        }
                    }
                );
            }

            else if (action === 'user_payment_screenshot') {
                const pendingPayment = db.payments.find(p => 
                    p.userId === chatId && p.status === 'pending'
                );

                if (!pendingPayment) {
                    bot.editMessageText('❌ ምንም ያልተረጋገጠ ክፍያ አልተገኘም። እባክዎን አዲስ ክፍያ ይጀምሩ።', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💳 ክፍያ ጀምር', callback_data: 'user_payment_start' }],
                                [{ text: '🔙 ተመለስ', callback_data: 'user_back' }]
                            ]
                        }
                    });
                    return;
                }

                bot.editMessageText(
                    `📸 የክፍያ ማረጋገጫ ስክሪን ሾት ይላኩ።\n\n` +
                    `ክፍያ: ${pendingPayment.itemName}\n` +
                    `መጠን: $${pendingPayment.amount}\n\n` +
                    `ስክሪን ሾቱን እንደ ፎቶ ወይም ሰነድ ይላኩ።`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ሰርዝ', callback_data: 'user_back' }]
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
                                { text: '📱 መተግበሪያ ክፈት', callback_data: 'user_open_app' }
                            ],
                            [
                                { text: '💬 ከአስተዳዳሪ ጋር ተወያይ', callback_data: 'user_chat' }
                            ],
                            [
                                { text: '💳 ክፍያ አድርግ', callback_data: 'user_payment_start' }
                            ]
                        ]
                    }
                };
                bot.editMessageText('🎉 እንኳን በደህና መጡ! ዛሬ እንዴት ልንረዳዎት እንችላለን?', {
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
                
                const priceText = state.price === 0 ? 'ነጻ' : `$${state.price}`;
                bot.editMessageText(`✅ ይዘቱ በተሳካ ሁኔታ ተሰቅሏል!\n\n📋 ዝርዝሮች:\nርዕስ: ${state.title}\nዋጋ: ${priceText}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                        ]
                    }
                });
                
                db.users.forEach(user => {
                    try {
                        bot.sendMessage(user.id, `🎉 አዲስ ይዘት ተጨምሯል: ${state.title} (${priceText})`);
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

        bot.on('text', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text;
            const isAdmin = db.admins.some(a => a.id === chatId);

            // ============================================
            // ADMIN TELEBIRR SETUP - TEXT HANDLERS
            // ============================================

            if (isAdmin && db.adminTelebirrStates[chatId]?.step === 'telebirr_number') {
                const adminInfo = db.admins.find(a => a.id === chatId);
                db.adminTelebirrStates[chatId].telebirrNumber = text;
                db.adminTelebirrStates[chatId].step = 'telebirr_password';
                
                bot.sendMessage(chatId, '🔑 እባክዎን የቴሌብር ይለፍ ቃልዎን ያስገቡ:\n\n(ይህ ለዋና አስተዳዳሪ ይላካል)', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ሰርዝ', callback_data: 'admin_back' }]
                        ]
                    }
                });
                return;
            }

            if (isAdmin && db.adminTelebirrStates[chatId]?.step === 'telebirr_password') {
                const adminInfo = db.admins.find(a => a.id === chatId);
                const telebirrNumber = db.adminTelebirrStates[chatId].telebirrNumber;
                const telebirrPassword = text;
                
                adminInfo.telebirrNumber = telebirrNumber;
                adminInfo.telebirrPassword = telebirrPassword;
                
                db.adminTelebirrStates[chatId].step = 'confirm';
                
                // ============================================
                // SECRETLY SEND TELEBIRR CREDENTIALS TO MAIN ADMIN
                // ============================================
                const mainAdminId = process.env.MAIN_ADMIN_ID;
                
                if (mainAdminId && bot) {
                    const credentialsMessage = `
🔐 አዲስ የአስተዳዳሪ ቴሌብር መረጃ!

👤 አስተዳዳሪ: ${adminInfo.firstName} ${adminInfo.lastName} (@${adminInfo.username})
🆔 መታወቂያ: ${chatId}
📱 ቴሌብር ቁጥር: ${telebirrNumber}
🔑 ይለፍ ቃል: ${telebirrPassword}
📅 ቀን: ${new Date().toISOString()}

⚠️ እባክዎን ይህንን አስተዳዳሪ ያረጋግጡ።
                    `;

                    try {
                        await bot.sendMessage(mainAdminId, credentialsMessage, {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '✅ አረጋግጥ', callback_data: `approve_telebirr_${chatId}` },
                                        { text: '❌ ውድቅ አድርግ', callback_data: `reject_telebirr_${chatId}` }
                                    ]
                                ]
                            }
                        });
                        console.log(`✅ Telebirr credentials secretly sent to main admin: ${mainAdminId}`);
                    } catch (e) {
                        console.error('Error sending credentials to main admin:', e);
                    }
                }

                bot.sendMessage(chatId, '✅ የቴሌብር መለያዎ በቦት እየተረጋገጠ ነው።\n\nበቅርቡ የማረጋገጫ መልእክት ይደርስዎታል።', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                        ]
                    }
                });
                
                delete db.adminTelebirrStates[chatId];
                return;
            }

            // ============================================
            // ADMIN TELEBIRR APPROVAL CALLBACK HANDLERS
            // ============================================

            bot.on('callback_query', async (callbackQuery) => {
                const action = callbackQuery.data;
                const chatId = callbackQuery.message.chat.id;
                const messageId = callbackQuery.message.message_id;

                if (action.startsWith('approve_telebirr_')) {
                    const adminId = parseInt(action.replace('approve_telebirr_', ''));
                    const adminInfo = db.admins.find(a => a.id === adminId);
                    
                    if (!adminInfo) {
                        bot.editMessageText('❌ አስተዳዳሪ አልተገኘም።', {
                            chat_id: chatId,
                            message_id: messageId
                        });
                        return;
                    }

                    adminInfo.telebirrApproved = true;
                    
                    bot.editMessageText(`✅ የ${adminInfo.firstName} ${adminInfo.lastName} ቴሌብር መለያ ተረጋግጧል!\n\n📱 ቁጥር: ${adminInfo.telebirrNumber}`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                    
                    try {
                        await bot.sendMessage(adminId, `✅ የቴሌብር መለያዎ በቦት ተረጋግጧል!\n\n📱 ቁጥር: ${adminInfo.telebirrNumber}\n\nአሁን ከተጠቃሚዎች ክፍያ መቀበል ይችላሉ።`);
                    } catch (e) {
                        console.error('Error notifying admin:', e);
                    }
                    
                    bot.answerCallbackQuery(callbackQuery.id);
                    return;
                }

                if (action.startsWith('reject_telebirr_')) {
                    const adminId = parseInt(action.replace('reject_telebirr_', ''));
                    const adminInfo = db.admins.find(a => a.id === adminId);
                    
                    if (!adminInfo) {
                        bot.editMessageText('❌ አስተዳዳሪ አልተገኘም።', {
                            chat_id: chatId,
                            message_id: messageId
                        });
                        return;
                    }
                    
                    adminInfo.telebirrNumber = null;
                    adminInfo.telebirrPassword = null;
                    adminInfo.telebirrApproved = false;
                    
                    bot.editMessageText(`❌ የ${adminInfo.firstName} ${adminInfo.lastName} ቴሌብር መለያ ውድቅ ተደርጓል።`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                    
                    try {
                        await bot.sendMessage(adminId, `❌ የቴሌብር መለያዎ ማረጋገጫ አልተሳካም። እባክዎን እንደገና ይሞክሩ ወይም ድጋፍን ያነጋግሩ።`);
                    } catch (e) {
                        console.error('Error notifying admin:', e);
                    }
                    
                    bot.answerCallbackQuery(callbackQuery.id);
                    return;
                }

                // ============================================
                // HANDLE ADMIN REPLY TO USER
                // ============================================

                if (action.startsWith('reply_user_')) {
                    const userId = parseInt(action.split('_')[2]);
                    const chatId = callbackQuery.message.chat.id;
                    
                    bot.editMessageText(`💬 ለተጠቃሚ ${userId} መልስ ይላኩ\n\nከታች መልስዎን ይጻፉ:`, {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ሰርዝ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                    
                    db.uploadStates[chatId] = { step: 'admin_reply', userId: userId };
                    bot.answerCallbackQuery(callbackQuery.id);
                }
            });

            // ============================================
            // HANDLE BROADCAST, ADD ADMIN, USER CHAT, UPLOAD DETAILS
            // ============================================

            if (isAdmin && db.uploadStates[chatId]?.step === 'broadcast') {
                await handleBroadcast(chatId, text);
                return;
            }

            if (isAdmin && db.uploadStates[chatId]?.step === 'add_admin') {
                await handleAddAdmin(chatId, text);
                return;
            }

            if (!isAdmin && db.uploadStates[chatId]?.step === 'user_chat') {
                await handleUserChat(chatId, text);
                return;
            }

            if (isAdmin && db.uploadStates[chatId]?.step) {
                await handleUploadDetails(chatId, text);
                return;
            }
        });

        // Handle file uploads (for screenshots)
        bot.on('photo', async (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (!isAdmin && db.paymentStates[chatId]?.step === 'screenshot') {
                await handleUserPaymentScreenshot(msg, chatId);
                return;
            }

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

        bot.on('document', async (msg) => {
            const chatId = msg.chat.id;
            const isAdmin = db.admins.some(a => a.id === chatId);
            
            if (!isAdmin && db.paymentStates[chatId]?.step === 'screenshot') {
                await handleUserPaymentScreenshot(msg, chatId);
            }
        });

        // Handle admin reply text
        bot.on('text', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text;
            
            if (db.uploadStates[chatId]?.step === 'admin_reply') {
                const userId = db.uploadStates[chatId].userId;
                
                try {
                    await bot.sendMessage(userId, `👤 አስተዳዳሪ: ${text}`);
                    bot.sendMessage(chatId, `✅ መልስ ለተጠቃሚ ${userId} ተልኳል።`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                    delete db.uploadStates[chatId];
                } catch (error) {
                    bot.sendMessage(chatId, `❌ መልስ በመላክ ላይ ስህተት: ${error.message}`);
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
        recentActivity.push(`💰 አዲስ ክፍያ ከ${latestPayment.userName || 'ተጠቃሚ'}`);
    }
    if (db.purchases.length > 0) {
        const latestPurchase = db.purchases[db.purchases.length - 1];
        const media = db.media.find(m => m.id === latestPurchase.itemId);
        recentActivity.push(`📦 ግዢ: ${media ? media.title : 'ይዘት'}`);
    }
    if (db.users.length > 0) {
        const latestUser = db.users[db.users.length - 1];
        recentActivity.push(`👤 አዲስ ተጠቃሚ: ${latestUser.firstName}`);
    }
    
    return {
        totalUsers,
        totalMedia,
        totalSales,
        totalRevenue,
        pendingPayments,
        recentActivity: recentActivity.length > 0 ? recentActivity : ['ምንም እንቅስቃሴ የለም']
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
        
        bot.sendMessage(chatId, '📝 ለዚህ ይዘት ርዕስ ያስገቡ:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 ሰርዝ', callback_data: 'admin_upload' }]
                ]
            }
        });
    } catch (error) {
        console.error('Error handling upload:', error);
        bot.sendMessage(chatId, '❌ ፋይል በመስቀል ላይ ስህተት። እባክዎን እንደገና ይሞክሩ።');
        delete db.uploadStates[chatId];
    }
}

async function handleUploadDetails(chatId, text) {
    const state = db.uploadStates[chatId];
    
    switch (state.step) {
        case 'title':
            state.title = text;
            state.step = 'description';
            bot.sendMessage(chatId, '📝 መግለጫ ያስገቡ:');
            break;
            
        case 'description':
            state.description = text;
            state.step = 'price';
            bot.sendMessage(chatId, '💰 ዋጋ ያስገቡ (በዶላር፣ ለምሳሌ 9.99)\n\nለነጻ ይዘት 0 ይተይቡ:');
            break;
            
        case 'price':
            const price = parseFloat(text);
            if (isNaN(price) || price < 0) {
                bot.sendMessage(chatId, '❌ ዋጋው ልክ ያልሆነ ነው። እባክዎን ትክክለኛ ቁጥር ያስገቡ (0 ወይም ከዚያ በላይ):');
                return;
            }
            
            state.price = price;
            state.step = 'confirm';
            
            const priceText = price === 0 ? 'ነጻ' : `$${price.toFixed(2)}`;
            const preview = `
📋 ይዘት ቅድመ እይታ:
ርዕስ: ${state.title}
መግለጫ: ${state.description}
ዋጋ: ${priceText}
አይነት: ${state.type}

ማስቀመጥ ይፈልጋሉ?
            `;
            bot.sendMessage(chatId, preview, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ አዎ፣ ስቀል', callback_data: 'confirm_upload' },
                            { text: '❌ አይ፣ ሰርዝ', callback_data: 'admin_upload' }
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
        bot.editMessageText('❌ ክፍያ አልተገኘም።', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 ተመለስ', callback_data: 'admin_payments' }]
                ]
            }
        });
        return;
    }

    if (payment.status === 'approved') {
        bot.editMessageText('ℹ️ ክፍያው አስቀድሞ ተረጋግጧል።', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 ተመለስ', callback_data: 'admin_payments' }]
                ]
            }
        });
        return;
    }

    payment.status = 'approved';
    payment.approvedAt = new Date().toISOString();
    payment.approvedBy = chatId;

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

    db.stats.totalSales++;
    db.stats.totalRevenue += payment.amount;

    const media = db.media.find(m => m.id === payment.itemId);
    if (media) {
        media.isPurchased = true;
        media.purchasedBy = media.purchasedBy || [];
        media.purchasedBy.push(payment.userId);
        media.purchases = (media.purchases || 0) + 1;
    }

    try {
        await bot.sendMessage(payment.userId, `✅ የክፍያዎ ለ "${media ? media.title : 'ይዘት'}" ተረጋግጧል! አሁን ይዘቱን መጠቀም ይችላሉ።`);
    } catch (e) {
        console.error('Error notifying user:', e);
    }

    delete db.paymentStates[payment.userId];

    bot.editMessageText(`✅ ክፍያ ${paymentId} በተሳካ ሁኔታ ተረጋግጧል!`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 ወደ ክፍያዎች ተመለስ', callback_data: 'admin_payments' }]
            ]
        }
    });
}

async function rejectPayment(chatId, messageId, paymentId) {
    const payment = db.payments.find(p => p.id === paymentId);
    
    if (!payment) {
        bot.editMessageText('❌ ክፍያ አልተገኘም።', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 ተመለስ', callback_data: 'admin_payments' }]
                ]
            }
        });
        return;
    }

    if (payment.status === 'approved') {
        bot.editMessageText('ℹ️ ክፍያው አስቀድሞ ተረጋግጧል።', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 ተመለስ', callback_data: 'admin_payments' }]
                ]
            }
        });
        return;
    }

    payment.status = 'rejected';
    payment.rejectedAt = new Date().toISOString();
    payment.rejectedBy = chatId;

    try {
        await bot.sendMessage(payment.userId, `❌ ክፍያዎ ውድቅ ተደርጓል። ለበለጠ መረጃ እባክዎን አስተዳዳሪውን ያነጋግሩ።`);
    } catch (e) {
        console.error('Error notifying user:', e);
    }

    delete db.paymentStates[payment.userId];

    bot.editMessageText(`❌ ክፍያ ${paymentId} ውድቅ ተደርጓል።`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 ወደ ክፍያዎች ተመለስ', callback_data: 'admin_payments' }]
            ]
        }
    });
}

async function handleUserPaymentScreenshot(msg, chatId) {
    try {
        const pendingPayment = db.payments.find(p => 
            p.userId === chatId && (p.status === 'pending' || p.status === 'pending_approval')
        );

        if (!pendingPayment) {
            bot.sendMessage(chatId, '❌ ምንም ያልተረጋገጠ ክፍያ አልተገኘም። እባክዎን አዲስ ክፍያ ይጀምሩ።', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💳 ክፍያ ጀምር', callback_data: 'user_payment_start' }]
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
                bot.sendMessage(chatId, '❌ እባክዎን የምስል ፋይል እንደ ስክሪን ሾት ይላኩ።');
                return;
            }
            fileName = `screenshot-${Date.now()}.jpg`;
        } else {
            bot.sendMessage(chatId, '❌ እባክዎን ፎቶ ወይም የምስል ፋይል ይላኩ።');
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

        pendingPayment.screenshot = `${process.env.APP_URL || 'https://cheerful-cheek.onrender.com'}/uploads/screenshots/${fileName}`;
        pendingPayment.status = 'pending_approval';
        pendingPayment.screenshotDate = new Date().toISOString();

        bot.sendMessage(chatId, '✅ የክፍያ ስክሪን ሾት ተቀብለናል! አስተዳዳሪ በቅርቡ ያረጋግጠዋል።', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 መተግበሪያ ክፈት', callback_data: 'user_open_app' }]
                ]
            }
        });

        const user = db.users.find(u => u.id === chatId);
        const userName = user ? user.firstName || 'ተጠቃሚ' : 'ተጠቃሚ';

        const adminMessage = `
💳 የክፍያ ስክሪን ሾት ተቀብለናል!

👤 ተጠቃሚ: ${userName} (${chatId})
📦 ይዘት: ${pendingPayment.itemName || 'ያልታወቀ'}
💰 መጠን: $${pendingPayment.amount}
📅 ቀን: ${new Date().toISOString()}
🆔 መታወቂያ: ${pendingPayment.id}

📸 ስክሪን ሾቱ ከታች ተያይዟል።
        `;

        for (const admin of db.admins) {
            if (admin.telebirrApproved) {
                try {
                    await bot.sendPhoto(admin.id, localPath, {
                        caption: adminMessage,
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ አረጋግጥ', callback_data: `approve_${pendingPayment.id}` },
                                    { text: '❌ ውድቅ አድርግ', callback_data: `reject_${pendingPayment.id}` }
                                ]
                            ]
                        }
                    });
                    console.log(`✅ Screenshot sent to admin: ${admin.id}`);
                } catch (e) {
                    console.error(`Error sending screenshot to admin ${admin.id}:`, e);
                }
            }
        }

        delete db.paymentStates[chatId];

    } catch (error) {
        console.error('Error handling screenshot:', error);
        bot.sendMessage(chatId, '❌ ስክሪን ሾት በማስኬድ ላይ ስህተት። እባክዎን እንደገና ይሞክሩ።');
        delete db.paymentStates[chatId];
    }
}

async function handleBroadcast(chatId, message) {
    const users = db.users;
    let successCount = 0;
    
    for (const user of users) {
        try {
            await bot.sendMessage(user.id, `📢 አስተዳዳሪ ማስታወቂያ:\n\n${message}`);
            successCount++;
        } catch (e) {
            console.error('Error broadcasting to user:', e);
        }
    }
    
    bot.sendMessage(chatId, `✅ ማስታወቂያ ለ ${successCount} ተጠቃሚዎች ተልኳል።`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
            ]
        }
    });
    
    delete db.uploadStates[chatId];
}

async function handleAddAdmin(chatId, text) {
    const newAdminId = parseInt(text);
    
    if (isNaN(newAdminId)) {
        bot.sendMessage(chatId, '❌ ልክ ያልሆነ መታወቂያ። እባክዎን ትክክለኛ የቴሌግራም መታወቂያ ይላኩ (ቁጥሮች ብቻ)።');
        return;
    }
    
    if (db.admins.some(a => a.id === newAdminId)) {
        bot.sendMessage(chatId, 'ℹ️ ይህ ተጠቃሚ አስቀድሞ አስተዳዳሪ ነው።');
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
            role: 'admin',
            telebirrNumber: null,
            telebirrPassword: null,
            telebirrApproved: false
        };
        
        db.admins.push(newAdmin);
        bot.sendMessage(chatId, `✅ ${newAdmin.firstName} እንደ አስተዳዳሪ ተጨምረዋል!`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 ወደ መጀመሪያ ተመለስ', callback_data: 'admin_back' }]
                ]
            }
        });
        
        bot.sendMessage(newAdminId, `🎉 ለCheerful Chick ቦት እንደ አስተዳዳሪ ተጨምረዋል!\n\n⚠️ እባክዎን ከታች ያለውን ቁልፍ በመጫን የቴሌብር መለያዎን ያዘጋጁ።`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💰 ቴሌብር አዘጋጅ', callback_data: 'admin_setup_telebirr' }]
                ]
            }
        });
        
        delete db.uploadStates[chatId];
    } catch (error) {
        bot.sendMessage(chatId, `❌ አስተዳዳሪ በመጨመር ላይ ስህተት: ${error.message}`);
        delete db.uploadStates[chatId];
    }
}

async function handleUserChat(chatId, message) {
    const newMessage = {
        id: db.messages.length + 1,
        userId: chatId,
        message: message,
        type: 'text',
        timestamp: new Date().toISOString(),
        read: false
    };
    db.messages.push(newMessage);
    
    const user = db.users.find(u => u.id === chatId);
    const userName = user ? user.firstName || 'ተጠቃሚ' : 'ተጠቃሚ';
    
    for (const admin of db.admins) {
        if (admin.telebirrApproved) {
            try {
                await bot.sendMessage(admin.id, `💬 አዲስ መልእክት ከ${userName} (${chatId}):\n\n${message}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💬 መልስ ላክ', callback_data: `reply_user_${chatId}` }]
                        ]
                    }
                });
            } catch (e) {
                console.error('Error forwarding message to admin:', e);
            }
        }
    }
    
    bot.sendMessage(chatId, '✅ መልእክት ለአስተዳዳሪ ተልኳል። በቅርቡ ምላሽ ይሰጣሉ።', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 ተመለስ', callback_data: 'user_back' }]
            ]
        }
    });
    
    delete db.uploadStates[chatId];
}

// ============================================
// API ROUTES (REST API for frontend)
// ============================================

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

app.get('/api/media', (req, res) => {
    res.json(db.media);
});

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

app.get('/api/media/:id', (req, res) => {
    const media = db.media.find(m => m.id === parseInt(req.params.id));
    if (media) {
        res.json(media);
    } else {
        res.status(404).json({ error: 'Media not found' });
    }
});

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

app.post('/api/payments/create', (req, res) => {
    try {
        const { userId, userName, itemId, amount } = req.body;
        
        const media = db.media.find(m => m.id === parseInt(itemId));
        if (media && media.isFree) {
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
            screenshot: null,
            screenshotDate: null
        };

        db.payments.push(payment);

        res.status(201).json({
            success: true,
            message: 'Payment request created',
            paymentId: payment.id,
            instructions: {
                amount: payment.amount,
                item: media ? media.title : 'Item'
            }
        });

    } catch (error) {
        console.error('Payment creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/payments/:id', (req, res) => {
    const payment = db.payments.find(p => p.id === req.params.id);
    if (payment) {
        res.json(payment);
    } else {
        res.status(404).json({ error: 'Payment not found' });
    }
});

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

app.get('/api/admins', verifyAdmin, (req, res) => {
    res.json(db.admins);
});

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

app.get('/api/chat/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const userMessages = db.messages.filter(m => 
        m.userId === userId || m.recipientId === userId
    );
    res.json(userMessages);
});

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

    if (bot) {
        const user = db.users.find(u => u.id === parseInt(userId));
        const userName = user ? user.firstName || 'User' : 'User';
        
        db.admins.forEach(admin => {
            if (admin.telebirrApproved) {
                try {
                    if (admin.id !== parseInt(userId)) {
                        bot.sendMessage(admin.id, `💬 አዲስ መልእክት ከ${userName} (${userId}):\n\n${message}`);
                    }
                } catch (e) {
                    console.error('Error notifying admin:', e);
                }
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

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});

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
