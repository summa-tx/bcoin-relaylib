/**
 * relay for bcoin
 */

'use strict';

const AsyncEmitter = require('bevent');
const assert = require('assert');
const {Lock} = require('bmutex');
const LRU = require('blru');
const BN = require('bcrypto/lib/bn.js');
const Logger = require('blgr');
const RelayIndexer = require('./indexer');
const {BloomFilter} = require('bfilter');
const layout = require('./layout');

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
      filter: this.filter
    });
  }

  // TODO: be sure about logic when restarting and chain continued
  async open() {
    await this.indexer.open();
    await this.watch();
  }

  /**
   * Populate filter with outpoints and scriptPubKeys.
   * @returns {Promise}
   */

  async watch() {
    const siter = this.indexer.scriptIterator();

    let records = 0;

    await siter.each((key, value) => {
      const record = ScriptRecord.decode(value);

      this.filter.add(record.script);

      records += 1;
    });

    this.logger.info('Added %d records to Relay filter.', records);

    const oiter = this.indexer.outpointIterator();

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
   *
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
   *
   */

  async _putRequest(request) {
    return this.indexer.putRequest(request);
  }


  /**
   * Get all Outpoints.
   */

  async getOutpoints() {
    return this.indexer.getOutpoints();
  }

  /**
   * Index Outpoint with a lock
   */

  async putOutpoint(outpoint) {
    const unlock = await this.writeLock.lock();
    try {
      return await this._putOutpoint(outpoint);
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

  async _putOutpoint(outpoint) {
    return this.indexer.putOutpoint(outpoint);
  }

  /**
   * Test for Outpoint indexed.
   */

  async hasOutpoint(outpoint) {
    return this.indexer.hasOutpoint(outpoint);
  }

  /**
   * Get all scriptPubKeys.
   */

  async getScripts() {
    return this.indexer.getScripts();
  }

  /**
   * Index Script with lock. This
   * is called when a Request is being
   * indexed.
   */

  async putScript(script) {
    const unlock = await this.writeLock.lock();
    try {
      return await this._putScript(script);
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

  async _putScript(script) {
    return this.indexer.putScript(script);
  }

  /**
   *
   */

  async hasScript(script) {
    return this.indexer.hasScript(script);
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

    assert(options.blocks)
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
