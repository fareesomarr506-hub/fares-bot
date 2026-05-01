const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 3000;

async function startFaresBot() {
    // إعداد الجلسة في مجلد محدد
    const { state, saveCreds } = await useMultiFileAuthState('./fares_session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // هذا التعريف هو الأكثر استقراراً حالياً لربط الكود
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
    });

    // حفظ بيانات الاعتماد عند تحديثها
    sock.ev.on('creds.update', saveCreds);

    // إدارة حالة الاتصال وإعادة التشغيل التلقائي
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("إعادة الاتصال بالسيرفر...");
                startFaresBot();
            }
        } else if (connection === 'open') {
            console.log('✅ تم تشغيل سيرفر فارس بنجاح!');
        }
    });

    // الصفحة الرئيسية للتأكد من عمل السيرفر
    app.get('/', (req, res) => {
        res.send('<h1 style="text-align:center;margin-top:50px;">سيرفر بوت فارس التميمي يعمل بنجاح ✅</h1>');
    });

    // المسار المخصص لطلب الكود (الـ API)
    app.get('/pair', async (req, res) => {
        let num = req.query.number;
        if (!num) return res.status(400).json({ error: "الرجاء إدخال الرقم" });

        try {
            // تنظيف الرقم من أي مسافات أو رموز
            let formattedNum = num.replace(/[^0-9]/g, '');
            
            // إضافة تأخير بسيط (3 ثوانٍ) لضمان جاهزية السيرفر للطلب
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // طلب الكود من واتساب
            let code = await sock.requestPairingCode(formattedNum);
            res.json({ code: code });
        } catch (err) {
            console.error("خطأ أثناء طلب الكود:", err);
            res.status(500).json({ error: "فشل طلب الكود.. حاول مرة أخرى بعد قليل" });
        }
    });
}

// تشغيل السيرفر
app.listen(port, () => {
    console.log(`Server is live on port ${port}`);
    startFaresBot();
});
