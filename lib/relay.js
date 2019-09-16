/*!
 * relay.js - Relay for bcoin
 * Copyright (c) 2019, James Prestwich (Apache-2.0 License).
 * Copyright (c) 2019, Mark Tyneway (Apache-2.0 License).
 * https://github.com/summa-tx/bcoin-relaylib
 */

'use strict';

const AsyncEmitter = require('bevent');
const assert = require('assert');
const {Lock} = require('bmutex');
const {Outpoint} = require('bcoin');
const Logger = require('blgr');
const RelayIndexer = require('./indexer');
const {ScriptRecord} = require('./records');
const {BloomFilter} = require('bfilter');
const {BufferSet} = require('buffer-map');
const layout = require('./layout');

/**
 * Relay for bcoin. Manages a RelayIndexer.
 */

class Relay extends AsyncEmitter {
  constructor(options) {
    super();

    this.options = new RelayOptions(options);
    this.logger = this.options.logger.context('relay');
    this.chain = this.options.chain;
    this.network = this.options.network;

    this.writeLock = new Lock();

    this.filter = BloomFilter.fromRate(20000, 0.001, BloomFilter.flags.ALL);

    this.indexer = new RelayIndexer({
      chain: this.chain,
      network: this.network,
      logger: this.logger,
      blocks: this.options.blocks,
      memory: this.options.memory,
      prefix: this.options.prefix,
      has: item => this.filter.test(item)
    });
  }

  // TODO: be sure about logic when restarting
  async open() {
    this.listen();
    await this.indexer.open();
    await this.watch();
  }

  /**
   * Set up listeners on the indexer
   */

  listen() {
    this.indexer.on('output consumed', (data) => {
      this.emit('output consumed', data);
    });

    this.indexer.on('output created', (data) => {
      this.emit('output created', data);
    });
  }

  /**
   * Handle graceful shutdown.
   */

  async close() {
    await this.indexer.close();
  }

  /**
   * Populate filter with outpoints and scriptPubKeys.
   * This should be invoked on start and fill the
   * bloom filter with all indexed outpoints and
   * scriptPubKeys.
   * @returns {Promise}
   */

  async watch() {
    const siter = this.indexer.scriptRecordIterator();

    let records = 0;

    await siter.each((key, value) => {
      const record = ScriptRecord.decode(value);

      this.filter.add(record.script);

      records += 1;
    });

    this.logger.info('Added %d records to Relay filter.', records);

    const oiter = this.indexer.outpointRecordIterator();

    let outpoints = 0;

    await oiter.each((key) => {
      const [hash, index] = layout.o.decode(key);
      const outpoint = new Outpoint(hash, index);
      const data = outpoint.toRaw();

      this.filter.add(data);

      outpoints += 1;
    });

    this.logger.info('Added %d outpoints to Relay filter.', outpoints);
  }

  /**
   * Index Request in database and create
   * OutpointRecord and/or ScriptRecord
   * with a lock. This is the preferred
   * means to indexing a Request.
   */

  async addRequest(request) {
    const unlock = await this.writeLock.lock();
    try {
      const records = await this._addRequest(request);

      // A Request must have 1 or both of an outpoint
      // and a scriptPubKey. To make sure that the
      // chain state is always properly reflected in
      // the database, do a rescan after adding a
      // Request. After the rescan is complete, add
      // the outpoint/scriptPubKey to the bloom filter
      // to be tested against future blocks.

      const [, orecord, srecord] = records;

      const items = new BufferSet();

      if (orecord) {
        const outpoint = Outpoint.fromOptions(orecord.prevout);
        const item = outpoint.toKey();
        items.add(item);
      }

      if (srecord)
        items.add(srecord.script);

      // TODO: rescan logic
      if (items.size) {
        // this.rescan()

        for (const item of items)
          this.filter.add(item);
      }

      return records;
    } catch (e) {
      this.emit('error', e);
      return null;
    } finally {
      unlock();
    }
  }

  /**
   * Index Request to database without a lock.
   */

  async _addRequest(request) {
    return this.indexer.addRequest(request);
  }

  /**
   * Index a Request with a lock.
   */

  async putRequest(request) {
    const unlock = await this.writeLock.lock();
    try {
      return await this._putRequest(request);
    } catch (e) {
      this.emit('error', e);
      return null;
    } finally {
      unlock();
    }
  }

  /**
   * Index a Request without a lock.
   */

  async _putRequest(request) {
    return this.indexer.putRequest(request);
  }

  /**
   *
   */

  async getRequest(id) {
    return this.indexer.getRequest(id);
  }

  /**
   * Get all OutpointRecords.
   */

  async getOutpointRecords() {
    return this.indexer.getOutpointRecords();
  }

  /**
   * Index Outpoint with a lock.
   */

  async putOutpointRecord(outpoint) {
    const unlock = await this.writeLock.lock();
    try {
      return await this._putOutpointRecord(outpoint);
    } catch (e) {
      this.emit('error', e);
      return null;
    } finally {
      unlock();
    }
  }

  /**
   * Index Outpoint without a lock.
   * This is called when a Request
   * is being indexed or when a matching
   * scriptPubKey is found on chain.
   */

  async _putOutpointRecord(outpoint) {
    return this.indexer.putOutpointRecord(outpoint);
  }

  /**
   * Get OutpointRecord
   */

  getOutpointRecord(hash, index) {
    return this.indexer.getOutpointRecord(hash, index);
  }

  /**
   * Test for Outpoint indexed.
   */

  async hasOutpointRecord(outpoint) {
    return this.indexer.hasOutpointRecord(outpoint);
  }

  /**
   * Get all scriptPubKeys.
   */

  async getScriptRecords() {
    return this.indexer.getScriptRecords();
  }

  /**
   *
   */

  async getScriptRecord(script) {
    return this.indexer.getScriptRecord(script);
  }

  /**
   * Index Script with lock. This
   * is called when a Request is being
   * indexed.
   */

  async putScriptRecord(script) {
    const unlock = await this.writeLock.lock();
    try {
      return await this._putScriptRecord(script);
    } catch (e) {
      this.emit('error', e);
      return null;
    } finally {
      unlock();
    }
  }

  /**
   *
   */

  async _putScriptRecord(script) {
    return this.indexer.putScriptRecord(script);
  }

  /**
   *
   */

  async hasScriptRecord(script) {
    return this.indexer.hasScriptRecord(script);
  }
}

/**
 * Relay Options
 */

class RelayOptions {
  constructor(options) {
    this.network = null;
    this.blocks = null;
    this.chain = null;
    this.memory = false;
    this.prefix = null;
    this.logger = new Logger();

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    assert(options.spv !== true, 'Cannot run in spv mode.');
    assert(options.pruned !== true, 'Cannot run in pruned mode.');
    assert(options.txindex !== true, 'Cannot run without tx-index.');

    assert(options.network);
    this.network = options.network;

    assert(options.blocks);
    this.blocks = options.blocks;

    assert(options.chain);
    this.chain = options.chain;

    if (typeof options.memory === 'boolean')
      this.memory = options.memory;

    assert(options.prefix);
    this.prefix = options.prefix;

    if (options.logger)
      this.logger = options.logger;

    return this;
  }
}

module.exports = Relay;
