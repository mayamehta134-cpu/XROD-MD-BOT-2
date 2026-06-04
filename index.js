import 'dotenv/config';
import fs, { existsSync, mkdirSync, rmSync } from 'fs';
import path, { dirname } from 'path';
import chalk from 'chalk';
import { parsePhoneNumber as PhoneNumber } from 'awesome-phonenumber';
import readline from 'readline';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, jidDecode, jidNormalizedUser, makeCacheableSignalKeyStore, delay } from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import pino from 'pino';
import { Telegraf, Markup } from 'telegraf';

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

// Telegram Bot Commands
tgBot.start((ctx) => {
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

tgBot.action('get_pairing', async (ctx) => {
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

tgBot.action('get_qr', async (ctx) => {
    await ctx.answerCbQuery();
    if (currentQR) {
        const qrBuffer = await QRCode.toBuffer(currentQR);
        await ctx.replyWithPhoto(
            { source: qrBuffer },
            { caption: `📱 *SCAN THIS QR CODE*\n\nOpen WhatsApp → Linked Devices → Link a Device → Scan\n\n✅ Works for ALL countries!` }
        );
    } else {
        ctx.reply(`❌ QR code not available! Please wait for bot to generate QR code.`);
    }
});

tgBot.action('check_status', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`✅ *Bot online!*\n👥 Active sessions: ${telegramSessions.size}\n📱 QR available: ${currentQR ? '✅ Yes' : '❌ No'}`);
});

tgBot.command('help', (ctx) => {
    ctx.reply(`
📌 *Commands:*
/pair 923xxxxxxxxx - Get pairing code
/qr - Get QR code photo
/status - Check bot status
    `);
});

tgBot.command('status', (ctx) => {
    ctx.reply(`✅ Bot online! 👥 ${telegramSessions.size} active sessions`);
});

tgBot.command('qr', async (ctx) => {
    if (currentQR) {
        const qrBuffer = await QRCode.toBuffer(currentQR);
        await ctx.replyWithPhoto(
            { source: qrBuffer },
            { caption: `📱 *SCAN THIS QR CODE*\n\nOpen WhatsApp → Linked Devices → Link a Device → Scan` }
        );
    } else {
        ctx.reply(`❌ QR code not ready yet. Please wait...`);
    }
});

tgBot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply(`❌ Usage: /pair 923xxxxxxxxx`);
    
    let number = args[1].replace(/\D/g, '');
    if (number.length < 10 || number.length > 15) return ctx.reply('❌ Invalid number!');
    
    const msg = await ctx.reply(`🔄 Generating code for +${number}...`);
    
    try {
        const sessionId = `session_${number}_${Date.now()}`;
        const sessionPath = `./sessions/${sessionId}`;
        if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
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

// =============== STORE SETUP ===============
let store = {
    contacts: {},
    messages: {},
    settings: {
        autoread: false,
        autobio: false,
        antidelete: false,
        stealthMode: false
    },
    getSetting: async (scope, key) => { return store.settings[key] || false; },
    loadMessage: async (jid, id) => { return store.messages[jid]?.[id]; },
    bind: (ev) => {
        ev.on('messages.upsert', ({ messages }) => {
            for (const msg of messages) {
                if (!msg.key?.remoteJid || !msg.key?.id) continue;
                const jid = msg.key.remoteJid;
                if (!store.messages[jid]) store.messages[jid] = {};
                store.messages[jid][msg.key.id] = msg;
            }
        });
    }
};

// =============== DATA DIRECTORY SETUP ===============
const DATA_DEFAULTS = {
    'owner.json': [],
    'settings.json': { autoread: false, autobio: false, antidelete: false, stealthMode: false }
};

fs.mkdirSync('./data', { recursive: true });
for (const [file, def] of Object.entries(DATA_DEFAULTS)) {
    const fp = `./data/${file}`;
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, JSON.stringify(def, null, 2));
}

let owner = [];
try { owner = JSON.parse(fs.readFileSync('./data/owner.json', 'utf-8')); } catch { owner = []; }

global.botname = config.botName || "XROD MD";
global.themeemoji = "•";

// =============== PAIRING MODE SETUP ===============
const pairingCode = !process.argv.includes("--qr-code");
let rl = null;
let rlClosed = false;

if (process.stdin.isTTY && !config.pairingNumber) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => { rlClosed = true; });
}

const question = (text) => {
    if (rl && !rlClosed) return new Promise((resolve) => rl.question(text, resolve));
    else return Promise.resolve(config.ownerNumber || "923051391005");
};

process.on('exit', () => { if (rl && !rlClosed) rl.close(); });
process.on('SIGINT', () => { if (rl && !rlClosed) rl.close(); process.exit(0); });

// =============== SESSION MANAGEMENT ===============
function ensureSessionDirectory() {
    const sessionPath = path.join(__dirname, 'session');
    if (!existsSync(sessionPath)) mkdirSync(sessionPath, { recursive: true });
    return sessionPath;
}

// =============== COMMAND HANDLER ===============
const commands = new Map();

function loadCommands() {
    const pluginsPath = path.join(__dirname, 'Plugins');
    if (!existsSync(pluginsPath)) {
        console.log('📁 Plugins folder not found!');
        return;
    }
    const files = fs.readdirSync(pluginsPath);
    for (const file of files) {
        if (file.endsWith('.js')) {
            try {
                const cmd = require(`./Plugins/${file}`);
                if (cmd.name) {
                    commands.set(cmd.name, cmd);
                    if (cmd.alias) cmd.alias.forEach(alias => commands.set(alias, cmd));
                    console.log(`✅ Loaded: ${file}`);
                }
            } catch(e) { console.log(`❌ Error loading ${file}: ${e.message}`); }
        }
    }
    console.log(`\n📦 Total ${commands.size} commands loaded!\n`);
}

