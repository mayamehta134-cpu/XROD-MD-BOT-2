const { Telegraf, Markup } = require('telegraf');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs');
const QRCode = require('qrcode');

const BOT_TOKEN = '8854531682:AAF6P6NJfrU1nb9-wl85mlnRTdHat7ChKC8';
const bot = new Telegraf(BOT_TOKEN);

const sessions = new Map();
let currentQR = null;

// Function to update QR code from WhatsApp bot
function setQRCode(qr) {
    currentQR = qr;
}

// Export for WhatsApp bot to use
if (typeof module !== 'undefined') module.exports = { setQRCode, currentQR };

bot.start((ctx) => {
    ctx.reply(`
╭━━━〔 🤖 XROD PAIRING BOT 〕━━━⬣
┃ Welcome to XROD Pairing Bot!
┃
┃ /pair 923xxxxxxxxx - Get 8-digit code
┃ /qr - Get QR code photo
┃ /status - Bot status
┃ /menu - Show menu
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━⬣
    `);
});

bot.command('menu', (ctx) => {
    ctx.reply(`
╭━━━〔 🤖 XROD PAIRING BOT 〕━━━⬣
┃ /pair 923xxxxxxxxx - Get pairing code
┃ /qr - Get QR code photo
┃ /status - Check bot status
┃ /menu - Show this menu
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━⬣
    `);
});

// =============== QR COMMAND WITH PHOTO ===============
bot.command('qr', async (ctx) => {
    if (currentQR) {
        try {
            // Generate QR code as buffer
            const qrBuffer = await QRCode.toBuffer(currentQR);
            await ctx.replyWithPhoto(
                { source: qrBuffer },
                { caption: `📱 *SCAN THIS QR CODE*

1. Open WhatsApp
2. Settings → Linked Devices
3. Tap "Link a Device"
4. Scan this QR code

✅ Works for ALL countries!
⚠️ Valid for 2 minutes` }
            );
        } catch (err) {
            ctx.reply(`❌ Failed to generate QR image! Try again.`);
        }
    } else {
        ctx.reply(`❌ QR code not available!

Please make sure WhatsApp bot is running:
\`node index.js\`

QR code will appear in terminal, then use /qr again.`);
    }
});

// =============== PAIR COMMAND ===============
bot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(`❌ Usage: /pair 923001234567`);
    }
    
    let number = args[1].replace(/\D/g, '');
    if (number.length < 10 || number.length > 15) {
        return ctx.reply('❌ Invalid number!');
    }
    
    const msg = await ctx.reply(`🔄 Generating code for +${number}...`);
    
    try {
        const sessionId = `session_${number}_${Date.now()}`;
        const sessionPath = `./sessions/${sessionId}`;
        if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: Pino({ level: 'silent' }),
            browser: ['XROD Pair', 'Chrome', '1.0.0']
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        sessions.set(sessionId, setTimeout(() => {
            try { fs.rmSync(sessionPath, { recursive: true, force: true }); sessions.delete(sessionId); } catch(e) {}
        }, 120000));
        
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(number);
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `
🔐 YOUR PAIRING CODE: ${code}

HOW TO PAIR:
1. Open WhatsApp → Linked Devices
2. Tap "Link a Device"
3. Enter this code

✅ Valid for 2 minutes
                `);
            } catch (err) {
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Failed! Try QR method: /qr`);
            }
        }, 3000);
        
    } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Error!`);
    }
});

bot.command('status', (ctx) => {
    ctx.reply(`✅ Bot online! Active sessions: ${sessions.size}\n📱 QR available: ${currentQR ? '✅ Yes' : '❌ No'}`);
});

bot.launch();
console.log('🤖 Telegram Bot Started!');
console.log('💡 QR code will be available when WhatsApp bot is running');
