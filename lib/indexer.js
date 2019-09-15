
const bdb = require('bdb');
const Indexer = require('bcoin/lib/indexer/indexer');
const layout = require('./layout');
const {ScriptRecord, OutpointRecord} = require('./records')
const Request = require('./request');
const sha256 = require('bcrypto/lib/sha256');
const {BloomFilter} = require('bfilter');
const Logger = require('blgr');
const assert = require('bsert');

/**
 * RelayIndexer
 * Returns serialized data, not raw data
 */

class RelayIndexer extends Indexer {
  constructor(options) {
    super('relay', options);

    assert(options.has && typeof options.has == 'function');
    this.has = options.has;

    this.requests = 0;
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

  /**
   * Called every time that a block is connected
   * to the chain. The block is known to be valid
   * and is extending the main chain.
   */

  async indexBlock(meta, block, view) {
    for (let i = 0; i < block.txs.length; i++) {
      const tx = block.txs[i];
      const txid = tx.txid();

      // check to see if any prevouts have been consumed
      // that are included in the bloom filter
      for (const [j, input] of Object.entries(tx.inputs)) {
        const prevout = input.prevout;
        if (this.has(prevout.toRaw())) {
          const index = j;

          this.logger.info('Filter hit: outpoint %s/%s',
            txid.toString('hex'), index)

          const orecord = await this.getOutpoint({
            hash: prevout.hash,
            index: prevout.index
          });

          if (!orecord) {
            this.logger.error('OutpointRecord not found for %s/%s',
              txid.toString('hex'), index);
            continue;
          }

          const requests = [];

          for (const id of orecord.requests) {
            const request = await this.getRequest(id);
            requests.push(request.toJSON());
          }

          this.emit('output consumed', {
            block: block,
            requests: requests,
            outpoint: orecord.toJSON()
          });
        }
      }

      // check to see if any new outputs have been
      // created that are being included in the bloom filter
      for (const [j, output] of Object.entries(tx.outputs)) {
        const script = output.script;

        if (this.has(script.toRaw())) {
          const index = j;

          this.logger.info('Filter hit: scriptPubKey %s', script.toASM());

          // get the script record to know
          // which request ids are interested
          // in this newly created output
          const srecord = await this.getScript({
            script: script.toRaw()
          });

          if (!srecord) {
            this.logger.error('ScriptRecord not found for %s/%s',
              txid.toString('hex'), index);
            continue;
          }

          // create a new outpoint record with
          // no nextout field to indicate that
          // it has not been spent yet
          const orecord = OutpointRecord.fromJSON({
            prevout: {
              hash: txid,
              index: index,
            },
            requests: srecord.requests
          });

          if (!orecord) {
            this.logger.error('OutpointRecord not found for %s/%s',
              txid.toString('hex'), index);
            continue;
          }

          await this.putOutpoint(orecord);

          const requests = [];

          for (const id of srecord.requests) {
            const request = await this.getRequest(id);
            requests.push(request.toJSON());
          }

          this.emit('output created', {
            block: block,
            requests: requests,
            script: srecord.toJSON(),
            outpoint: orecord.toJSON()
          });
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

      await this.putOutpoint(orecord, r);
    }

    // index the script when it contains data
    if (!request.pays.raw.equals(Buffer.alloc(0))) {
      srecord = ScriptRecord.fromOptions({
        script: request.pays.raw,
        requests: [r.id]
      });

      this.logger.debug('Index srecord: %s',
        request.pays.raw.toString('hex'));

      await this.putScript(srecord);
    }

    await this.commit();

    return [r, orecord, srecord];
  }

  /**
   * Index Request
   */

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

  async putScript(srecord, request) {
    assert(srecord instanceof ScriptRecord);

    if (await this.hasScript(srecord)) {
      assert(request instanceof Request);
      assert((request.id >>> 0) === request.id);

      const r = await this.getScript(srecord);
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
   * Get OutpointRecord
   */

  async getOutpoint(hash, index) {
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
   * If the record already exists, add
   * the request id to it.
   *
   * TODO: refactor so that it accepts an
   * outpoint instead of an orecord
   */

  async putOutpoint(orecord, request) {
    assert(orecord instanceof OutpointRecord);

    if (await this.hasOutpoint(orecord)) {
      assert(request instanceof Request);
      assert((request.id >>> 0) === request.id);

      const r = await this.getOutpoint({
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

module.exports = RelayIndexer;
