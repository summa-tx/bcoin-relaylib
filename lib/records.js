const bio = require('bufio');
const sha256 = require('bcrypto/lib/sha256');
const assert = require('bsert');

/**
 * Records for the database.
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
  constructor() {
    super();

    this.hash = ZERO_HASH;
    this.requests = [];
    this.script = NULL;
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

  fromScript() {
    ;
  }

  toScript() {
    ;
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
}

/**
 * OutpointRecord
 *
 * TODO: add isSpent method that checks nextout
 */

class OutpointRecord extends bio.Struct {
  constructor() {
    super();

    this.prevout = {hash: ZERO_HASH, index: 0},
    this.nextout = {hash: ZERO_HASH, index: 0},
    this.requests = [];

  }

  read(br, outpoint) {
    this.nextout = {
      hash: br.readHash(),
      index: br.readU32()
    }

    const count = br.readU32();
    for (let i = 0; i < count; i++)
      this.requests.push(br.readU32());

    this.prevout = {
      hash: outpoint.hash,
      index: outpoint.index
    }

    return br;
  }

  write(bw) {
    bw.writeHash(this.nextout.hash);
    bw.writeU32(this.nextout.index);

    bw.writeU32(this.requests.length);
    for (const request of this.requests)
      bw.writeU32(request);

    return bw;
  }

  fromOutpoint() {
    ;
  }

  toOutpoint() {
    ;
  }

  fromJSON(json) {
    assert(json.prevout);
    assert(typeof json.prevout.hash === 'string');
    assert(typeof json.prevout.index === 'number');
    assert(Array.isArray(json.requests));

    this.prevout.hash = Buffer.from(json.prevout.hash, 'hex');
    this.prevout.index = json.prevout.index;

    for (const request of json.requests) {
      assert((request >>> 0) === request);
      this.requests.push(request);
    }

    if (json.nextout) {
      assert(typeof json.nextout.hash === 'string');
      assert(typeof json.nextout.index === 'number');

      this.nextout.hash = Buffer.from(json.nextout.hash, 'hex');
      this.nextout.index = json.nextout.index;
    }

    return this;
  }

  getJSON() {
    return {
      nextout: {
        hash: this.nextout.hash.toString('hex'),
        index: this.nextout.index,
      },
      prevout: {
        hash: this.prevout.hash.toString('hex'),
        index: this.prevout.index
      },
      requests: this.requests
    };
  }

  static fromJSON(json) {
    return new this().fromJSON(json);
  }
}

module.exports.ScriptRecord = ScriptRecord;
module.exports.OutpointRecord = OutpointRecord;
