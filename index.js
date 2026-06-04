require('dotenv').config();

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { parsePhoneNumber: PhoneNumber } = require('awesome-phonenumber');
const readline = require('readline');
const QRCode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, jidDecode, jidNormalizedUser, makeCacheableSignalKeyStore, delay } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const pino = require('pino');
const { Telegraf, Markup } = require('telegraf');

// =============== CONFIGURATION ===============
const BOT_TOKEN = '8854531682:AAF6P6NJfrU1nb9-wl85mlnRTdHat7ChKC8';
const WHATSAPP_CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbCWpej7oQhWH4A2HK2k';
const config = {
    botName: "XROD MD",
    ownerNumber: "923051391005",
    pairingNumber: "",
    prefixes: ["."],
    storeWriteInterval: 10000
};

const PREFIX = ".";

// =============== TELEGRAM BOT SETUP ===============
const tgBot = new Telegraf(BOT_TOKEN);
const telegramSessions = new Map();
let currentQR = null;

// =============== RETRY FUNCTION FOR TELEGRAM ===============
async function sendWithRetry(ctx, method, ...args) {
    let lastError;
    for (let i = 0; i < 3; i++) {
        try {
            if (method === 'photo') {
                return await ctx.replyWithPhoto(...args, { timeout: 60000 });
            } else if (method === 'message') {
                return await ctx.reply(...args, { timeout: 60000 });
            } else if (method === 'edit') {
                return await ctx.telegram.editMessageText(...args, { timeout: 60000 });
            }
        } catch (err) {
            lastError = err;
            console.log(`Attempt ${i + 1} failed: ${err.message}`);
            if (i < 2) await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        }
    }
    throw lastError;
}

// Telegram Bot Commands with Retry
tgBot.start(async (ctx) => {
    try {
        await sendWithRetry(ctx, 'photo', 'https://graph.org/file/02abf0fd8fc2a13cc67a1.jpg', {
            caption: `
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃     🤖 XROD PAIRING BOT 🤖         ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

🌟 *Welcome to XROD Pairing Bot!*

📌 *Commands:*
/pair 923xxxxxxxxx - Get pairing code
/qr - Get QR code photo
/status - Check bot status

*Made with ❤️ by XROD*`,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 JOIN WHATSAPP CHANNEL', url: WHATSAPP_CHANNEL_LINK }],
                    [{ text: '🔐 GET PAIRING CODE', callback_data: 'get_pairing' }],
                    [{ text: '📱 GET QR CODE', callback_data: 'get_qr' }],
                    [{ text: '📊 CHECK STATUS', callback_data: 'check_status' }]
                ]
            }
        });
    } catch (err) {
        console.log('Start command error:', err.message);
        await sendWithRetry(ctx, 'message', `⚠️ Bot started! Use /pair or /qr`);
    }
});

tgBot.action('get_pairing', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    try {
        await sendWithRetry(ctx, 'message', `🔐 Send /pair 923001234567\n\n🇵🇰 Pakistan: 923xxxxxxxxx\n🇺🇸 USA: 1xxxxxxxxxx`);
    } catch (err) {
        console.log('Action get_pairing error:', err.message);
    }
});

tgBot.action('get_qr', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (currentQR) {
        try {
            const qrBuffer = await QRCode.toBuffer(currentQR);
            await sendWithRetry(ctx, 'photo', { source: qrBuffer }, { caption: `📱 Scan this QR code with WhatsApp` });
        } catch (err) {
            console.log('QR send error:', err.message);
            await sendWithRetry(ctx, 'message', `❌ QR code available but send failed! Try /qr again.`);
        }
    } else {
        await sendWithRetry(ctx, 'message', `❌ QR code not available!`);
    }
});

tgBot.action('check_status', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await sendWithRetry(ctx, 'message', `✅ Bot online! QR: ${currentQR ? 'Yes' : 'No'}`);
});

tgBot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return sendWithRetry(ctx, 'message', `❌ Usage: /pair 923xxxxxxxxx`);
    let number = args[1].replace(/\D/g, '');
    if (number.length < 10 || number.length > 15) return sendWithRetry(ctx, 'message', '❌ Invalid number!');
    
    const msg = await sendWithRetry(ctx, 'message', `🔄 Generating code for +${number}...`);
    try {
        const sessionId = `session_${number}_${Date.now()}`;
        const sessionPath = `./sessions/${sessionId}`;
        if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: pino({ level: 'silent' }) });
        sock.ev.on('creds.update', saveCreds);
        
        telegramSessions.set(sessionId, setTimeout(() => {
            try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch(e) {}
        }, 120000));
        
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(number);
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, `🔐 YOUR PAIRING CODE: ${code}\n\nHOW TO PAIR:\n1. Open WhatsApp\n2. Linked Devices → Link a Device\n3. Enter this code\n\n✅ Valid for 2 minutes`, { timeout: 60000 });
            } catch(e) {
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, `❌ Failed! Use /qr`, { timeout: 60000 });
            }
        }, 3000);
    } catch(e) { sendWithRetry(ctx, 'message', `❌ Error!`); }
});

