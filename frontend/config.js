// frontend/config.js
// Configuration for different environments
const CONFIG = {
    // Replace with your actual Render backend URL
    API_URL: 'https://cheerful-cheek.onrender.com',
    
    // For local development, uncomment the line below and comment the one above
    // API_URL: 'http://localhost:3000',
    
    // Telegram Bot settings
    BOT_USERNAME: '@cheerfulcheeck_bot',
    
    // PayPal email (shown in payment instructions)
    PAYPAL_EMAIL: 'lenabotrel65@outlook.com',
    
    // App settings
    APP_NAME: 'Cheerful Chick',
    APP_VERSION: '1.0.0'
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
