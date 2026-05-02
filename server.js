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

// التأكد من وجود مجلد الجلسة لمنع خطأ الـ Path
if (!fs.existsSync('./session')) {
    fs.mkdirSync('./session');
}

const pairingHandler = async (req, res) => {
    let phone = req.query.phone || req.query.number;
    if (!phone) return res.status(400).json({ error: "الرجاء إدخال رقم الهاتف" });

    phone = phone.replace(/[^0-9]/g, '');

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // محاكاة متصفحك حسب الصورة التي أرسلتها
            browser: ["Android 13", "Chrome", "147.0.7727.137"]
        });

        if (!socket.authState.creds.registered) {
            await delay(2000);
            const code = await socket.requestPairingCode(phone);
            return res.json({ 
                code: code,
                status: true 
            });
        } else {
            return res.json({ error: "الجهاز مربوط بالفعل" });
        }

        socket.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.error("Error generating code:", err);
        res.status(500).json({ error: "فشل توليد الكود، حاول مجدداً" });
    }
};

// المسارات التي يطلبها الموقع عادةً
app.get('/pair', pairingHandler);
app.get('/code', pairingHandler);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is Live on Port ${PORT}`);
});

// منع الانهيار في حالة حدوث خطأ غير متوقع
process.on('uncaughtException', (err) => console.error('Caught exception:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
