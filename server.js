const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    makeCacheableSignalKeyStore 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

async function startFaresBot() {
    // تحديد مجلد الجلسة - هذا هو المكان الذي تُحفظ فيه بيانات الربط
    const { state, saveCreds } = await useMultiFileAuthState('session_data');

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // التعريف المهم جداً لقبول الكود
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
    });

    // حفظ التغييرات في الجلسة تلقائياً
    sock.ev.on('creds.update', saveCreds);

    // إدارة الاتصال
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        } else if (connection === 'open') {
            console.log('✅ تم ربط فارس بوت بنجاح!');
        }
    });

    // استقبال طلبات الربط من الموقع
    app.get('/pair', async (req, res) => {
        let num = req.query.number;
        if (!num) return res.status(400).json({ error: "الرجاء إدخال الرقم" });

        try {
            // تنظيف الرقم من أي رموز زائدة
            num = num.replace(/[^0-9]/g, '');
            
            // طلب كود الربط من واتساب
            let code = await sock.requestPairingCode(num);
            res.json({ code: code });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "فشل طلب الكود.. تأكد من حالة السيرفر" });
        }
    });
}

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    startFaresBot();
});