tgBot.command('qr', async (ctx) => {
    if (currentQR) {
        try {
            const qrBuffer = await QRCode.toBuffer(currentQR);
            await sendWithRetry(ctx, 'photo', { source: qrBuffer }, { caption: `📱 Scan this QR code` });
        } catch (err) {
            console.log('QR command error:', err.message);
            await sendWithRetry(ctx, 'message', `❌ QR send failed! Try again.`);
        }
    } else {
        await sendWithRetry(ctx, 'message', `❌ QR not ready yet. Please wait...`);
    }
});

tgBot.command('status', (ctx) => sendWithRetry(ctx, 'message', `✅ Bot online!`));
tgBot.command('help', (ctx) => sendWithRetry(ctx, 'message', `/pair 923xxxxxxxxx\n/qr\n/status`));

// Launch Telegram Bot with better options
tgBot.launch({
    allowedUpdates: ['message', 'callback_query'],
    timeout: 60
}).catch(err => console.log('Telegram launch error:', err.message));

// =============== STORE & DATA SETUP ===============
let store = { contacts: {}, messages: {}, settings: {} };
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
let owner = [];
try { owner = JSON.parse(fs.readFileSync('./data/owner.json', 'utf-8')); } catch(e) { owner = []; }

// =============== COMMAND HANDLER ===============
const commands = new Map();
function loadCommands() {
    const pluginsPath = path.join(__dirname, 'Plugins');
    if (!fs.existsSync(pluginsPath)) return;
    const files = fs.readdirSync(pluginsPath);
    for (const file of files) {
        if (file.endsWith('.js')) {
            try {
                const cmd = require(`./Plugins/${file}`);
                if (cmd.name) commands.set(cmd.name, cmd);
                console.log(`✅ Loaded: ${file}`);
            } catch(e) { console.log(`❌ Error: ${file}`); }
        }
    }
}

async function handleMessages(sock, chatUpdate) {
    const msg = chatUpdate.messages[0];
    if (!msg.message) return;
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || '';
    if (!text.startsWith(PREFIX)) return;
    const command = text.slice(PREFIX.length).trim().split(/ +/)[0].toLowerCase();
    
    if (commands.has(command)) {
        try { await commands.get(command).run({ XROD: sock, m: msg, from, reply: async (t) => await sock.sendMessage(from, { text: t }) }); }
        catch(e) { await sock.sendMessage(from, { text: '❌ Error!' }); }
        return;
    }
    
    if (command === 'menu') {
        await sock.sendMessage(from, { text: `
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

> Type .[menu_name] to open any menu` });
    }
    else if (command === 'ping') { await sock.sendMessage(from, { text: '🏓 Pong!' }); }
    else if (command === 'owner') { await sock.sendMessage(from, { text: `👑 Owner: ${owner[0] || config.ownerNumber}` }); }
    else if (command === 'channel') { await sock.sendMessage(from, { text: `📢 Join: ${WHATSAPP_CHANNEL_LINK}` }); }
    else { await sock.sendMessage(from, { text: `❌ Unknown command. Type .menu` }); }
}

// =============== WHATSAPP BOT ===============
async function startBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    const sock = makeWASocket({
        version, logger: pino({ level: 'silent' }), browser: Browsers.macOS('Chrome'),
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
        markOnlineOnConnect: true, generateHighQualityLinkPreview: true, syncFullHistory: false,
        msgRetryCounterCache: new NodeCache(), defaultQueryTimeoutMs: 60000
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async (chatUpdate) => { await handleMessages(sock, chatUpdate); });
    
    sock.ev.on('connection.update', async (s) => {
        const { connection, qr } = s;
        if (qr) { currentQR = qr; console.log('📱 QR code generated'); }
        if (connection === "open") { currentQR = null; console.log(chalk.green('\n✅ XROD MD BOT CONNECTED!\n')); }
        if (connection === 'close') { currentQR = null; console.log(chalk.yellow('🔄 Reconnecting...')); setTimeout(startBot, 5000); }
    });
    
    if (!state.creds?.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(config.ownerNumber);
                console.log(chalk.bgGreen(`\n🔐 YOUR PAIRING CODE: ${code}\n`));
            } catch(e) { console.log('❌ Pairing failed'); }
        }, 3000);
    }
    return sock;
}

// ========== STARTUP ==========
console.log(chalk.cyan(`\n╔════════════════════════════════════════╗\n║        🤖 XROD MD BOT STARTING 🤖      ║\n╚════════════════════════════════════════╝\n`));
loadCommands();

// Start WhatsApp Bot only (Telegram already launched)
startBot().catch((error) => {
    console.log(chalk.red(`❌ Fatal error: ${error.message}`));
    process.exit(1);
});
