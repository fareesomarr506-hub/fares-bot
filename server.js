const express = require('express');
const cors = require('cors');
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.json({ error: "ادخل رقم الهاتف أولاً" });

    // تنظيف رقم الهاتف من أي رموز زائدة
    phone = phone.replace(/[^0-9]/g, '');

    const { state, saveCreds } = await useMultiFileAuthState('./session');

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ["Chrome (Linux)", "", ""]
        });

        // إذا لم يكن السيرفر مسجلاً مسبقاً، نطلب كود الاقتران
        if (!socket.authState.creds.registered) {
            await delay(1500); // تأخير بسيط لضمان جاهزية السيرفر
            const code = await socket.requestPairingCode(phone);
            
            // إرسال الكود للموقع
            return res.json({ code: code });
        } else {
            return res.json({ error: "هذا الرقم مسجل بالفعل" });
        }

        socket.ev.on('creds.update', saveCreds);
        socket.ev.on("connection.update", async (s) => {
            const { connection, lastDisconnect } = s;
            if (connection === "open") {
                console.log("تم الاتصال بنجاح!");
            }
            if (connection === "close") {
                console.log("تم قطع الاتصال");
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "حدث خطأ في السيرفر أثناء توليد الكود" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    const socket = makeWASocket({
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
    },
    printQRInTerminal: false,
    logger: pino({ level: "fatal" }),
    // تحديث بيانات المتصفح بناءً على صورتك
    browser: ["Android 13", "Chrome", "147.0.7727.137"] 
});

});
