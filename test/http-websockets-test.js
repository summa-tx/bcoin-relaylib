/**
 * http-websockets-test.js - Relay HTTP and Websocket Tests
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

const FullNode = require('bcoin/lib/node/fullnode');
const consensus = require('bcoin/lib/protocol/consensus');
const RelayClient = require('../lib/client');
const random = require('bcrypto/lib/random');
const assert = require('bsert');
const {NodeClient, WalletClient} = require('bcoin/lib/client');
const Logger = require('blgr');

const logger = new Logger();

const ports = {
  p2p: 49111,
  node: 49112,
  wallet: 49113,
  relay: 49114
};

const node = new FullNode({
  network: 'regtest',
  logger: logger,
  memory: true,
  apiKey: 'foo',
  port: ports.p2p,
  httpPort: ports.node,
  relayHttpPort: ports.relay,
  plugins: [
    require('bcoin/lib/wallet/plugin'),
    require('../lib/plugin')
  ],
  env: {
    BCOIN_WALLET_HTTP_PORT: ports.wallet.toString()
  }
});

const nclient = new NodeClient({
  network: 'regtest',
  apiKey: 'foo',
  port: ports.node
});

const rclient = new RelayClient({
  network: 'regtest',
  apiKey: 'foo',
  port: ports.relay
});

const wclient = new WalletClient({
  network: 'regtest',
  apiKey: 'foo',
  port: ports.wallet
});

// use primary account for all queries,
// corresponds to m/44'/1'/0'
const wallet = wclient.wallet('primary');

// address used for coinbase rewards
let coinbase;

describe('HTTP and Websockets', function() {
  before(async () => {
    // so we don't have to wait too long for
    // coinbase maturity
    consensus.COINBASE_MATURITY = 0;

    await logger.open();
    await node.open();

    await rclient.open();
    await wclient.open();

    // mine a bunch of blocks
    const info = await wallet.createAddress('default');
    coinbase = info.address;

    for (let i = 0; i < 20; i++)
      await nclient.execute('generatetoaddress', [2, coinbase]);
  });

  after(async () => {
    await rclient.close();
    await wclient.close();
    await node.close();
    await logger.close();

    consensus.COINBASE_MATURITY = 100;
  });

  // a scriptPubKey pulled from blockstream.info
  const pays = '76a914c22a601f8a1f4cc20bdc595447b6aeaf4b6cd31288ac';

  // a Request is indexed along with the "spends" outpoint
  // and the "pays" scriptPubKey. Assert that the Request
  // is indexed along with "spends" and "pays"
  it('should index a request', async () => {
    const address = random.randomBytes(20).toString('hex');
    const hash = random.randomBytes(32).toString('hex');
    const index = 0;

    const json = await rclient.putRequestRecord({
      id: 0,
      address: address,
      value: consensus.COIN,
      spends: {
        index: index,
        hash: hash
      },
      pays: pays
    });

    // created a Request with both an OutpointRecord
    // and a ScriptRecord since both spends and pays
    // are defined in putRequestRecord
    assert(json.request);
    assert(json.outpoint);
    assert(json.script);

    const id = json.request.id;

    const request = await rclient.getRequest(id);
    assert.deepEqual(json.request, request);

    const outpoint = await rclient.getOutpointRecord(hash, index);
    assert.deepEqual(json.outpoint, outpoint);

    const script = await rclient.getScriptRecord(pays);
    assert.deepEqual(json.script, script);
  });

  it('should index Request with only spends', async () => {
    const json = await rclient.putRequestRecord({
      id: 5,
      address: random.randomBytes(20).toString('hex'),
      value: consensus.COIN,
      spends: {
        index: 2,
        hash: random.randomBytes(32).toString('hex')
      }
    });

    assert(json.request);
    assert(json.outpoint);
    assert(!json.script);
  });

  it('should index Request with only pays', async () => {
    const json = await rclient.putRequestRecord({
      id: 5,
      address: random.randomBytes(20).toString('hex'),
      value: consensus.COIN,
      pays: pays
    });

    assert(json.request);
    assert(json.script);
    assert(!json.outpoint);
  });

  it('should throw error when no Pays and no Spends', async () => {
    const fn = async () => await rclient.putRequestRecord({
      id: 8,
      address: random.randomBytes(20).toString('hex'),
      value: consensus.COIN
    });

    assert.rejects(fn, 'Status code: 400');
  });

  it('should receive a websocket event on spend to "pays"', async () => {
    let event = false;
    let tx;

    function callback(data) {
      event = true;

      assert.deepEqual(tx.hash, data.txid);
    }

    rclient.bind('relay requests satisfied', callback);

    tx = await wallet.send({
      account: 'default',
      outputs: [
        {value: 0.1 * consensus.COIN, script: pays}
      ]
    });

    assert(tx);

    // mine a block to get it in the chain
    await nclient.execute('generatetoaddress', [1, coinbase]);

    assert(event);

    // TODO: stuck on old version of bclient
    // without unbind method, so call it directly
    // on the client's socket
    rclient.socket.unbind('relay requests satisfied', callback);
  });

  it('should return the latest id from GET /', async () => {
    const n = 10;

    // create a bunch of Requests and index them
    // increment the id each time, assert that the
    // incremented id is returned
    for (let i = 0; i < n; i++) {
      const info = await rclient.getRelayInfo();
      assert('latest' in info);
      assert(typeof info.latest.id === 'number');

      const address = random.randomBytes(20).toString('hex');
      const hash = random.randomBytes(32).toString('hex');
      const index = random.randomRange(0, 4);

      await rclient.putRequestRecord({
        id: info.latest.id + 1,
        address: address,
        value: consensus.COIN,
        spends: {
          index: index,
          hash: hash
        },
        pays: pays
      });

      const post = await rclient.getRelayInfo();

      assert.deepEqual(post.latest.id, info.latest.id + 1);
    }
  });

  it('should receive a websocket event on spend of "spends"', async () => {
    const pays = '00144aed182abf4817c8383979b61a25e3eaea2187c0';

    let event = false;
    let tx;

    function callback(data) {
      event = true;
      assert.deepEqual(tx.hash, data.txid);
    }

    // set up listener
    rclient.bind('relay requests satisfied', callback);

    // create transaction
    tx = await wallet.createTX({
      account: 'default',
      outputs: [
        {value: 0.1 * consensus.COIN, script: pays}
      ]
    });

    // create Request
    const info = await rclient.getRelayInfo();
    const address = random.randomBytes(20).toString('hex');
    const hash = tx.inputs[0].prevout.hash;
    const index = tx.inputs[0].prevout.index;

    await rclient.putRequestRecord({
      id: info.latest.id + 1,
      address: address,
      value: consensus.COIN,
      spends: {
        index: index,
        hash: hash
      }
    });

    const hex = tx.hex;
    await nclient.execute('sendrawtransaction', [hex]);

    // mine a block to get it in the chain
    await nclient.execute('generatetoaddress', [1, coinbase]);

    assert(event);

    rclient.socket.unbind('relay requests satisfied', callback);
  });

  it('should wipe the db', async () => {
    // query all of the requests in the database
    const r1 = await rclient.getRequests();

    // not good to depend on side effects from
    // previous tests, but running with it for now
    assert(r1.length > 0);

    const response = await rclient.wipe();
    assert.equal(response.success, true);

    // query all the requests in the database again
    const r2 = await rclient.getRequests();

    // now the requests are all gone
    assert.equal(r2.length, 0);
  });
});
