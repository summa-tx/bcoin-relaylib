
const bdb = require('bdb');
const Indexer = require('bcoin/lib/indexer/indexer');
const layout = require('./layout');
const {ScriptRecord, OutpointRecord} = require('./records')
const Request = require('./request');
const sha256 = require('bcrypto/lib/sha256');
const {BloomFilter} = require('bfilter');

/**
 * RelayIndexer
 * Returns serialized data, not raw data
 */

class RelayIndexer extends Indexer {
  constructor(options) {
    super('relay', options);

    this.requests = 0;
    this.filter = BloomFilter.fromRate(20000, 0.001, BloomFilter.flags.ALL);
    this.db = bdb.create(this.options);

  }

  async open() {
    await super.open();

    // keep track of the number of requests
    const requests = await this.getRequests();
    const ids = [];

    for (const {id} of requests)
      ids.push(id);

    const max = Math.max(ids);

    this.requests = max + 1;
  }

  // TODO: focus on logic here
  // when new blocks are connected, do work here
  async indexBlock(meta, block, view) {
    for (let i = 0; i < block.txs.length; i++) {
      const tx = block.txs[i];

      // test outpoints being consumed
      for (const input of tx.inputs) {
        const prevout = input.prevout;
        if (this.filter.test(prevout.toRaw())) {
          // TODO: lookup the ids that are interested based on the prevout

          // getOutpoint record, that should have all the ids
          // for each id, get the Request
          // emit the prevout and list of request json

          this.emit('output consumed', prevout);
        }
      }

      // test outputs being created
      for (const [j, output] of Object.entries(tx.outputs)) {
        const script = output.script;

        if (this.filter.test(script.toRaw())) {
          // TODO: lookup the ids that are interested
          // based on the script

          const txid = tx.txid();
          const index = j;

          const record = OutpointRecord.fromJSON({

          });

          await this.putOutpoint(record);

          this.emit('output created', record);
        }
      }
    }
  }

  // when new blocks are disconnected, do work here
  async unindexBlock(meta, block, view) {
    ;
  }

  async getRequest(id) {
    const key = layout.i.encode(id);
    const raw = await this.db.get(key);
    return Request.decode(raw, id);
  }

  async getRequests() {
    const items = await this.db.range({
      gte: layout.i.min(),
      lte: layout.i.max(),
      values: true
    });

    const requests = [];

    for (const {key, value} of items) {
      const id = layout.i.decode(key)[0];
      const request = Request.decode(value, id);
      requests.push(request);
    }

    return requests;
  }

  async deleteRequest(id) {
    const key = layout.i.encode(id);

    if (this.batch)
      this.del(key);
    else
      this.db.del(key);
  }

  async hasRequest(id) {
    const key = layout.i.encode(id);
    return this.db.has(key);
  }

  async putRequest(request) {
    const id = request.id == null ? this.requests++ : request.id;
    request.id = id;

    const key = layout.i.encode(id);

    if (this.batch)
      this.put(key, request.encode());
    else
      this.db.put(key, request.encode());

    return request;
  }

  /**
   * Get all ScriptRecords
   * TODO: get both keys and values,
   * pass hash as second arg to decode
   */

  async getScripts() {
    return this.db.values({
      gte: layout.s.min(),
      lte: layout.s.max(),
      parse: data => ScriptRecord.decode(data)
    });
  }

  /**
   * Get ScriptRecord by hash
   */

  async getScript(record) {
    const hash = sha256.digest(record.script);
    const key = layout.s.encode(hash);

    const raw = await this.db.get(key);

    if (!raw)
      return null;

    return ScriptRecord.decode(raw, hash);
  }

  scriptIterator() {
    return this.db.iterator({
      gte: layout.s.min(),
      lte: layout.s.max()
    });
  }

  /**
   * Put ScriptRecord in database.
   * @param {ScriptRecord} record
   */

  async putScript(record) {
    const hash = sha256.digest(record.script);
    const key = layout.s.encode(hash);

    if (this.batch)
      this.put(key, record.encode());
    else
      await this.db.put(key, record.encode());
  }

  async hasScript(record) {
    const hash = sha256.digest(record.script);
    const key = layout.s.encode(hash);
    return this.db.has(key);
  }

  async deleteScript(record) {
    const hash = sha256.digest(record.script);
    const key = layout.s.encode(hash);

    if (this.batch)
      this.del(key);
    else
      await this.db.del(key);
  }

  async getOutpoints() {
    const items = await this.db.range({
      gte: layout.o.min(),
      lte: layout.o.max(),
      values: true
    });

    const scripts = [];
    for (const item of items) {
      const [hash, index] = layout.o.decode(item.key);

      const record = OutpointRecord.decode(item.value, {
        hash: hash,
        index: index
      });

      scripts.push(record);
    }

    return scripts;
  }

  /**
   * Create an iterator for all outpoint records
   */

  outpointIterator() {
    return this.db.iterator({
      gte: layout.o.min(),
      lte: layout.o.max()
    });
  }

  /**
   * Put outpoint record in database.
   */

  async putOutpoint(record) {
    const {hash, index} = record.prevout;
    const key = layout.o.encode(hash, index);

    if (this.batch)
      this.put(key, record.encode());
    else
      await this.db.put(key, record.encode());
  }

  async hasOutpoint(record) {
    const {hash, index} = record.prevout;
    const key = layout.o.encode(hash, index);
    return this.db.has(key);
  }

  async deleteOutpoint(record) {
    const {hash, index} = record.prevout;
    const key = layout.o.encode(hash, index);

    if (this.batch)
      this.del(key);
    else
      this.db.del(key);
  }
}

class RelayIndexerOptions {
  constructor(options) {

    this.filter = BloomFilter.fromRate(20000, 0.001, BloomFilter.flags.ALL);

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    if (options.filter)
      this.filter = options.filter;

    return this;
  }
}

module.exports = RelayIndexer;
