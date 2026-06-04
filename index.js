const { Telegraf, Markup } = require('telegraf');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');

// =============== CONFIGURATION ===============
const BOT_TOKEN = '8854531682:AAF6P6NJfrU1nb9-wl85mlnRTdHat7ChKC8';
const WHATSAPP_CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbCWpej7oQhWH4A2HK2k';
const PREFIX = ".";

// Create directories
if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
if (!fs.existsSync('./auth')) fs.mkdirSync('./auth', { recursive: true });
if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');
if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');
if (!fs.existsSync('./Plugins')) fs.mkdirSync('./Plugins');

// =============== STORE ===============
let plugins = new Map();
let currentQR = null;

// =============== LOAD PLUGINS ===============
function loadPlugins() {
    const pluginsPath = path.join(__dirname, 'Plugins');
    if (!fs.existsSync(pluginsPath)) return;
    const files = fs.readdirSync(pluginsPath);
    for (const file of files) {
        if (file.endsWith('.js')) {
            try {
                const plugin = require(`./Plugins/${file}`);
                if (plugin.name) {
                    plugins.set(plugin.name, plugin);
                    if (plugin.alias) plugin.alias.forEach(alias => plugins.set(alias, plugin));
                }
                console.log(`✅ Loaded: ${file}`);
            } catch(e) {
                console.log(`❌ Error loading ${file}: ${e.message}`);
            }
        }
    }
}

// =============== TELEGRAM BOT ===============
const bot = new Telegraf(BOT_TOKEN);
const telegramSessions = new Map();

bot.start((ctx) => {
    ctx.replyWithPhoto(
        'https://graph.org/file/02abf0fd8fc2a13cc67a1.jpg',
        {
            caption: `
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃     🤖 XROD PAIRING BOT 🤖         ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

🌟 *Welcome to XROD Pairing Bot!*

🔹 *Get WhatsApp 8-digit pairing code*
🔹 *Get QR code photo to scan*

📌 *Commands:*
/pair 923xxxxxxxxx - Get pairing code
/qr - Get QR code photo
/status - Check bot status

*Made with ❤️ by XROD*
            `,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 JOIN WHATSAPP CHANNEL', url: WHATSAPP_CHANNEL_LINK }],
                    [{ text: '🔐 GET PAIRING CODE', callback_data: 'get_pairing' }],
                    [{ text: '📱 GET QR CODE PHOTO', callback_data: 'get_qr' }],
                    [{ text: '📊 CHECK STATUS', callback_data: 'check_status' }]
                ]
            }
        }
    );
});

bot.action('get_pairing', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`
🔐 *Get Pairing Code*

Send your WhatsApp number:
\`/pair 923001234567\`

🇵🇰 Pakistan: 923xxxxxxxxx
🇺🇸 USA: 1xxxxxxxxxx
🇬🇧 UK: 44xxxxxxxxxx
🇦🇪 UAE: 971xxxxxxxxx
    `);
});

bot.action('get_qr', async (ctx) => {
    await ctx.answerCbQuery();
    
    if (currentQR) {
        const qrBuffer = await qrcode.toBuffer(currentQR);
        await ctx.replyWithPhoto(
            { source: qrBuffer },
            { caption: `📱 *SCAN THIS QR CODE*\n\nOpen WhatsApp → Linked Devices → Link a Device → Scan\n\n✅ Works for ALL countries!` }
        );
    } else {
        ctx.reply(`❌ QR code not available! Please wait for bot to generate QR code.`);
    }
});

bot.action('check_status', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`✅ *Bot online!*\n👥 Active sessions: ${telegramSessions.size}\n📱 QR available: ${currentQR ? '✅ Yes' : '❌ No'}`);
});

bot.command('help', (ctx) => {
    ctx.reply(`
📌 *Commands:*
/pair 923xxxxxxxxx - Get pairing code
/qr - Get QR code photo
/status - Check bot status
    `);
});

bot.command('status', (ctx) => {
    ctx.reply(`✅ Bot online! 👥 ${telegramSessions.size} active sessions`);
});

bot.command('qr', async (ctx) => {
    if (currentQR) {
        const qrBuffer = await qrcode.toBuffer(currentQR);
        await ctx.replyWithPhoto(
            { source: qrBuffer },
            { caption: `📱 *SCAN THIS QR CODE*\n\nOpen WhatsApp → Linked Devices → Link a Device → Scan` }
        );
    } else {
        ctx.reply(`❌ QR code not ready yet. Please wait...`);
    }
});

