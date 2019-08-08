
const layout = require('./layout');
const bdb = require('bdb');


class RelayDB {
  constructor(options) {
    this.options = options;
    this.network = this.options.network;
    this.logger = this.options.logger.context('relaydb');

    this.db = bdb.create(this.options);
  }

  async open() {
    await this.db.open();
  }

  async getScripthashes() {
    return this.db.values({
      gte: layout.s.min(),
      lte: layout.s.max(),
      parse: data => data
    });
  }

  async setScripthash() {
    ;
  }

  async hasScripthash() {
    ;
  }

  async getOutpoints() {
    return this.db.values({
      gte: layout.o.min(),
      lte: layout.o.max(),
      parse: data => data
    });
  }

  async setOutpoint() {
    ;
  }

  async hasOutpoint() {
    ;
  }
}

module.exports = RelayDB;
