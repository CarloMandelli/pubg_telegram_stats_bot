const EventEmitter = require('events');
const lodash = require('lodash');
const emoji = require('node-emoji');
module.exports = class UsersManager extends EventEmitter {
  constructor(params) {
    super();
    this.dbManager = params.dbManager;
    this.telegramManager = params.telegramManager;
    this.telegramManager.on('registerUser', this.handleRegisterMyUser.bind(this));
    this.telegramManager.on('stopUser', this.deactivateMyUser.bind(this));
    this.telegramManager.on('startUser', this.handleStartMyUser.bind(this));
    this.userByStadiaAccountName = {};
  }

  async initialize(){
    return await this.createUserByAccount();
  }

  async createUserByAccount(){
    this.userByStadiaAccountName = {};
    const users = await this.getUsersActive();
    lodash.forEach(users,(user) =>{
      this.userByStadiaAccountName[user.stadiaAccountName] = user;
    });
  }

  static stadiaAccountAlreadyUsed(user, params) {
    return user.id !== params.chatId && user.stadiaAccountName === params.stadiaAccountName;
  }

  static isMyUserButStadiaAccountIsDifferent(user, params) {
    return user.id === params.chatId && user.stadiaAccountName !== params.stadiaAccountName;
  }


  async handleRegisterMyUser(chatId, othersParams) {
    if (!othersParams || othersParams.length === 0) {
      return false;
    }
    try {
      const params = { chatId, stadiaAccountName: othersParams.stadiaAccountName };
      const users = await this.getUserByChatIdOrUsername(params);
      if (users.length === 1) {
        const user = users[0];
        if (UsersManager.stadiaAccountAlreadyUsed(user, params)) {
          throw TypeError('Questo nome PUBG è già registrato');
        }
        if (UsersManager.isMyUserButStadiaAccountIsDifferent(user, params)) {
          const newUser = await this.modifyUser(params);
          this.emit('userModified', { oldAccount: user, newAccount: newUser[0] });
        }
        await this.telegramManager.sendMessage(
          {
            msg: `Registrazione ok.\nEntro pochi minuti dalla fine della partita riceverai le statistiche.\nSe il nome che hai registrato è sbagliato riscrivilo.`,
            telegramId: chatId,
            msgType: 'info'
          }
        );
      } else if (users.length > 1) {
        throw TypeError('Questo nome PUBG è già registrato');
      } else {
        const newUser = await this.saveUser(params);
        this.emit('userAdded', newUser);
        await this.telegramManager.sendMessage(
          {
            msg: `Registrazione ok.\nEntro pochi minuti dalla fine della partita riceverai le statistiche.\nSe il nome che hai registrato è sbagliato riscrivilo.`,
            telegramId: chatId,
            msgType: 'info'
          }
        );
      }
    } catch (e) {
      await this.telegramManager.sendMessage(
        { msg: e.message, telegramId: chatId, msgType: 'info' }
      );
    }
  }

  async getUserByChatIdOrUsername(params) {
    return this.dbManager.users.find({ $or: [{ id: params.chatId }, { stadiaAccountName: params.stadiaAccountName }] }).toArray();
  }

  async saveUser(params) {
    const user = await this.dbManager.users.insertOne({
      id: params.chatId,
      stadiaAccountName: params.stadiaAccountName,
      registrationDate: new Date(),
      active: true,
      sendMatches: true
    });
    await this.createUserByAccount();
    return user.ops[0];
  }

  async modifyUser(params) {
    await this.dbManager.users.updateOne({ id: params.chatId }, { $set: { stadiaAccountName: params.stadiaAccountName ,active: true} });
    await this.createUserByAccount();
    return await this.dbManager.users.find({ id: params.chatId }).toArray();
  }

  async getUsersActive() {
    return this.dbManager.users.find({ active: { $ne: false } }).toArray();
  }

  async handleStartMyUser(params){
    const userExist = await this.dbManager.users.find({ id: params.chatId }).toArray();
    if(userExist.length > 0){
      await this.activateMyUser(params);
      return await this.telegramManager.sendMessage(
        {
          msg: `Utente ${userExist[0].stadiaAccountName} riattivato.`,
          telegramId: params.chatId,
          msgType: 'info'
        }
      );
    }else{
      let msg = ['Invia un messaggio con il nome che usi in PUBG.'];
      msg.push('Entro pochi minuti dal termine di ogni partita riceverai un messaggio con queste statistiche:');
      msg.push(`${emoji.get('clock2')}: <b>ora di inizio della partita</b>`);
      msg.push(`${emoji.get('world_map')}: <b>mappa</b>`);
      msg.push(`${emoji.get('hourglass_flowing_sand')}: <b>tempo di gioco</b>`);
      msg.push(`${emoji.get('busts_in_silhouette')}: <b>partecipanti umani</b>`);
      msg.push(`${emoji.get('skull_and_crossbones')}: <b>partecipanti uccisi (umani ${emoji.get('face_with_head_bandage')}  bot ${emoji.get('robot_face')})</b>`);
      msg.push(`${emoji.get('coffin')}: <b>se sei stato ucciso da un umano o da un bot</b>`);
      msg.push(`${emoji.get('checkered_flag')}: <b>posizione in classifica nella partita</b>`);
      msg.push('Invia il comando /stop per fermare le notifiche');
      return await this.telegramManager.sendMessage(
        { msg: msg.join('\n'), telegramId: params.chatId, msgType: 'info' }
      );
    }
  }

  async deactivateMyUser(params){
    await this.dbManager.users.updateOne({ id: params.chatId }, { $set: { active: false} });
    const user = await this.dbManager.users.find({ id: params.chatId }).toArray()
    return this.emit('userDeactivated', { user: user});
  }
  async activateMyUser(params){
    await this.dbManager.users.updateOne({ id: params.chatId }, { $set: { active: true} });
    const user = await this.dbManager.users.find({ id: params.chatId }).toArray();
    return this.emit('userActivated', { user: user})
  }
};