bot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply(`❌ Usage: /pair 923xxxxxxxxx`);
    
    let number = args[1].replace(/\D/g, '');
    if (number.length < 10 || number.length > 15) return ctx.reply('❌ Invalid number!');
    
    const msg = await ctx.reply(`🔄 Generating code for +${number}...`);
    
    try {
        const sessionId = `session_${number}_${Date.now()}`;
        const sessionPath = `./sessions/${sessionId}`;
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: Pino({ level: 'silent' }),
            browser: ['XROD Pair', 'Chrome', '1.0.0']
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        telegramSessions.set(sessionId, setTimeout(() => {
            try { fs.rmSync(sessionPath, { recursive: true, force: true }); telegramSessions.delete(sessionId); } catch(e) {}
        }, 120000));
        
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(number);
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `
🔐 *YOUR PAIRING CODE:* ${code}

*HOW TO PAIR:*
1. Open WhatsApp
2. Three Dots → Linked Devices
3. Tap "Link a Device"
4. Enter code: ${code}

✅ Valid for 2 minutes
                `);
            } catch (err) {
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Failed! Try QR code method: /qr`);
            }
        }, 3000);
        
    } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Error! Try /qr`);
    }
});

// =============== WHATSAPP BOT ===============
async function startWhatsAppBot() {
    loadPlugins();
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: Pino({ level: 'silent' }),
        browser: ['XROD MD', 'Chrome', '1.0.0']
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            console.log('\n📱 NEW QR CODE GENERATED - SCAN TO PAIR\n');
            const qrBuffer = await qrcode.toBuffer(qr);
            fs.writeFileSync('./temp/qr.png', qrBuffer);
        }
        
        if (connection === 'open') {
            currentQR = null;
            console.log('\n✅ WHATSAPP BOT CONNECTED!\n📌 Try: .menu on WhatsApp\n');
        }
        
        if (connection === 'close') {
            currentQR = null;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                setTimeout(startWhatsAppBot, 3000);
            }
        }
    });
    
    // WhatsApp Command Handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        if (!text.startsWith(PREFIX)) return;
        
        const args = text.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        if (plugins.has(command)) {
            const plugin = plugins.get(command);
            try {
                await plugin.run({
                    XROD: sock, m: msg, inputCMD: command, text: args.join(' '), from,
                    conn: sock, message: msg,
                    reply: async (txt) => await sock.sendMessage(from, { text: txt })
                });
            } catch(e) { console.log(e); }
            return;
        }
        
        if (command === 'menu') {
            const menu = `
╭━━━〔 XROD MD BOT 〕━━━⬣
┃ 👑 .ownermenu
┃ 🤖 .aimenu
┃ 🎮 .funmenu
┃ 🔥 .roastmenu
┃ 🎵 .mediamenu
┃ 📥 .downloadmenu
┃ 🔍 .searchmenu
┃ 🛠️ .toolsmenu
┃ 👥 .groupmenu
┃ ⚙️ .settingsmenu
┃ 🎨 .logomenu
┃ 📝 .textpromenu
┃ 😂 .mememenu
┃ 🎲 .randommenu
┃ 💰 .economymenu
┃ 🏆 .gamesmenu
┃ 📊 .stalkmenu
┃ 🌐 .convertmenu
┃ 📚 .educationmenu
┃ 💎 .premiummenu
╰━━━━━━━━━━━━━━⬣

> Type .[menu_name] to open any menu
            `;
            await sock.sendMessage(from, { text: menu });
        }
        else if (command === 'ping') {
            await sock.sendMessage(from, { text: '🏓 Pong! Bot is active' });
        }
        else if (command === 'owner') {
            await sock.sendMessage(from, { text: '👑 Bot Owner: XROD' });
        }
        else if (command === 'channel') {
            await sock.sendMessage(from, { text: `📢 Join: ${WHATSAPP_CHANNEL_LINK}` });
        }
        else {
            await sock.sendMessage(from, { text: `❌ Unknown command. Type .menu` });
        }
    });
}

// ========== START ==========
(async () => {
    await startWhatsAppBot();
    await bot.launch();
    console.log('\n✅ BOTS STARTED SUCCESSFULLY!\n');
})();

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    process.exit(0);
});
