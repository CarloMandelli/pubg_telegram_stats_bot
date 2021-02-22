const https = require('node-fetch');
const _async = require('async');

module.exports = class PubgAPIManager {
  constructor() {
    this.baseRequestOptions = {
      host: 'https://api.pubg.com',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Authorization': 'Bearer <YOUR_APIKEY>'
      }
    };
  }

  async requestMatches(users) {
    const options = Object.assign({
      path: '/shards/stadia/players?filter[playerNames]=' + users,
      method: 'GET'
    }, this.baseRequestOptions);
    try {
      const res = await https(options.host + options.path, options);
      const obj = await res.json();
      let matchForUser = {};
      obj.data.forEach((el)=>matchForUser[el.attributes.name] = el.relationships.matches.data);
      return matchForUser;
    } catch (e) {
      return [];
    }
  }

  async getMatchesDetails(matches) {
    const me = this;
    let matchesDetails = {};
    await _async.each(matches, async function (match) {
      const options = Object.assign({
        path: '/shards/stadia/matches/' + match.matchId,
        method: 'GET'
      }, me.baseRequestOptions);
      try {
        const res = await https(options.host + options.path, options);
        matchesDetails[match.matchId] = await res.json();
      } catch (err) {
        console.log(err);
      }
    });
    return matchesDetails;
  }

  async getTelemetryForMatch(match) {
    try {
      if (!match.telemetryLink) {
        return;
      }
      const res = await https(match.telemetryLink);
      const obj = await res.json();
      return await _async.filter(obj, (el, cb) => {
          cb(null, el.killer && (el.killer.name === match.stadiaAccountName || el.victim.name === match.stadiaAccountName));
        }
      );
    } catch (e) {
      console.log(e);
      return;
    }
  }
};