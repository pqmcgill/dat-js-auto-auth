const Dat = require('@pqmcgill/dat-js');
const encoding = require('dat-encoding');

/**
 * Extends the Dat object to include a cache of connected users, and an
 * opinionated authorization strategy in which all connected peers are automatically
 * authorized as writers.
 */
class AutoDat extends Dat {
  constructor(opts) {
    super(opts);

    this.network = {};

    const sw = this.swarm;
    sw.on('connection', (peer, info) => {
      const discoveryKey = info.channel;
      const peerData = this._parseUserData(peer);
      this._authorize(peerData, discoveryKey, (err) => {
        if (err) throw new Error('could not authorize peer', err)
        console.log('authorized peer: ', peerData);
        this._addUser(info.channel, peerData);
        peer.on('close', () => {
          console.log('peer left: ', peerData);
          this._removeUser(info.channel, peerData);
        })
      })
    })
  }

  /**
   * Takes a peer and an archive, and authorizes that peer on that archive
   * using their local db key
   */
  _authorize(peerData, discoveryKey, cb) {
    const key = encoding.decode(peerData.key)
    const archive = this.archives.find(a => encoding.encode(a.discoveryKey) === discoveryKey)
    if (!archive) throw new Error('attempting to authorize with an unknown archive', peerData.archiveKey)
    archive.ready(() => {
      archive.db.authorized(key, (err, auth) => {
        if (err) return cb(err)
        if (auth) return cb()

        archive.db.authorize(key, (err) => {
          if (err) return cb(err)
          cb()
        })
      })
    })
  }

  /**
   * Adds a user to the users cache. Emits a "join" event with the peerData
   */
  _addUser(channel, peerData) {
    if (!this.network[channel]) this.network[channel] = {};
    if (this.network[channel][peerData.key]) return;
    this.network[channel][peerData.key] = peerData
    this.emit(`join:${channel}`, peerData, this.network[channel]);
  }

  /**
   * Removes a user from the users cache. Emits a "leave" event with the peerData
   */
  _removeUser(channel, peerData) {
    if (!this.network[channel] || !this.network[channel][peerData.key]) return;
    delete this.network[channel][peerData.key];
    this.emit(`leave:${channel}`, peerData, this.network[channel]);
    if (Object.keys(this.network[channel]).length === 0) {
      delete this.network[channel];
    }
  }

  /**
   * Grabs the remoteUserData off of a given peer
   */
  _parseUserData(peer) {
    if (!peer.remoteUserData) {
      throw new Error('peer does not have userData');
    }
    return JSON.parse(peer.remoteUserData);
  }
}

