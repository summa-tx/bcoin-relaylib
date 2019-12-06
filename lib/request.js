/*!
 * request.js - Chain Introspection request for bcoin-relaylib
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
const {Outpoint, Script} = require('bcoin');
const consensus = require('bcoin/lib/protocol/consensus');
const assert = require('bsert');
const util = require('bcoin/lib/utils/util');

const NULL_256 = Buffer.alloc(32);
const NULL_160 = Buffer.alloc(20);

/**
 * Request
 * Uses Script and Outpoint classes for validation
 */

class Request extends bio.Struct {
  constructor(options) {
    super();

    this.id = NULL_256;
    this.address = NULL_160;
    this.value = 0;
    this.spends = new Outpoint();
    this.pays = new Script();
    this.timestamp = 0;

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    if (options.id) {
      assert(Buffer.isBuffer(options.id));
      assert(options.id.length === 32);
      this.id = options.id;
    }

    // ethereum address
    if (options.address) {
      assert(Buffer.isBuffer(options.address));
      this.address = options.address;
    }

    if (options.value) {
      assert(Number.isSafeInteger(options.value) && options.value >= 0,
        'Value must be a uint64.');
      this.value = options.value;
    }

    // outpoint
    if (options.spends) {
      if (
        typeof options.spends === 'object'
          && options.spends.hash
          && typeof options.spends.index === 'number'
      ) {
        const spends = options.spends;
        assert((spends.index >>> 0) === spends.index);
        assert(Buffer.isBuffer(spends.hash));

        this.spends = Outpoint.fromOptions({
          hash: spends.hash,
          index: spends.index
        });
      }
    }

    // scriptPubKey
    if (options.pays) {
      assert(Buffer.isBuffer(options.pays));
      assert(options.pays.length <= consensus.MAX_SCRIPT_SIZE);
      this.pays = Script.fromRaw(options.pays);
    }

    return this;
  }

  /**
   * Invoked by bio.Struct.decode
   */

  read(br, id) {
    this.id = id;
    this.address = br.readBytes(20);
    this.value = br.readU64();

    const hash = br.readHash();
    const index = br.readU32();

    this.spends = Outpoint.fromOptions({
      hash: hash,
      index: index
    });

    this.timestamp = br.readU32();

    const script = br.readVarBytes();
    assert(script.length <= consensus.MAX_SCRIPT_SIZE);

    this.pays = Script.fromRaw(script);

    return this;
  }

  /**
   * Invoked by bio.Struct.encode
   */

  write(bw) {
    bw.writeBytes(this.address);
    bw.writeU64(this.value);

    bw.writeHash(this.spends.hash);
    bw.writeU32(this.spends.index);

    bw.writeU32(this.timestamp);

    bw.writeVarBytes(this.pays.toRaw());

    return bw;
  }

  getJSON() {
    return {
      id: this.id.toString('hex'),
      address: this.address.toString('hex'),
      value: this.value,
      spends: {
        hash: util.revHex(this.spends.hash),
        index: this.spends.index
      },
      pays: this.pays.toJSON(),
      timestamp: util.date(this.timestamp)
    };
  }

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

module.exports = Request;
