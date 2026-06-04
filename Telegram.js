const { Telegraf, Markup } = require('telegraf');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs');
const QRCode = require('qrcode');

const BOT_TOKEN = '8854531682:AAF6P6NJfrU1nb9-wl85mlnRTdHat7ChKC8';
const bot = new Telegraf(BOT_TOKEN);

// Store sessions
const sessions = new Map();

// =============== MENU COMMAND ===============
bot.command('menu', (ctx) => {
    ctx.reply(`
╭━━━〔 🤖 XROD PAIRING BOT 〕━━━⬣
┃ /pair 923xxxxxxxxx - Get pairing code
┃ /qr - Get QR code instructions
┃ /status - Check bot status
┃ /menu - Show this menu
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━⬣

🇵🇰 Pakistan: 923xxxxxxxxx
🇮🇳 India: 91xxxxxxxxxx (Use QR)
🇺🇸 USA: 1xxxxxxxxxx
🇬🇧 UK: 44xxxxxxxxxx
🇦🇪 UAE: 971xxxxxxxxx

*Example:* /pair 923001234567
    `, Markup.inlineKeyboard([
        [Markup.button.callback('🔐 PAIRING CODE', 'get_pairing')],
        [Markup.button.callback('📱 QR CODE', 'get_qr')],
        [Markup.button.callback('📊 STATUS', 'check_status')]
    ]));
});

bot.start((ctx) => {
    ctx.reply(`
╭━━━〔 🤖 XROD PAIRING BOT 〕━━━⬣
┃ Welcome to XROD Pairing Bot!
┃
┃ /pair 923xxxxxxxxx - Get 8-digit code
┃ /qr - QR code instructions
┃ /status - Bot status
┃ /menu - Show menu
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━⬣
    `);
});

// =============== BUTTON HANDLERS ===============
bot.action('get_pairing', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`📱 Send /pair 923001234567`);
});

bot.action('get_qr', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`📱 *QR CODE METHOD*

1. Start WhatsApp bot on server: \`node index.js\`
2. QR code will appear in terminal
3. Open WhatsApp → Linked Devices
4. Tap "Link a Device"
5. Scan the QR code

✅ QR code works for ALL countries including India!
    `);
});

bot.action('check_status', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`✅ *Bot online!*\n👥 Active sessions: ${sessions.size}\n🤖 Status: Working`);
});

// =============== QR COMMAND ===============
bot.command('qr', async (ctx) => {
    ctx.reply(`
📱 *QR CODE METHOD*

1. Start WhatsApp bot on server: \`node index.js\`
2. QR code will appear in terminal
3. Open WhatsApp → Settings → Linked Devices
4. Tap "Link a Device"
5. Scan the QR code

✅ *Works for ALL countries!*
⚠️ *India numbers must use QR code method*
    `);
});

// =============== PAIR COMMAND ===============
bot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(`❌ *Usage:* /pair 923001234567
    
🇵🇰 Pakistan: 923xxxxxxxxx
🇺🇸 USA: 1xxxxxxxxxx
🇬🇧 UK: 44xxxxxxxxxx
🇦🇪 UAE: 971xxxxxxxxx

*Note:* For India numbers, use /qr method`);
    }
    
    let number = args[1].replace(/\D/g, '');
    
    // Check if India number
    if (number.startsWith('91')) {
        return ctx.reply(`❌ *India numbers don't support pairing code!*

Please use QR code method: /qr
    
1. Start WhatsApp bot: \`node index.js\`
2. Scan QR code from terminal`);
    }
    
    if (number.length < 10 || number.length > 15) {
        return ctx.reply('❌ Invalid number! Use format: 923xxxxxxxxx');
    }
    
    const msg = await ctx.reply(`🔄 Generating code for +${number}...⏳`);
    
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
╭━━━〔 🔐 YOUR PAIRING CODE 〕━━━⬣

👉 *${code}* 👈

╭━━━〔 📱 HOW TO PAIR 〕━━━⬣
┃ 1. Open WhatsApp
┃ 2. Settings → Linked Devices
┃ 3. Tap "Link a Device"
┃ 4. Enter this code

✅ Valid for 2 minutes
⚠️ Don't share this code!
                `);
            } catch (err) {
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `
❌ *Failed to generate code!*

📌 Possible reasons:
• Invalid WhatsApp number
• Number not registered on WhatsApp

💡 Try QR code method: /qr
                `);
            }
        }, 3000);
        
    } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Error! Please try again.`);
    }
});

// =============== STATUS COMMAND ===============
bot.command('status', (ctx) => {
    ctx.reply(`✅ *Bot online!*\n👥 Active sessions: ${sessions.size}\n🤖 Service: WhatsApp Pairing\n📱 Method: 8-Digit Code + QR Code`);
});

// =============== HELP COMMAND ===============
bot.command('help', (ctx) => {
    ctx.reply(`
📌 *Commands:*

/pair 923xxxxxxxxx - Get 8-digit pairing code
/qr - QR code instructions
/status - Bot status
/menu - Show menu

*Country Codes:*
🇵🇰 Pakistan: 923xxxxxxxxx
🇮🇳 India: 91xxxxxxxxxx (Use QR)
🇺🇸 USA: 1xxxxxxxxxx
🇬🇧 UK: 44xxxxxxxxxx
🇦🇪 UAE: 971xxxxxxxxx

*Note:* India numbers must use QR code method (/qr)
    `);
});

// =============== START BOT ===============
bot.launch().then(() => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     🤖 TELEGRAM PAIRING BOT STARTED 🤖   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('📱 Bot: @XROD_Pairing_Bot');
    console.log('💡 Commands: /pair, /qr, /menu, /status\n');
});

// Graceful shutdown
process.once('SIGINT', () => {
    for (const [id, timeout] of sessions) clearTimeout(timeout);
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    for (const [id, timeout] of sessions) clearTimeout(timeout);
    bot.stop('SIGTERM');
});
