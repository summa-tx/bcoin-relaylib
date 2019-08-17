/*
 * relaydb for bcoin
 */

const bdb = require('bdb');
const layout = require('./layout');
const {Script, Outpoint} = require('bcoin');
const consensus = require('bcoin/lib/protocol/consensus');
const assert = require('bsert');
const Logger = require('blgr');

class RelayDB {
  constructor(options) {
    this.options = options;
    this.network = this.options.network;

    if (options.logger != null) {
      this.logger = options.logger.context('relaydb');
    } else {
      const logger = new Logger();
      this.logger = logger.context('relaydb');
    }

    this.db = bdb.create(this.options);
  }

  async open() {
    await this.db.open();
  }

  async close() {
    await this.db.close();
  }

  async getScripts() {
    return this.db.values({
      gte: layout.s.min(),
      lte: layout.s.max(),
      parse: data => Script.fromRaw(data)
    });
  }

  async putScript(script, outpoint) {
    assert(script.length <= consensus.MAX_SCRIPT_SIZE);

    const hash = script.sha256();
    const key = layout.s.encode(hash);
    await this.db.put(key, script.toRaw());
  }

  async hasScript(script) {
    return this.db.has(layout.s.encode(script.sha256()));
  }

  async deleteScript(script) {
    await this.db.del(layout.s.encode(script.sha256()));
  }

  async getOutpoints() {
    return this.db.keys({
      gte: layout.o.min(),
      lte: layout.o.max(),
      parse: data => {
        const [hash, index] = layout.o.decode(data);
        return Outpoint.fromOptions({hash, index});
      }
    });
  }

  async putOutpoint(outpoint) {
    const {hash, index} = outpoint;
    await this.db.put(layout.o.encode(hash, index), null);
  }

  async hasOutpoint(outpoint) {
    const {hash, index} = outpoint;
    return this.db.has(layout.o.encode(hash, index));
  }

  async deleteOutpoint(outpoint) {
    const {hash, index} = outpoint;
    this.db.del(layout.o.encode(hash, index));
  }
}

module.exports = RelayDB;
