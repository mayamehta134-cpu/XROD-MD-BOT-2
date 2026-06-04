const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const chalk = require('chalk');
const { parsePhoneNumber: PhoneNumber } = require('awesome-phonenumber');

// =============== CONFIG ===============
const config = {
    botName: "XROD MD",
    ownerNumber: "923051391005",
    pairingNumber: "923051391005",
    prefixes: ["."]
};

const PREFIX = ".";
const WHATSAPP_CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbCWpej7oQhWH4A2HK2k';

// Create folders
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync('./session')) fs.mkdirSync('./session');
if (!fs.existsSync('./Plugins')) fs.mkdirSync('./Plugins');

// Owner data
let owner = [];
try {
    owner = JSON.parse(fs.readFileSync('./data/owner.json', 'utf-8'));
} catch(e) { owner = [config.ownerNumber]; }

// Store
let store = { contacts: {}, messages: {} };
let currentQR = null;

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
                if (cmd.name) {
                    commands.set(cmd.name, cmd);
                    if (cmd.alias) cmd.alias.forEach(alias => commands.set(alias, cmd));
                }
                console.log(`✅ Loaded: ${file}`);
            } catch(e) { console.log(`❌ Error: ${file}`); }
        }
    }
    console.log(`\n📦 Total ${commands.size} commands loaded!\n`);
}

// =============== MESSAGE HANDLER ===============
async function handleMessages(sock, messages) {
    const msg = messages[0];
    if (!msg.message) return;
    
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    
    if (!text.startsWith(PREFIX)) return;
    
    const args = text.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Check plugins
    if (commands.has(command)) {
        try {
            await commands.get(command).run({
                XROD: sock, m: msg, inputCMD: command, text: args.join(' '), from,
                conn: sock, message: msg,
                reply: async (txt) => await sock.sendMessage(from, { text: txt }),
                isOwner: owner.includes(msg.key.participant?.split('@')[0])
            });
        } catch(e) { console.log(e); await sock.sendMessage(from, { text: '❌ Error!' }); }
        return;
    }
    
    // Built-in commands
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

// =============== MAIN BOT ===============
async function startBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    
    const sock = makeWASocket({
        version,
        logger: Pino({ level: 'silent' }),
        browser: Browsers.macOS('Chrome'),
        auth: { creds: state.creds, keys: state.keys },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        msgRetryCounterCache: new (require('node-cache'))(),
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            console.log(chalk.yellow('\n📱 QR CODE GENERATED\n'));
            const qrString = await QRCode.toString(qr, { type: 'terminal', small: true });
            console.log(qrString);
            console.log(chalk.cyan('\n👉 WhatsApp → Linked Devices → Link a Device → Scan QR\n'));
        }
        
        if (connection === 'open') {
            currentQR = null;
            console.log(chalk.green('\n✅ XROD MD BOT CONNECTED!'));
            console.log(chalk.cyan(`📌 Try: .menu on WhatsApp\n`));
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log(chalk.yellow('🔄 Reconnecting...'));
                setTimeout(startBot, 5000);
            }
        }
    });
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
        await handleMessages(sock, messages);
    });
    
    // Generate pairing code (for Pakistan numbers)
    if (!state.creds?.registered && config.pairingNumber) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(config.pairingNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(chalk.bgGreen(`\n🔐 PAIRING CODE: ${code}\n`));
                console.log(chalk.cyan('👉 WhatsApp → Linked Devices → Link a Device → Enter code\n'));
            } catch(e) {
                console.log(chalk.red('❌ Invalid number! Use 923xxxxxxxxx format'));
            }
        }, 3000);
    }
    
    return sock;
}

// ========== STARTUP ==========
console.log(chalk.cyan(`
╔════════════════════════════════════════╗
║        🤖 XROD MD BOT STARTING 🤖      ║
╚════════════════════════════════════════╝
`));

loadCommands();
startBot().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Shutting down...'));
    process.exit(0);
});
