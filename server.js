const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

async function getPairingCode(req, res) {
    let phone = req.query.number || req.query.code;
    if (!phone) return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف' });

    // تنظيف الرقم لضمان الصيغة الدولية الصحيحة
    phone = phone.replace(/[^0-9]/g, '');

    try {
        // استخدام مجلد مؤقت فريد لكل عملية ربط لتجنب تداخل الجلسات
        const authPath = `./auth/${phone}_${Date.now()}`;
        const { state, saveCreds } = await useMultiFileAuthState(authPath);

        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // التعديل الجديد: تعريف المتصفح ليظهر كجهاز Chrome على نظام Ubuntu
            // هذا يقلل من احتمالية رفض واتساب لعملية الربط
            browser: Browsers.appropriate('Chrome'),
            syncFullHistory: false
        });

        if (!socket.authState.creds.registered) {
            // انتظار بسيط لضمان تهيئة السيرفر داخلياً
            await delay(3000); 
            const code = await socket.requestPairingCode(phone);
            
            if (!res.headersSent) {
                res.json({ code: code });
            }
            
            // تنظيف الملفات المؤقتة بعد فترة لعدم ملء مساحة السيرفر
            setTimeout(() => {
                if (fs.existsSync(authPath)) {
                    fs.rmSync(authPath, { recursive: true, force: true });
                }
            }, 30000);
        }
    } catch (err) {
        console.error("Pairing Error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'فشل في الاتصال، تأكد من الرقم وحاول مجدداً' });
        }
    }
}

app.get('/pair', getPairingCode);
app.get('/api/pairing', getPairingCode);

app.get('/', (req, res) => {
    res.send("Fares Bot API is Online 👑");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
