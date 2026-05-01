const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// دالة لتنظيف الرقم
const formatNumber = (num) => {
    let cleaned = num.replace(/[^0-9]/g, '');
    return cleaned;
};

async function startFaresBot() {
    // استخدام مجلد مؤقت للتخزين في Render لتجنب مشاكل الصلاحيات
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // تعريف متصفح قوي لضمان وصول الإشعار
        browser: ["Mac OS", "Chrome", "10.15.7"], 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        } else if (connection === 'open') {
            console.log('✅ متصل الآن!');
        }
    });

    // المسار الرئيسي للتأكد من عمل السيرفر
    app.get('/', (req, res) => {
        res.send('<h1>سيرفر بوت فارس التميمي يعمل بنجاح ✅</h1>');
    });

    // مسار طلب الكود المحدث
    app.get('/pair', async (req, res) => {
        let num = req.query.number;
        if (!num) return res.status(400).json({ error: "الرجاء إدخال الرقم" });

        try {
            const formattedNum = formatNumber(num);
            // تأخير بسيط لضمان استقرار الجلسة قبل الطلب
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            let code = await sock.requestPairingCode(formattedNum);
            res.json({ code: code });
        } catch (err) {
            console.error("خطأ في طلب الكود:", err);
            res.status(500).json({ error: "حدث خطأ أثناء الاتصال بواتساب. جرب إعادة تشغيل السيرفر." });
        }
    });
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    startFaresBot();
});
