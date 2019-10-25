/*!
 * indexer.js - RelayIndexer for bcoin
 * Copyright (c) 2019, Mark Tyneway (Apache-2.0 License).
 * https://github.com/summa-tx/bcoin-relaylib
 */

'use strict';

const bdb = require('bdb');
const Indexer = require('bcoin/lib/indexer/indexer');
const layout = require('./layout');
const {ScriptRecord, OutpointRecord} = require('./records');
const Request = require('./request');
const sha256 = require('bcrypto/lib/sha256');
const assert = require('bsert');
const util = require('./util');

/**
 * RelayIndexer
 * Returns serialized data, not raw data
 */

class RelayIndexer extends Indexer {
  constructor(options) {
    super('relay', options);

    assert(options.has && typeof options.has === 'function');
    this.has = options.has;

    this.db = bdb.create(this.options);
  }

  async open() {
    await super.open();
  }

  /**
   * Called every time that a block is connected
   * to the chain. The block is known to be valid
   * and is extending the main chain.
   */

  async indexBlock(meta, block, view, has = null) {
    if (has === null)
      has = this.has;

    assert(typeof has === 'function');

    for (let i = 0; i < block.txs.length; i++) {
      const tx = block.txs[i];

      // little endian hash string
      const hex = tx.txid();

      // maintain a deduplicated set of
      // requests that have been satisfied
      // by this block
      const satisfied = new Set();

      // check to see if any prevouts have been consumed
      // that are included in the bloom filter
      for (const [j, input] of Object.entries(tx.inputs)) {
        const prevout = input.prevout;

        if (has(prevout.toRaw())) {
          const index = Number(j);

          this.logger.info('Filter hit: outpoint %s/%s', hex, index);

          const orecord = await this.getOutpointRecord(
            prevout.hash,
            prevout.index
          );

          if (!orecord) {
            this.logger.error('OutpointRecord not found for %s/%s',
              hex, index);
            continue;
          }

          for (const req of orecord.requests)
            satisfied.add(req);
        }
      }

      // check to see if any new outputs have been
      // created that are being included in the bloom filter
      for (const [j, output] of Object.entries(tx.outputs)) {
        const script = output.script;

        if (has(script.toRaw())) {
          const index = Number(j);

          this.logger.info('Filter hit: scriptPubKey %s', script.toASM());

          // get the script record to know
          // which request ids are interested
          // in this newly created output
          const srecord = await this.getScriptRecord(script.toRaw());

          if (!srecord) {
            this.logger.error('ScriptRecord not found for %s/%s',
              hex, index);
            continue;
          }

          for (const req of srecord.requests)
            satisfied.add(req);
        }
      }

      if (satisfied.size > 0) {
        // TODO: hex is currently
        // little endian tx hash
        this.emit('requests satisfied', {
          txid: hex,
          height: meta.height,
          satisfied: Array.from(satisfied)
        });
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

    if (!raw)
      return null;

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

  async hasRequest(id) {
    const key = layout.i.encode(id);
    return this.db.has(key);
  }

  /**
   * Add a Request to the database.
   * Indexes the Request along with creating
   * a OutpointRecord and/or a ScriptRecord.
   */

  async addRequest(request) {
    // make sure these writes are atomic
    if (!this.batch)
      this.start();

    const r = await this.putRequest(request);
    let orecord, srecord;

    // index the outpoint when it contains data
    if (!request.spends.isNull()) {
      orecord = OutpointRecord.fromOptions({
        prevout: {
          hash: request.spends.hash,
          index: request.spends.index
        },
        requests: [r.id]
      });

      this.logger.debug('Index orecord: %s/%s',
        request.spends.hash.toString('hex'), request.spends.index);

      await this.putOutpointRecord(orecord, r);
    }

    // index the script when it contains data
    if (!request.pays.raw.equals(Buffer.alloc(0))) {
      srecord = ScriptRecord.fromOptions({
        script: request.pays.raw,
        requests: [r.id]
      });

      this.logger.debug('Index srecord: %s',
        request.pays.raw.toString('hex'));

      await this.putScriptRecord(srecord, request);
    }

    await this.commit();

    return [r, orecord, srecord];
  }

  /**
   * Index Request
   * Must pass along request id
   */

  async putRequest(request) {
    const id = request.id;
    assert(typeof id === 'number');
    assert((id >>> 0) === id);

    const key = layout.i.encode(id);
    request.timestamp = util.now();

    if (this.batch)
      this.put(key, request.encode());
    else
      this.db.put(key, request.encode());

    return request;
  }

  /**
   * Delete Request
   */

  async deleteRequest(id) {
    assert(typeof id === 'number');
    assert((id >>> 0) === id);

    const key = layout.i.encode(id);

    if (this.batch)
      this.del(key);
    else
      this.db.del(key);
  }

  requestIterator() {
    return this.db.iterator({
      gte: layout.i.min(),
      lte: layout.i.max(),
      values: true
    });
  }

  async getLatestRequest() {
    return this.db.range({
      limit: 1,
      reverse: true,
      gte: layout.i.min(),
      lte: layout.i.max(),
      parse: (key, value) => {
        const [id] = layout.i.decode(key);
        return Request.decode(value, id);
      }
    });
  }

  /**
   * Get all ScriptRecords
   * TODO: get both keys and values,
   * pass hash as second arg to decode
   */

  async getScriptRecords() {
    return this.db.values({
      gte: layout.s.min(),
      lte: layout.s.max(),
      parse: data => ScriptRecord.decode(data)
    });
  }

  /**
   * Get ScriptRecord by raw script
   */

  async getScriptRecord(script) {
    if (typeof script === 'string') {
      if (script.startsWith('0x'))
        script = script.slice(2);

      script = Buffer.from(script, 'hex');
    }

    const hash = sha256.digest(script);
    const key = layout.s.encode(hash);

    const raw = await this.db.get(key);

    if (!raw)
      return null;

    return ScriptRecord.decode(raw, hash);
  }

  /**
   * Create an iterator over all
   * ScriptRecords in the database.
   */

  scriptRecordIterator() {
    return this.db.iterator({
      gte: layout.s.min(),
      lte: layout.s.max(),
      values: true
    });
  }

  /**
   * Put ScriptRecord in database.
   * @param {ScriptRecord} record
   */

  async putScriptRecord(srecord, request) {
    assert(srecord instanceof ScriptRecord);

    if (await this.hasScriptRecord(srecord)) {
      assert(request instanceof Request);
      assert((request.id >>> 0) === request.id);

      const r = await this.getScriptRecord(srecord.script);
      r.add(request.id);
      srecord = r;
    }

    const hash = sha256.digest(srecord.script);
    const key = layout.s.encode(hash);

    if (this.batch)
      this.put(key, srecord.encode());
    else
      await this.db.put(key, srecord.encode());

    return srecord;
  }

  async hasScriptRecord(record) {
    const hash = sha256.digest(record.script);
    const key = layout.s.encode(hash);
    return this.db.has(key);
  }

  async deleteScriptRecord(record) {
    const hash = sha256.digest(record.script);
    const key = layout.s.encode(hash);

    if (this.batch)
      this.del(key);
    else
      await this.db.del(key);
  }

  async getOutpointRecords() {
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
   * Get OutpointRecord
   */

  async getOutpointRecord(hash, index) {
    const key = layout.o.encode(hash, index);

    const raw = await this.db.get(key);

    if (!raw)
      return null;

    return OutpointRecord.decode(raw, {
      hash: hash,
      index: index
    });
  }

  /**
   * Create an iterator for all outpoint records.
   */

  outpointRecordIterator() {
    return this.db.iterator({
      gte: layout.o.min(),
      lte: layout.o.max(),
      values: true
    });
  }

  /**
   * Put outpoint record in database.
   * If the record already exists, add
   * the request id to it.
   *
   * TODO: refactor so that it accepts an
   * outpoint instead of an orecord
   */

  async putOutpointRecord(orecord, request) {
    assert(orecord instanceof OutpointRecord);

    if (await this.hasOutpointRecord(orecord)) {
      assert(request instanceof Request);
      assert((request.id >>> 0) === request.id);

      const r = await this.getOutpointRecord({
        hash: orecord.prevout.hash,
        index: orecord.prevout.index
      });
      r.add(request.id);
      orecord = r;
    }

    const {hash, index} = orecord.prevout;
    const key = layout.o.encode(hash, index);

    if (this.batch)
      this.put(key, orecord.encode());
    else
      await this.db.put(key, orecord.encode());

    return orecord;
  }

  async hasOutpointRecord(record) {
    const {hash, index} = record.prevout;
    const key = layout.o.encode(hash, index);
    return this.db.has(key);
  }

  async deleteOutpointRecord(record) {
    const {hash, index} = record.prevout;
    const key = layout.o.encode(hash, index);

    if (this.batch)
      this.del(key);
    else
      this.db.del(key);
  }

  /**
   * Wipe the RelayIndexer
   * @returns {Promise}
   */

  async wipe() {
    this.logger.warning('Wiping RelayIndexer');

    const iter = this.db.iterator();
    const b = this.db.batch();

    let total = 0;

    await iter.each((key) => {
      switch (key[0]) {
        case 0x73: // s
        case 0x6f: // o
        case 0x69: // i
          b.del(key);
          total += 1;
          break;
      }
    });

    this.logger.warning('Wiped %d records.', total);

    return b.write();
  }
}

module.exports = RelayIndexer;
