const bio = require('bufio');
const {Outpoint, Script} = require('bcoin');
const consensus = require('bcoin/lib/protocol/consensus');
const assert = require('bsert');

const NULL_160 = Buffer.alloc(20);

/**
 * Request
 * Uses Script and Outpoint classes for validation
 */

class Request extends bio.Struct {
  constructor(options) {
    super();

    this.id = null;
    this.address = NULL_160;
    this.value = 0;
    this.spends = new Outpoint();
    this.pays = new Script();

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    if (typeof options.id === 'number') {
      assert((options.id >>> 0) === options.id, 'id must be a uint32');
      this.id = options.id;
    }

    // ethereum address
    if (options.address) {
      assert(Buffer.isBuffer(options.address));
      this.address = options.address
    }

    if (options.value) {
      assert(Number.isSafeInteger(options.value) && options.value >= 0,
        'Value must be a uint64.');
      this.value = options.value;
    }

    // outpoint
    if (options.spends) {
      const spends = options.spends;
      assert(typeof spends.index === 'number');
      assert(Buffer.isBuffer(spends.hash));

      this.spends = Outpoint.fromOptions({
        hash: spends.hash,
        index: spends.index,
      });
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

    bw.writeVarBytes(this.pays.toRaw());

    return bw;
  }

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

module.exports = Request;
