/*!
 * records.js - database records for bcoin-relaylib
 * Copyright (c) 2019, Mark Tyneway (Apache-2.0 License).
 * https://github.com/summa-tx/bcoin-relaylib
 *
 * This software is based on bcoin
 * https://github.com/bcoin-org/bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * Copyright (c) 2017-2019, bcoin developers (MIT License).
 */

'use strict';

const bio = require('bufio');
const sha256 = require('bcrypto/lib/sha256');
const assert = require('bsert');
const util = require('./util');

/**
 * Records for the database.
 * Each have a fromOptions and a fromJSON
 * constructor method. fromOptions expects
 * buffers while fromJSON expects strings.
 */

const ZERO_HASH = Buffer.alloc(32);
const NULL = Buffer.alloc(0);

/**
 * Script Record.
 * Stored in database as script hash
 * to script record. Maintain a list
 * of request id's as well as the raw
 * script itself
 */

class ScriptRecord extends bio.Struct {
  constructor(options) {
    super();

    this.hash = ZERO_HASH;
    this.requests = [];
    this.script = NULL;

    if (options)
      this.fromOptions(options);
  }

  getSize() {
    let size = 0;

    // number of requests stored in u32
    size += 4;

    // each request is 4 bytes
    // eslint-disable-next-line no-unused-vars
    for (const _ of this.requests)
      size += 4;

    // script var int size
    size += bio.encoding.sizeVarint(this.script.length);
    size += this.script.length;

    return size;
  }

  read(br, hash) {
    const count = br.readU32();
    for (let i = 0; i < count; i++)
      this.requests.push(br.readU32());

    this.script = br.readVarBytes();

    if (!hash)
      hash = sha256.digest(this.script);

    this.hash = hash;

    return br;
  }

  write(bw) {
    bw.writeU32(this.requests.length);

    for (const request of this.requests)
      bw.writeU32(request);

    bw.writeVarBytes(this.script);

    return bw;
  }

  add(id) {
    this.requests.push(id);
    return this;
  }

  fromOptions(options) {
    assert(Array.isArray(options.requests));
    assert(Buffer.isBuffer(options.script));

    let hash = options.hash;
    if (!Buffer.isBuffer(hash))
      hash = sha256.digest(options.script);

    this.hash = hash;

    for (const request of options.requests) {
      assert((request >>> 0) === request);
      this.requests.push(request);
    }

    this.script = options.script;

    return this;
  }

  fromJSON(json) {
    assert(Array.isArray(json.requests));
    assert(typeof json.script === 'string');

    // bcoin uses 0x prefix on strings for scripts
    if (json.script.startsWith('0x'))
      json.script = json.script.slice(2);

    let hash = json.hash;
    if (typeof hash !== 'string')
      hash = sha256.digest(Buffer.from(json.script, 'hex'));

    this.hash = Buffer.from(hash, 'hex');

    for (const request of json.requests) {
      assert((request >>> 0) === request);
      this.requests.push(request);
    }

    this.script = Buffer.from(json.script, 'hex');

    return this;
  }

  getJSON() {
    return {
      hash: this.hash.toString('hex'),
      requests: this.requests,
      script: '0x' + this.script.toString('hex')
    };
  }

  static fromJSON(json) {
    return new this().fromJSON(json);
  }

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

/**
 * OutpointRecord
 * TODO: add isSpent method that checks nextout
 */

class OutpointRecord extends bio.Struct {
  constructor(options) {
    super();

    this.prevout = {hash: ZERO_HASH, index: 0},
    this.nextout = {hash: ZERO_HASH, index: 0},
    this.requests = [];

    if (options)
      this.fromOptions(options);
  }

  read(br, outpoint) {
    this.nextout = {
      hash: br.readHash(),
      index: br.readU32()
    };

    const count = br.readU32();
    for (let i = 0; i < count; i++)
      this.requests.push(br.readU32());

    this.prevout = {
      hash: outpoint.hash,
      index: outpoint.index
    };

    return br;
  }

  getSize() {
    let size = 0;

    size += 32;
    size += 4;

    size += 4;

    // eslint-disable-next-line no-unused-vars
    for (const _ of this.requests)
      size += 4;

    return size;
  }

  write(bw) {
    bw.writeHash(this.nextout.hash);
    bw.writeU32(this.nextout.index);

    bw.writeU32(this.requests.length);
    for (const request of this.requests)
      bw.writeU32(request);

    return bw;
  }

  add(id) {
    this.requests.push(id);
    return this;
  }

  fromOptions(options) {
    assert(options.prevout);
    assert(Buffer.isBuffer(options.prevout.hash));
    assert(typeof options.prevout.index === 'number');
    assert(Array.isArray(options.requests));

    this.prevout.hash = options.prevout.hash;
    this.prevout.index = options.prevout.index;

    for (const request of options.requests) {
      assert((request >>> 0) === request);
      this.requests.push(request);
    }

    if (options.nextout) {
      assert(Buffer.isBuffer(options.nextout.hash));
      assert(typeof options.nextout.index === 'number');

      this.nextout.hash = options.nextout.hash;
      this.nextout.index = options.nextout.index;
    }

    return this;
  }

  fromJSON(json) {
    assert(json.prevout);
    assert(typeof json.prevout.hash === 'string');
    assert(typeof json.prevout.index === 'number');
    assert(Array.isArray(json.requests));

    this.prevout.hash = util.fromRev(json.prevout.hash);
    this.prevout.index = json.prevout.index;

    for (const request of json.requests) {
      assert((request >>> 0) === request);
      this.requests.push(request);
    }

    if (json.nextout) {
      assert(typeof json.nextout.hash === 'string');
      assert(typeof json.nextout.index === 'number');

      this.nextout.hash = util.fromRev(json.nextout.hash);
      this.nextout.index = json.nextout.index;
    }

    return this;
  }

  getJSON() {
    return {
      nextout: {
        hash: util.revHex(this.nextout.hash),
        index: this.nextout.index
      },
      prevout: {
        hash: util.revHex(this.prevout.hash),
        index: this.prevout.index
      },
      requests: this.requests
    };
  }

  static fromJSON(json) {
    return new this().fromJSON(json);
  }

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

module.exports.ScriptRecord = ScriptRecord;
module.exports.OutpointRecord = OutpointRecord;
