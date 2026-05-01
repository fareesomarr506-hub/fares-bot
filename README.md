const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require("pino");

const app = express();
const PORT = process.env.PORT || 3000;

// مسار الحصول على كود الإقران (api/pairing)
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.status(400).json({ error: 'Please provide a phone number' });

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
        });

        if (!socket.authState.creds.registered) {
            await delay(1500);
            const code = await socket.requestPairingCode(phone);
            res.json({ code: code });
        }
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// مسار الحصول على الـ QR Code (api/qr)
app.get('/api/qr', async (req, res) => {
    // هنا يتم وضع منطق توليد الـ QR وإرساله كصورة أو نص Base64
    res.send("QR Code logic starts here...");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
