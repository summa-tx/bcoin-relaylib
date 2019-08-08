
const EventEmitter = require('events');
const RelayDB = require('./relaydb');

class Relay extends EventEmitter {
  constructor(options) {
    super();

    this.options = options;
    this.logger = this.options.logger.context('relay');

    this.db = new RelayDB(this.options);
  }

  async open() {
    await this.db.open();
  }

  getOutpoints() {
    return this.db.getOutpoints();
  }

  setOutpoint(outpoint) {
    ;
  }

  hasOutpoint(outpoint) {
    ;
  }

  getScripthashes() {
    return this.db.getScripthashes();
  }

  setScripthash(hash) {
    ;
  }

  hasScripthash(hash) {
    ;
  }

}

module.exports = Relay;
