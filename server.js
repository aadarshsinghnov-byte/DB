const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- PASTE YOUR TELEGRAM BOT CREDENTIALS HERE ---
const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID_HERE';
// ----------------------------------------------

// Initialize local SQLite database
const db = new sqlite3.Database('./images.db', (err) => {
    if (err) console.error('Database opening error: ', err.message);
});

db.run(`CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.use(express.static('public'));

// Upload Route
app.post('/upload', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No file uploaded.');

        // 1. Upload to Telegra.ph
        const form = new FormData();
        form.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        const telegraphResponse = await axios.post('https://telegra.ph/upload', form, {
            headers: form.getHeaders(),
        });

        if (telegraphResponse.data && telegraphResponse.data[0] && telegraphResponse.data[0].src) {
            const imagePath = `https://telegra.ph${telegraphResponse.data[0].src}`;

            // 2. Save URL into SQLite database
            db.run(`INSERT INTO photos (url) VALUES (?)`, [imagePath], async (err) => {
                if (err) return res.status(500).send('Database error.');

                // 3. Send notification/link to Telegram Chat via Bot
                try {
                    const message = `New photo uploaded successfully! \nLink: ${imagePath}`;
                    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        chat_id: TELEGRAM_CHAT_ID,
                        text: message
                    });
                } catch (telegramErr) {
                    console.error('Failed to send Telegram notification:', telegramErr.message);
                }

                res.redirect('/');
            });
        } else {
            res.status(500).send('Failed to upload image to Telegra.ph.');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error during upload.');
    }
});

// Fetch Gallery Route
app.get('/photos', (req, res) => {
    db.all(`SELECT * FROM photos ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
