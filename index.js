const { Telegraf, Markup } = require('telegraf');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

// =============== CONFIGURATION ===============
const BOT_TOKEN = '8727180497:AAEEa4tCJ0lWHyc8DmnydKXvJzMeenCwgH8';
const WHATSAPP_CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbCWpej7oQhWH4A2HK2k';
const PREFIX = ".";

// Create folders
if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

// Store plugins
let plugins = new Map();

// Load all plugins from Plugins folder
function loadPlugins() {
    const pluginsPath = path.join(__dirname, 'Plugins');
    if (!fs.existsSync(pluginsPath)) {
        console.log('⚠️ Plugins folder not found!');
        return;
    }
    
    const files = fs.readdirSync(pluginsPath);
    let loadedCount = 0;
    
    for (const file of files) {
        if (file.endsWith('.js')) {
            try {
                const plugin = require(`./Plugins/${file}`);
                if (plugin.name) {
                    plugins.set(plugin.name, plugin);
                    if (plugin.alias && Array.isArray(plugin.alias)) {
                        plugin.alias.forEach(alias => {
                            plugins.set(alias, plugin);
                        });
                    }
                    loadedCount++;
                    console.log(`✅ Loaded: ${file}`);
                }
            } catch(e) {
                console.log(`❌ Error loading ${file}`);
            }
        }
    }
    console.log(`\n📦 Total ${loadedCount} plugins loaded!\n`);
}

// =============== TELEGRAM BOT ===============
const bot = new Telegraf(BOT_TOKEN);
const telegramSessions = new Map();

bot.start((ctx) => {
    ctx.reply(`
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃     🤖 XROD PAIRING BOT 🤖         ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

🌟 *Welcome to XROD Pairing Bot!*

🔹 *Get WhatsApp 8-digit pairing code*
🔹 *Scan QR code to pair WhatsApp*

📌 *Commands:*
/pair 923xxxxxxxxx - Get pairing code
/qr - Get QR code instructions
/status - Check bot status

*Made with ❤️ by XROD*
    `, Markup.inlineKeyboard([
        [Markup.button.url('📱 JOIN WHATSAPP CHANNEL', WHATSAPP_CHANNEL_LINK)],
        [Markup.button.callback('🔐 GET PAIRING CODE', 'get_pairing')],
        [Markup.button.callback('📱 GET QR CODE', 'get_qr')],
        [Markup.button.callback('📊 CHECK STATUS', 'check_status')]
    ]));
});

bot.action('get_pairing', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃     🔐 GET PAIRING CODE 🔐         ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

📱 *Send your WhatsApp number:*

\`/pair 923001234567\`

🇵🇰 Pakistan: 923xxxxxxxxx
🇺🇸 USA: 1xxxxxxxxxx
    `);
});

bot.action('get_qr', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃        📱 QR CODE METHOD 📱        ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

📌 *Scan QR code from terminal:*
1. Open WhatsApp
2. Settings → Linked Devices
3. Tap "Link a Device"
4. Scan QR code

✅ *Works for ALL countries!*
    `);
});

bot.action('check_status', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃          📊 BOT STATUS            ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

✅ *Bot is online!*
👥 *Active sessions:* ${telegramSessions.size}
🌍 *QR code works for ALL countries!*
    `);
});

bot.command('help', (ctx) => {
    ctx.reply(`
📌 *Commands:*
/pair 923xxxxxxxxx - Get pairing code
/qr - QR code instructions
/status - Bot status
    `);
});

bot.command('status', (ctx) => {
    ctx.reply(`✅ Bot online! 👥 ${telegramSessions.size} active sessions`);
});

bot.command('qr', (ctx) => {
    ctx.reply(`📱 Scan QR code from terminal → WhatsApp → Linked Devices → Link a Device`);
});

bot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(`❌ Usage: /pair 923xxxxxxxxx`);
    }
    
    let number = args[1].replace(/\D/g, '');
    if (number.length < 10 || number.length > 15) {
        return ctx.reply('❌ Invalid number!');
    }
    
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
🔐 YOUR PAIRING CODE: ${code}

HOW TO PAIR:
1. Open WhatsApp
2. Linked Devices
3. Link a Device
4. Enter: ${code}

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
            console.log('\n📱 SCAN THIS QR CODE WITH WHATSAPP\n');
            qrcode.generate(qr, { small: true });
            console.log('\n1. Open WhatsApp → Linked Devices → Link a Device\n');
        }
        
        if (connection === 'open') {
            console.log('\n✅ WHATSAPP BOT CONNECTED!\n📌 Try: .menu on WhatsApp\n');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(startWhatsAppBot, 3000);
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
        
        // Check plugins first
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
        
        // .menu command
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
            await sock.sendMessage(from, { text: `❌ Command "${command}" not found!\n\nType .menu for available commands.` });
        }
    });
}

// Start both bots
Promise.all([startWhatsAppBot(), bot.launch()]).then(() => {
    console.log('\n✅ TELEGRAM BOT STARTED');
    console.log('✅ WHATSAPP BOT STARTED\n');
});
