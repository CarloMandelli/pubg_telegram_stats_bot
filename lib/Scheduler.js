const lodash = require('lodash');
module.exports = class Scheduler {
  constructor() {
    this.accountsList = [];
    this.timer = null;
    this.actualAccountsProcessedIndex = 0;
    this.running = false;
    this.frequencyTimeout = 6000;
  };

  initialize(params){
    console.log('initializeScheduler');
    if(this.timer){
      clearTimeout(this.timer)
    }
    this.actualAccountsProcessedIndex = 0;
    this.running = false;
    this.userManager = params.userManager;
    this.userManager.on('userAdded', this.handleUserAdded.bind(this));
    this.userManager.on('userModified', this.handleUserModified.bind(this));
    this.userManager.on('userActivated', this.handleUserActivated.bind(this));
    this.userManager.on('userDeactivated', this.handleUserDeactivated.bind(this));
  }

  startTimeout(fn){
    return setTimeout(fn,this.frequencyTimeout);
  }

  start(fn){
    console.log('start Scheduler');
    const me = this;
    if(me.running === false){
      me.running = true;
      this.timer = me.startTimeout(()=>me.processAccounts(fn));
      console.log('Scheduler started');
    }
  }

  stop(){
    this.initialize();
    console.log('Scheduler stopped');
  }

  async processAccounts(fn){
    const me = this;
    console.log(fn.name.toUpperCase() + ':' +new Date().toString());
    if(this.accountsList.length > 0) {
      me.actualAccountsProcessedIndex === me.accountsList.length - 1 ? this.frequencyTimeout = 60000 : this.frequencyTimeout = 6000;
      if (me.actualAccountsProcessedIndex === me.accountsList.length - 1) {
        me.actualAccountsProcessedIndex = 0;
      } else {
        me.actualAccountsProcessedIndex++;
      }
      await fn(me.accountsList[me.actualAccountsProcessedIndex]);
    }
    if(me.running === true){
      this.timer = me.startTimeout(()=>me.processAccounts(fn));
    }
  }

  handleUserAdded(params){
    this.addAccountsToList(params)
  }

  handleUserModified(params){
    this.removeAccountFromList([params.oldAccount]);
    this.addAccountsToList([params.newAccount]);
  }

  handleUserActivated(params){
    this.addAccountsToList(params.user)
  }

  handleUserDeactivated(params){
    this.removeAccountFromList(params.user);
  }

  addAccountsToList(accounts, position){
    //questa mette gli account tutti separati quindi una richiesta per ogni account
    //this.accountsList = lodash.concat(this.accountsList, accounts)
    //si possono fare al massimo 10 richieste al minuto. Ogni richiesta può essere al massimo per 10 utenti
    //nella lista degli account ci saranno gruppi da 10. Per ogni gruppo verrà fatta al massimo una richiesta al minuto
    //quando i gruppi saranno più di 10 (vuol dire 100 utenti registrati) penseremo come procedere.
    let firstIndex = 0;
    if(this.accountsList.length === 0){
      this.accountsList.push([accounts[firstIndex]]);
      firstIndex++;
    }
    for(let index=firstIndex;index < accounts.length; index++) {
      let lastGroup = this.accountsList[this.accountsList.length - 1];
      if (lastGroup.length < 10) {
        lastGroup.push(accounts[index])
      } else {
        this.accountsList.push([accounts[index]])
      }
    }
  }
  removeAccountFromList(account){
    this.accountsList.forEach((group)=>group = lodash.pullAllBy(group, account, 'id'));
  }

};