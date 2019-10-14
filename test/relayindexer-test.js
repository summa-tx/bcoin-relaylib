/**
 * relayindexer test
 */

'use strict';

const RelayIndexer = require('../lib/indexer');
const {Network} = require('bcoin');
const BlockStore = require('bcoin/lib/blockstore/level');
const Chain = require('bcoin/lib/blockchain/chain');
const WorkerPool = require('bcoin/lib/workers/workerpool');
const {ScriptRecord, OutpointRecord} = require('../lib/records');
const Request = require('../lib/request');
const Logger = require('blgr');
const assert = require('bsert');
const random = require('bcrypto/lib/random');

// TODO: afterEach step for clearing db
describe('RelayIndexer', function () {
  let indexer, workers, chain, blocks;

  const logger = new Logger();

  before(async () => {
    const network = Network.get('regtest');

    // flat file block storage
    blocks = new BlockStore({
      memory: true,
      network
    });

    // multiprocessing
    workers = new WorkerPool({
      enabled: true,
      size: 2
    });

    // chain object
    chain = new Chain({
      memory: true,
      network,
      workers,
      blocks
    });

    // indexer object
    indexer = new RelayIndexer({
      logger: logger,
      blocks: blocks,
      chain: chain,
      memory: true,
      has: () => {}
    });

    await logger.open();
    await blocks.open();
    await chain.open();
    await indexer.open();
    await workers.open();
  });

  after(async () => {
    await workers.close();
    await blocks.close();
    await chain.close();
    await indexer.close();
  });

  it('should insert/delete/has a script record', async () => {
    const hex = '0xa914009dce84f5581f41bb3f5ee23909d87fa7924d4687';

    const record = ScriptRecord.fromJSON({
      script: hex,
      requests: [1, 2, 3]
    });

    assert(!await indexer.hasScriptRecord(record));

    await indexer.putScriptRecord(record);

    assert(await indexer.hasScriptRecord(record));

    // clear db for next test
    await indexer.deleteScriptRecord(record);

    assert(!await indexer.hasScriptRecord(record));
  });

  it('should reserialize a script record after db read/write', async () => {
    const hex = '0x76a91444dd2332e6ecfb4a1e77f49ef130d41fe820867188ac';

    const record = ScriptRecord.fromJSON({
      script: hex,
      requests: [7, 11, 666]
    });

    await indexer.putScriptRecord(record);

    const script = await indexer.getScriptRecord(hex);

    assert.deepEqual(record.toJSON(), script.toJSON());

    await indexer.deleteScriptRecord(record);
  });

  it('should batch write and get all scripts', async () => {
    // start a database transaction
    indexer.start();

    const hexes = [
      '0x0014eb945cf9f30663539fd85af8fafcbc656b1c352b',
      '0x76a9144c8c7ba9495a1b079003188f0ec4e172be23641088ac',
      '0xa9144687822239e9b03cfb0875a708bbd52f2c64cedd87',
      '0x76a914698fa40f815c7f8e899cf94bf85c48c1993023ce88ac'
    ];

    for (const hex of hexes) {
      const record = ScriptRecord.fromJSON({
        script: hex,
        requests: [random.randomRange(0, 2e8)]
      });

      await indexer.putScriptRecord(record);
    }

    await indexer.commit();

    const records = await indexer.getScriptRecords();

    // same number of scripts
    assert.equal(hexes.length, records.length);

    // scripts recovered correctly
    for (const record of records) {
      const json = record.toJSON();
      const hex = json.script;
      assert(hexes.includes(hex));

      // clear db
      await indexer.deleteScriptRecord(record);
    }
  });

  it('should index an outpoint', async () => {
    const txid = '959a26dfd3078f4708e304fd00b1a996bca4b39f0acb62a0a7c63a117c2c13e7';

    const record = OutpointRecord.fromJSON({
      prevout: {
        hash: txid,
        index: 0
      },
      requests: [10]
    });

    assert(!await indexer.hasOutpointRecord(record));

    await indexer.putOutpointRecord(record);
    assert(await indexer.hasOutpointRecord(record));

    await indexer.deleteOutpointRecord(record);
    assert(!await indexer.hasOutpointRecord(record));
  });

  it('should get/delete all outpoints', async () => {
    // big endian txids from blocksteam.info
    const json = [
      ['4870d78bfdc31b6b6d3f046c66c0e036762d2938574ce41a135be8a2985e0629', 0],
      ['0eb660e3573e66b4db21d3a5e310ecdfe0ad34eb8f395daf915b8e51de1b213f', 1],
      ['2888fb96f2a1518d4f4c4205d71765d2b76c8305e200c17e23e59e3e5f69cc4e', 1],
      ['e1dcfa55c8c43859fb6c261589f93db5156778a1e1faa8d476214b3e21b3556a', 2]
    ];

    for (const [txid, index] of json) {
      const record = OutpointRecord.fromJSON({
        prevout: {
          hash: txid,
          index: index
        },
        requests: [10]
      });

      await indexer.putOutpointRecord(record);
    }

    const outpoints = await indexer.getOutpointRecords();

    assert(json.length, outpoints.length);

    // json is sorted correctly above to allow
    // index based comparison to work
    for (const [i, outpoint] of outpoints.entries()) {
      const {prevout: {hash, index}} = outpoint.toJSON();
      assert.deepEqual(json[i], [hash, index]);

      await indexer.deleteOutpointRecord(outpoint);
      assert(!await indexer.hasOutpointRecord(outpoint));
    }
  });

  it('should index requests', async () => {
    const scriptPubKey = b('76a914698fa40f815c7f8e899cf94bf85c48c1993023ce88ac');
    const id = 1;

    const request = Request.fromOptions({
      id: id,
      address: Buffer.allocUnsafe(20),
      amount: 2000,
      spends: {
        index: 0,
        hash: Buffer.allocUnsafe(32)
      },
      pays: scriptPubKey
    });

    assert(!await indexer.hasRequest(id));
    await indexer.putRequest(request);

    assert(await indexer.hasRequest(id));

    const r = await indexer.getRequest(id);

    assert.deepEqual(request, r);

    await indexer.deleteRequest(id);
  });

  it('should get/delete all requests', async () => {
    const hexes = [
      b('0014eb945cf9f30663539fd85af8fafcbc656b1c352b'),
      b('76a9144c8c7ba9495a1b079003188f0ec4e172be23641088ac'),
      b('a9144687822239e9b03cfb0875a708bbd52f2c64cedd87'),
      b('76a914698fa40f815c7f8e899cf94bf85c48c1993023ce88ac')
    ];

    const requests = [];

    for (const [i, scriptPubKey] of Object.entries(hexes)) {
      // create requests from random data and
      // hold on to them to compare against
      // data returned from the database
      const request = Request.fromOptions({
        id: Number(i),
        address: random.randomBytes(20),
        value: random.randomRange(1e3, 1e7),
        spends: {
          index: random.randomRange(0, 3),
          hash: random.randomBytes(32)
        },
        pays: scriptPubKey
      });

      requests.push(request);

      const r1 = await indexer.putRequest(request);

      assert(await indexer.hasRequest(r1.id));

      const r2 = await indexer.getRequest(r1.id);

      assert.deepEqual(r1, r2);
    }

    const rs = await indexer.getRequests();

    assert.equal(requests.length, rs.length);

    for (const request of requests) {
      const r1 = rs.find(r => r.id === request.id);
      assert.deepEqual(request, r1);

      await indexer.deleteRequest(r1.id);
      assert(!await indexer.hasRequest(r1.id));
    }
  });

  it('should add Request', async () => {
    const pays = b('0014eb945cf9f30663539fd85af8fafcbc656b1c352b');
    const address = random.randomBytes(20);
    const value = random.randomRange(1e3, 1e7);
    const index = random.randomRange(0, 3);
    const hash = random.randomBytes(32);
    const id = random.randomRange(0, 10);

    const request = Request.fromOptions({
      id: id,
      address: address,
      value: value,
      spends: {
        index: index,
        hash: hash
      },
      pays: pays
    });

    const [r, o, s]  = await indexer.addRequest(request);

    const orecord = await indexer.getOutpointRecord(hash, index);

    const srecord = await indexer.getScriptRecord(pays);

    assert.deepEqual(request, r);

    assert.deepEqual(o, orecord);
    assert.deepEqual(s, srecord);
  });
});

// python like buffer constructor
function b(hex) {
  return Buffer.from(hex, 'hex');
}
