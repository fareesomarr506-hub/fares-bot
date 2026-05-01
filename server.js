const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore,
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors()); // للسماح للموقع بالاتصال بالـ API بدون مشاكل
const PORT = process.env.PORT || 3000;

// مسار الحصول على كود الإقران (api/pairing)
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف' });

    phone = phone.replace(/[^0-9]/g, ''); // تنظيف الرقم

    try {
        // إنشاء مجلد مؤقت للجلسة لكل طلب
        const authPath = `./auth/${phone}_${Date.now()}`;
        const { state, saveCreds } = await useMultiFileAuthState(authPath);

        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
        });

        if (!socket.authState.creds.registered) {
            await delay(2000); // وقت انتظار بسيط لتهيئة الاتصال
            const code = await socket.requestPairingCode(phone);
            
            // إرسال الكود للمستخدم
            res.json({ code: code });
            
            // تنظيف الملفات بعد إرسال الكود للحفاظ على مساحة السيرفر
            setTimeout(() => {
                if (fs.existsSync(authPath)) {
                    fs.rmSync(authPath, { recursive: true, force: true });
                }
            }, 10000); 
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل في توليد الكود، حاول مجدداً' });
    }
});

// مسار أساسي للتأكد من عمل السيرفر
app.get('/', (req, res) => {
    res.send("Fares API Server is Running! 🚀");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
