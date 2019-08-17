'use strict';

const RelayDB = require('../lib/relaydb');
const {Script, Outpoint} = require('bcoin');
const logger = require('blgr');
const assert = require('bsert');

describe('RelayDB', function () {
  let db;

  before(async () => {
    db = new RelayDB({
      memory: true
    });

    await db.open();
  });

  it('should insert a script by its sha256', async () => {
    const hex = '0xa914009dce84f5581f41bb3f5ee23909d87fa7924d4687';
    const script = Script.fromString(hex);

    assert(!await db.hasScript(script));

    await db.putScript(script);
    assert(await db.hasScript(script));

    // clear db for next test
    await db.deleteScript(script);
    assert(!await db.hasScript(script));
  });

  it('should get all scripts', async () => {
    const hexes = [
      '0x0014eb945cf9f30663539fd85af8fafcbc656b1c352b',
      '0x76a9144c8c7ba9495a1b079003188f0ec4e172be23641088ac',
      '0xa9144687822239e9b03cfb0875a708bbd52f2c64cedd87',
      '0x76a914698fa40f815c7f8e899cf94bf85c48c1993023ce88ac'
    ];

    for (const hex of hexes) {
      const script = Script.fromString(hex);
      await db.putScript(script);
    }

    const scripts = await db.getScripts();

    // same number of scripts
    assert.equal(hexes.length, scripts.length);

    // scripts recovered correctly
    for (const script of scripts) {
      const hex = '0x' + script.toRaw().toString('hex');
      assert(hexes.includes(hex));
    }
  });

  it('should index an outpoint', async () => {
    const txid = '959a26dfd3078f4708e304fd00b1a996bca4b39f0acb62a0a7c63a117c2c13e7';

    const outpoint = Outpoint.fromJSON({
      hash: txid,
      index: 0
    });

    assert(!await db.hasOutpoint(outpoint));

    await db.putOutpoint(outpoint);
    assert(await db.hasOutpoint(outpoint));

    await db.deleteOutpoint(outpoint);
    assert(!await db.hasOutpoint(outpoint));
  });

  it('should get all outpoints', async () => {
    // big endian txids from blocksteam.info
    const json = [
      ['4870d78bfdc31b6b6d3f046c66c0e036762d2938574ce41a135be8a2985e0629', 0],
      ['0eb660e3573e66b4db21d3a5e310ecdfe0ad34eb8f395daf915b8e51de1b213f', 1],
      ['2888fb96f2a1518d4f4c4205d71765d2b76c8305e200c17e23e59e3e5f69cc4e', 1],
      ['e1dcfa55c8c43859fb6c261589f93db5156778a1e1faa8d476214b3e21b3556a', 2],
    ];

    for (const [txid, index] of json) {
      // fromJSON expects big endian
      const outpoint = Outpoint.fromJSON({
        hash: txid,
        index: index
      });

      await db.putOutpoint(outpoint);
    }

    const outpoints = await db.getOutpoints();

    assert(json.length, outpoints.length);

    // json is sorted correctly above to allow
    // index based comparison to work
    for (const [i, outpoint] of outpoints.entries()) {
      const {hash, index} = outpoint.toJSON();
      assert.deepEqual(json[i], [hash, index]);
    }
  });
});
