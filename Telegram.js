const { Telegraf } = require('telegraf');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs');

const BOT_TOKEN = '8854531682:AAF6P6NJfrU1nb9-wl85mlnRTdHat7ChKC8';
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply(`🤖 *XROD PAIRING BOT*

Send your WhatsApp number:
\`/pair 923001234567\`

🇵🇰 Pakistan: 923xxxxxxxxx
🇮🇳 India: 91xxxxxxxxxx (Use QR code in WhatsApp bot)

/pair - Get 8-digit code
/status - Check status`);
});

bot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply(`❌ Usage: /pair 923001234567`);
    
    let number = args[1].replace(/\D/g, '');
    if (!number.startsWith('92') && !number.startsWith('91')) number = '92' + number;
    
    const msg = await ctx.reply(`🔄 Generating code for +${number}...`);
    
    try {
        const sessionPath = `./sessions/${number}_${Date.now()}`;
        if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: Pino({ level: 'silent' }) });
        sock.ev.on('creds.update', saveCreds);
        
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(number);
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `
🔐 *YOUR PAIRING CODE:* ${code}

*HOW TO PAIR:*
1. Open WhatsApp → Settings → Linked Devices
2. Tap "Link a Device"
3. Enter this code

✅ Valid for 2 minutes`);
                setTimeout(() => fs.rmSync(sessionPath, { recursive: true, force: true }), 120000);
            } catch(e) {
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Failed! Use QR code method.`);
            }
        }, 3000);
    } catch(e) { ctx.reply(`❌ Error!`); }
});

bot.command('status', (ctx) => ctx.reply(`✅ Bot online!`));
bot.launch();
console.log('🤖 Telegram Pairing Bot Started!');