// =============== MESSAGE HANDLER ===============
async function handleMessages(sock, chatUpdate) {
    const msg = chatUpdate.messages[0];
    if (!msg.message) return;
    
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    
    if (!text.startsWith(PREFIX)) return;
    
    const args = text.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    if (commands.has(command)) {
        const cmd = commands.get(command);
        try {
            await cmd.run({
                XROD: sock, m: msg, inputCMD: command, text: args.join(' '), from,
                conn: sock, message: msg,
                reply: async (txt) => await sock.sendMessage(from, { text: txt }),
                isOwner: owner.includes(msg.key.participant?.split('@')[0])
            });
        } catch(e) { console.log(`Error in ${command}:`, e); await sock.sendMessage(from, { text: '❌ Error executing command!' }); }
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
        await sock.sendMessage(from, { text: `👑 Owner: ${owner[0] || config.ownerNumber}` });
    }
    else if (command === 'channel') {
        await sock.sendMessage(from, { text: `📢 Join: ${WHATSAPP_CHANNEL_LINK}` });
    }
    else {
        await sock.sendMessage(from, { text: `❌ Unknown command. Type .menu` });
    }
}

// =============== MAIN BOT FUNCTION ===============
async function startBot() {
    try {
        const { version } = await fetchLatestBaileysVersion();
        ensureSessionDirectory();
        
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);
        const msgRetryCounterCache = new NodeCache();
        
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Chrome'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        });
        
        sock.ev.on('creds.update', saveCreds);
        store.bind(sock.ev);
        
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            await handleMessages(sock, chatUpdate);
        });
        
        sock.decodeJid = (jid) => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                const decode = jidDecode(jid) || {};
                return decode.user && decode.server && `${decode.user}@${decode.server}` || jid;
            } else return jid;
        };
        
        sock.getName = (jid) => {
            const id = sock.decodeJid(jid);
            if (id.endsWith("@g.us")) return "Group";
            return store.contacts[id]?.name || id.split('@')[0];
        };
        
        sock.public = true;
        
        const isRegistered = state.creds?.registered === true;
        
        if (pairingCode && !isRegistered) {
            let phoneNumberInput;
            if (config.pairingNumber) phoneNumberInput = config.pairingNumber;
            else if (rl && !rlClosed) phoneNumberInput = await question(chalk.bgBlack(chalk.greenBright(`📱 Enter your WhatsApp number:\nFormat: 923001234567: `)));
            else phoneNumberInput = config.ownerNumber;
            
            phoneNumberInput = phoneNumberInput.replace(/[^0-9]/g, '');
            const pn = PhoneNumber(`+${phoneNumberInput}`);
            
            if (!pn.valid) {
                console.log(chalk.red('❌ Invalid phone number!'));
                if (rl && !rlClosed) rl.close();
                process.exit(1);
            }
            
            const doPairing = async (num, attempt = 1) => {
                try {
                    let code = await sock.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log(chalk.black(chalk.bgGreen(`\n🔐 YOUR PAIRING CODE: ${code}\n`)));
                    if (rl && !rlClosed) { rl.close(); rl = null; }
                } catch (error) {
                    if (attempt < 3) {
                        try { rmSync('./session', { recursive: true, force: true }); } catch(e) {}
                        await delay(3000);
                        startBot();
                    } else console.log(chalk.red('❌ Pairing failed. Restart manually.'));
                }
            };
            setTimeout(() => doPairing(phoneNumberInput), 3000);
        }
        
        sock.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s;
            
            if (qr) {
                currentQR = qr;
                if (!pairingCode) {
                    try { console.log(await QRCode.toString(qr, { type: 'terminal', small: true })); }
                    catch(e) { console.log('QR:', qr); }
                }
            }
            
            if (connection === "open") {
                currentQR = null;
                console.log(chalk.green('\n✅ XROD MD BOT CONNECTED SUCCESSFULLY!'));
                console.log(chalk.cyan(`🤖 Bot: ${config.botName}`));
                console.log(chalk.cyan(`📌 Try: .menu on WhatsApp\n`));
                if (rl && !rlClosed) { rl.close(); rl = null; }
            }
            
            if (connection === 'close') {
                currentQR = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    try { rmSync('./session', { recursive: true, force: true }); } catch(e) {}
                    await delay(3000);
                    startBot();
                    return;
                }
                if (shouldReconnect) {
                    console.log(chalk.yellow('🔄 Reconnecting in 5 seconds...'));
                    await delay(5000);
                    startBot();
                }
            }
        });
        
        return sock;
    } catch (error) {
        console.log(chalk.red(`❌ Error: ${error.message}`));
        if (rl && !rlClosed) { rl.close(); rl = null; }
        await delay(5000);
        startBot();
    }
}

// ========== STARTUP ==========
console.log(chalk.cyan(`
╔════════════════════════════════════════╗
║        🤖 XROD MD BOT STARTING 🤖      ║
╚════════════════════════════════════════╝
`));

loadCommands();

// Start both bots
Promise.all([startBot(), tgBot.launch()]).then(() => {
    console.log(chalk.green('\n✅ TELEGRAM BOT STARTED'));
    console.log(chalk.green('✅ WHATSAPP BOT STARTED\n'));
}).catch((error) => {
    console.log(chalk.red(`❌ Fatal error: ${error.message}`));
    if (rl && !rlClosed) rl.close();
    process.exit(1);
});
