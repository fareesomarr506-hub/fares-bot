const express = require('express');
const cors = require('cors');
const pino = require("pino");
const fs = require('fs');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const app = express();
app.use(cors()); 
app.use(express.json());

const PORT = process.env.PORT || 10000;

// مسار استلام الطلب من الموقع
app.get('/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: "أدخل الرقم أولاً" });

    phone = phone.replace(/[^0-9]/g, '');
    
    // إنشاء مجلد الجلسة إذا لم يكن موجوداً
    if (!fs.existsSync('./session')) { fs.mkdirSync('./session'); }

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // محاكاة بيانات متصفحك بالضبط لتجنب الرفض
            browser: ["Android 13", "Chrome", "147.0.7727.137"]
        });

        if (!socket.authState.creds.registered) {
            await delay(1500);
            const code = await socket.requestPairingCode(phone);
            return res.json({ code: code });
        } else {
            return res.json({ error: "الرقم مربوط بالفعل" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "فشل توليد الكود، حاول مجدداً" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
