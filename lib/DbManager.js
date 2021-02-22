const MongoClient = require('mongodb').MongoClient;
const mongoUrl = 'mongodb://' + '192.168.1.4' + ':32768';

module.exports = class DbManager{
  constructor(){
    this.dbConnection = null;
    this.matches = null;
    this.users = null;
  }

  async initialize() {
    console.log('initializeDb');
    await this.startupConnection();
    return await this.verifyDb();
  }

  async startupConnection() {
    const client = await MongoClient.connect(mongoUrl);
    this.dbConnection = client.db('pubg');
  }

  async verifyDb(){
    const collectionsInfo = await this.dbConnection.listCollections().toArray();
    this.verifyCollection(collectionsInfo, 'matches', {field:{ matchId: 1 ,stadiaAccountName:1}, params:{ name: 'matchId', unique: true }});
    this.verifyCollection(collectionsInfo, 'users', {field:{ id: 1, stadiaAccountName:1 }, params:{ name: 'userIdAccount', unique: true }});
  }

  async verifyCollection(collectionsInfo, collectionName, index){
    const coll = collectionsInfo.filter(coll => coll.name === collectionName);
    if(!coll.length){
      this.dbConnection.createCollection(collectionName);
    }
    this[collectionName] = this.dbConnection.collection(collectionName);
    let indexes = await this[collectionName].indexes({});
    let ind = indexes.find(_index => _index.name === index.params.name);
    if (!ind) {
      this[collectionName].createIndex(index.field, index.params);
    }
  }
};