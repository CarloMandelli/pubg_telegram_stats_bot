const EventEmitter = require('events');
const TelegramBot = require('node-telegram-bot-api');
const token = '<YOUR_TOKEN>';
module.exports = class TelegramManager extends EventEmitter {
  constructor() {
    super();
    this.telegramBot = new TelegramBot(token, { polling: true });
  }

  async initialize() {
    console.log('initializeTelegram');
    return this.telegramBot.on('message', this.handleMessage.bind(this));
  }

  async handleMessage(msg) {
    const userChatId = msg.chat.id;
    const isCommand = await this.managePossibleCommand(msg.text, userChatId);
    if (!isCommand) {
      await this.sendMessage(
        { msg: 'no command found', telegramId: userChatId, msgType: 'info' }
      );
    }
  };

  async managePossibleCommand(text, userChatId) {
    const [commandKey, ...params] = text.split(' ');
    switch (commandKey) {
      case '/start':
        this.emit('startUser', {chatId:userChatId});
        return true;
      case '/stop':
        this.emit('stopUser', {chatId:userChatId});
        await this.sendMessage(
          { msg: 'Notifiche fermate. Per riattivarle usa il comando /start', telegramId: userChatId, msgType: 'info' }
        );
        return true;
      default:
        this.emit('registerUser', userChatId, { stadiaAccountName: commandKey });
        return true;
    }
  }

  async sendMessage(msgObj) {
    const params = Object.assign(msgObj.params || {}, { parse_mode: "HTML" });
    try {
      await this.telegramBot.sendMessage(
        msgObj.telegramId,
        msgObj.msg,
        params
      );
    } catch (e) {
      console.error(`error notifying ${msgObj.type} for user ${msgObj.telegramId}:`, e);
    }
  }
};