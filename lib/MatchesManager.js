const _async = require('async');
const lodash = require('lodash');
const moment = require('moment-timezone');
const emoji = require('node-emoji');
const log = false;
const MAP = {
  Summerland_Main: 'Karakin',
  DihorOtok_Main: 'Vikendi',
  Desert_Main: 'Miramar',
  Savage_Main: 'Sanhok',
  Baltic_Main: 'Erangel',
};

module.exports = class MatchesManager {
  constructor(params) {
    this.dbManager = params.dbManager;
    this.userManager = params.userManager;
  }

  async cleanDetailsFromMatches(savedMatch, matchesDetails) {
    const me = this;
    let detailsForMatches = {};
    await _async.eachOf(matchesDetails, async function (match, matchId) {
      if(match.data) {
        detailsForMatches[matchId] = {
          participantCount: 0,
          mapName: match.data.attributes.mapName,
          createdAt: match.data.attributes.createdAt
        };
        match.included.map((det) => {
          if (!detailsForMatches[matchId].telemetryLink && det.type === 'asset' && det.attributes.name === 'telemetry') {
            detailsForMatches[matchId].telemetryLink = det.attributes.URL;
          }
          if (det.type === 'participant') {
            detailsForMatches[matchId].participantCount++;
          }
        });
        await _async.eachOf(savedMatch, async function (matchSaved) {
          if (matchSaved.matchId === matchId) {
            matchSaved = Object.assign(matchSaved, detailsForMatches[matchId]);
            match.included.map((det) => {
              if (det.type === 'participant' && det.attributes.stats.name === matchSaved.stadiaAccountName) {
                matchSaved.timeSurvived = det.attributes.stats.timeSurvived;
                matchSaved.rank = det.attributes.stats.winPlace;
              }
            });
          }
        });
      }
    });
    const matchSortedByDate = lodash.sortBy(savedMatch, ['createdAt']);
    matchSortedByDate.forEach((m) => {
        if (new Date(m.createdAt) < new Date(me.userManager.userByStadiaAccountName[m.stadiaAccountName].registrationDate)) {
          m.telemetryLink = 'invalidatedByDate';
          m.telemetry = 'invalidatedByDate';
        }
      }
    );
    return savedMatch;
  }

  async insertMatchesForUser(matchForUser) {
    let matchesWithUser = [];
    lodash.forEach(matchForUser, (matches, stadiaAccountName) => {
      lodash.forEach(matches, (match) => {
        delete match.type;
        match.matchId = match.id;
        delete match.id;
        matchesWithUser.push(Object.assign({ stadiaAccountName }, match));
      });
    });
    await this.dbManager.matches.insertMany(matchesWithUser, { ordered: false }).then((res) => {
    }, () => {
    });
  }

  async getMatchesWithoutTelemetryLink() {
    return await this.dbManager.matches.find({ telemetryLink: { $exists: false } }).sort({createdAt:-1}).toArray();
  }

  async getMatchesWithoutTelemetry() {
    return await this.dbManager.matches.find({ telemetry: { $exists: false } }).sort({createdAt:-1}).toArray();
  }

  async saveMatchesDetails(matchesDetails) {
    const me = this;
    await _async.eachOf(matchesDetails, async function (detail) {
      await me.dbManager.matches.updateOne({ _id: detail._id }, { $set: detail });
    });
  }

  async saveTelemetry(match, telemetry) {
    if (telemetry) {
      await this.dbManager.matches.updateOne({ matchId: match.matchId,  stadiaAccountName : match.stadiaAccountName}, {
        $set: {
          telemetry: telemetry,
          readyToSend: telemetry.length > 0
        }
      });
    }
  }

  async matchToSendForUsers(user) {
    var users = user.map((u) => u.stadiaAccountName);
    log ? console.log('matchToSendForUsers ', users.join()) : null;
    return await this.dbManager.matches.find({
      stadiaAccountName: { $in: users },
      readyToSend: true,
      sent: { $ne: true }
    }).sort({createdAt:-1}).toArray();
  }

  elaborateDataToSend(match) {
    const humanKilled = lodash.filter(match.telemetry, (el) => el.killer && el.killer.name === match.stadiaAccountName && el.victim && el.victim.accountId.indexOf('account.') === 0);
    const botKilled = lodash.filter(match.telemetry, (el) => el.killer && el.killer.name === match.stadiaAccountName && el.victim && el.victim.accountId.indexOf('ai.') === 0);
    const whoKilledMe = lodash.filter(match.telemetry, (el) => el.victim && el.victim.name === match.stadiaAccountName);
    let info = [`${emoji.get('clock2')}: <b>${moment.tz(match.createdAt, 'Europe/Rome').format('llll')}</b>`];
    info.push(`${emoji.get('world_map')}: <b>${MAP[match.mapName]}</b>`);
    info.push(`${emoji.get('hourglass_flowing_sand')}: <b>${moment.utc(match.timeSurvived * 1000).format('mm:ss')
    }</b>`);
    info.push(`${emoji.get('busts_in_silhouette')}: <b>${match.participantCount}</b>`);
    info.push(`${emoji.get('skull_and_crossbones')}: <b>${humanKilled.length + botKilled.length} (${humanKilled.length} ${emoji.get('face_with_head_bandage')}  ${botKilled.length} ${emoji.get('robot_face')})</b>`);
    if(whoKilledMe.length > 0){
      info.push(`${emoji.get('coffin')}: <b>${whoKilledMe[0].killer.accountId.indexOf('ai.') === 0 ? emoji.get('robot_face') : whoKilledMe[0].killer.name + ' ' + emoji.get('man-pouting')}</b>`);
    }
    let rank = match.rank;
    if (match.rank == 1) {
      rank = `${emoji.get('poultry_leg')}`;
    }
    info.push(`${emoji.get('checkered_flag')}: <b>${rank}</b>`);
    return { msg: info.join('\n'), telegramId: this.userManager.userByStadiaAccountName[match.stadiaAccountName].id };
  }

  async saveMatchSent(match, wasNotReallySent) {
    await this.dbManager.matches.updateOne({ _id: match._id, stadiaAccountName: match.stadiaAccountName }, { $set: { sent: true,  sentTime:wasNotReallySent ? null : new Date()} });
  }

  createUniqueMatch(matches){
    let uniqueMatch = {};
    matches.forEach((m)=>uniqueMatch[m.matchId]= m);
    return lodash.map(uniqueMatch,(m)=>m);
  }

};