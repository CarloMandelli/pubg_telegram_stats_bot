const PubgAPIManager = require('./lib/PubgAPIManager');
const pubgAPIManager = new PubgAPIManager();
const DbManager = require('./lib/DbManager');
const dbManager = new DbManager();
const TelegramManager = require('./lib/TelegramManager');
const telegramManager = new TelegramManager();
const UserManager = require('./lib/UsersManager');
const userManager = new UserManager({ dbManager, telegramManager });
const MatchesManager = require('./lib/MatchesManager');
const matchesManager = new MatchesManager({ dbManager, userManager });
const Scheduler = require('./lib/Scheduler');
const updateMatchesScheduler = new Scheduler();
const sendResultScheduler = new Scheduler();
const _async = require('async');
const lodash = require('lodash');

const log = false;

async function main() {
  await dbManager.initialize();
  await telegramManager.initialize();
  await userManager.initialize();
  updateMatchesScheduler.initialize({ userManager });
  sendResultScheduler.initialize({ userManager });
}

async function updateMatchesLoop() {
  const usersActive = await userManager.getUsersActive();
  updateMatchesScheduler.addAccountsToList(usersActive);
  updateMatchesScheduler.start(updateMatchesForUsers);
}

async function updateMatchesForUsers(users) {
  const stadiaAccountsName = users.map((u) => u.stadiaAccountName);
  log ? console.log('requestMatches ', stadiaAccountsName.join()) : null;
  const matchForUser = await pubgAPIManager.requestMatches(stadiaAccountsName);
  log ? console.log('insertMatchesForUser') : null;
  await matchesManager.insertMatchesForUser(matchForUser);
  log ? console.log('getMatchesWithoutTelemetryLink') : null;
  const matchesWithoutTelemetryLink = await matchesManager.getMatchesWithoutTelemetryLink();
  log ? console.log('createUniqueMatch') : null;
  const uniqueMatch = await matchesManager.createUniqueMatch(matchesWithoutTelemetryLink);
  log ? console.log('getMatchesDetails') : null;
  const matchesDetails = await pubgAPIManager.getMatchesDetails(uniqueMatch);
  log ? console.log('cleanDetailsFromMatches') : null;
  const matchesDetailsCleaned = await matchesManager.cleanDetailsFromMatches(matchesWithoutTelemetryLink, matchesDetails);
  log ? console.log('saveMatchesDetails') : null;
  await matchesManager.saveMatchesDetails(matchesDetailsCleaned);
  log ? console.log('getMatchesWithoutTelemetry') : null;
  const matchesWithoutTelemetry = await matchesManager.getMatchesWithoutTelemetry();
  log ? console.log('async') : null;
  await _async.eachOfLimit(matchesWithoutTelemetry, 4, async function (match) {
    log ? console.log('getTelemetryForMatch') : null;
    const telemetryForMatch = await pubgAPIManager.getTelemetryForMatch(match);
    log ? console.log('saveTelemetry') : null;
    await matchesManager.saveTelemetry(match, telemetryForMatch);
  });
}

async function sendResultsToUserLoop() {
  const usersActive = await userManager.getUsersActive();
  sendResultScheduler.addAccountsToList(usersActive);
  sendResultScheduler.start(sendResultForUser);
}

async function sendResultForUser(users) {
  const matchForUser = await matchesManager.matchToSendForUsers(users);
  let dictUserNotSend = {};
  if (matchForUser.length > 0) {
    await _async.eachOf(matchForUser, async function (match) {
      if (dictUserNotSend[match.stadiaAccountName] || !lodash.find(users, { 'stadiaAccountName': match.stadiaAccountName }).sendMatches) {
        dictUserNotSend[match.stadiaAccountName] = true;
      } else {
        dictUserNotSend[match.stadiaAccountName] = false;
        const dataToSend = await matchesManager.elaborateDataToSend(match);
        await telegramManager.sendMessage(dataToSend);
      }
      await matchesManager.saveMatchSent(match, dictUserNotSend[match.stadiaAccountName]);
    });
  }
}

main().then(() => {
  updateMatchesLoop();
  sendResultsToUserLoop();
});