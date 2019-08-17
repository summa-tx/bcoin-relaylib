/**
 * relay for bcoin
 */

'use strict';

const AsyncEmitter = require('bevent');
const RelayDB = require('./relaydb');
const {Lock} = require('bmutex');
const LRU = require('blru');
const {BufferMap} = require('buffer-map');
const BN = require('bcrypto/lib/bn.js');

class Relay extends AsyncEmitter {
  constructor(options) {
    super();

    this.options = options;
    this.logger = this.options.logger.context('relay');
    this.writeLock = new Lock();

    const cacheSize = this.options.cacheSize || 100;
    this.workCache = new LRU(cacheSize, null, BufferMap);
    this.chain = options.chain;
    this.db = new RelayDB(this.options);
  }

  async open() {
    this.workCache.start();
    await this.db.open();
  }

  /**
   * Get work by block hash or height.
   * @param {String|Buffer|Number} block
   * @returns {BN}
   */
  async getWork(block) {
    if (typeof block === 'string')
      block = Buffer.from(block, 'hex');

    const entry = await this.chain.getEntry(block);

    if (!entry)
      return null;

    const cache = this.workCache.get(entry.hash);

    if (cache)
      return cache;

    const work = entry.getProof();
    this.workCache.set(entry.hash, work);

    return work;
  }

  /**
   * Get work by a range of block heights.
   * @param {Number} start
   * @param {Number} end
   * @returns {BN}
   */
  async getWorkByRange(start, end) {
    assert(typeof start === 'number');
    assert(typeof end === 'number')
    assert(start <= end);

    let total = new BN(0);

    for (let i = start; i <= end; i++) {
      const work = await this.getWork(i);

      if (!work)
        throw new Error(`Cannot find work for block ${i}`);

      total.iadd(work);
    }

    return total;
  }

  /*
   * Rescan the chain from a height.
   */

  // create a bloom filter from items in the relay
  // index and then call chain.scan
  async rescan(height) {

  }

  async getOutpoints() {
    return this.db.getOutpoints();
  }

  /**
   * TODO: i don't love the event emitting here
   */

  async putOutpoint(outpoint) {
    const unlock = await this.writeLock.lock();
    try {
      await this._putOutpoint(outpoint);
      this.emit('put outpoint', outpoint);
      return true;
    } catch (e) {
      this.logger.error(e);
      this.emit('delete outpoint', outpoint);
      return false;
    } finally {
      unlock();
    }
  }

  async _putOutpoint(outpoint) {
    return this.db.putOutpoint(outpoint);
  }

  async hasOutpoint(outpoint) {
    return this.db.hasOutpoint(outpoint);
  }

  async getScripts() {
    return this.db.getScripts();
  }

  /**
   * TODO: i don't love the event emitting here
   */

  async putScript(script) {
    const unlock = await this.writeLock.lock();
    try {
      await this._putScript(script);
      this.emit('put script')
      return true;
    } catch (e) {
      this.logger.error(e);
      this.emit('delete script', script);
      return false;
    } finally {
      unlock();
    }
  }

  async _putScript(script) {
    return this.db.putScript(script);
  }

  async hasScript(script) {
    return this.db.hasScript(script);
  }
}

module.exports = Relay;
