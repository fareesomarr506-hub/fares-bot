const express = require('express');
const path = require('path');
const cors = require('cors');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    jidDecode 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

const app = express();

// 1. حل مشكلة الـ CORS للسماح للمتصفح بالاتصال بالسيرفر
app.use(cors());
app.use(express.json());

// تعريف المنفذ (مهم جداً لمنصة Render)
const PORT = process.env.PORT || 3000;

// مسار واجهة المستخدم (إذا كانت موجودة في مجلد)
app.use(express.static(path.join(__dirname, 'public')));

// رابط كود الاقتران
app.get('/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.json({ error: "Please provide a phone number" });

    try {
        // هنا يتم وضع منطق توليد كود الاقتران الخاص بـ Baileys
        // سنقوم بإرسال استجابة تجريبية للتأكد من أن الاتصال يعمل
        res.json({ 
            status: true, 
            message: "جاري توليد الكود...",
            number: phone 
        });
    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// تشغيل السيرفر
app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================`);
    console.log(`Server is running on port: ${PORT}`);
    console.log(`URL: https://fares-bot.onrender.com`);
    console.log(`====================================`);
});

// إضافة وظيفة لإبقاء البوت شغالاً (Anticrash)
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
