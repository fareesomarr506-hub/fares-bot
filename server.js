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
const fs = require("fs");

const app = express();
app.use(cors()); // السماح للموقع بالاتصال بالسيرفر

const PORT = process.env.PORT || 3000;

// دالة لمعالجة طلب الكود (مشتركة بين المسارات)
async function getPairingCode(req, res) {
    let phone = req.query.number || req.query.code;
    if (!phone) return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف' });

    phone = phone.replace(/[^0-9]/g, ''); // تنظيف الرقم من أي رموز

    try {
        // إنشاء مجلد مؤقت للجلسة
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
            await delay(2000); // انتظار التهيئة
            const code = await socket.requestPairingCode(phone);
            
            // إرسال الكود كاستجابة
            res.json({ code: code });
            
            // تنظيف تلقائي للمجلد بعد 20 ثانية لتوفير المساحة
            setTimeout(() => {
                if (fs.existsSync(authPath)) {
                    fs.rmSync(authPath, { recursive: true, force: true });
                }
            }, 20000);
        }
    } catch (err) {
        console.error("Error in pairing:", err);
        res.status(500).json({ error: 'حدث خطأ في السيرفر، حاول مجدداً' });
    }
}

// دعم المسارين لضمان عدم حدوث خطأ 404
app.get('/pair', getPairingCode);
app.get('/api/pairing', getPairingCode);

// مسار فحص السيرفر
app.get('/', (req, res) => {
    res.send("Fares API Server is Working! 🚀");
});

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
const socket = makeWASocket({
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
    },
    printQRInTerminal: false,
    logger: pino({ level: "fatal" }),
    // أضف هذا السطر أدناه لتعريف المتصفح
    browser: ["Ubuntu", "Chrome", "20.0.04"] 
});
