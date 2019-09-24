/**
 * Relay HTTP and Websocket Tests
 */

'use strict';

const FullNode = require('bcoin/lib/node/fullnode');
const consensus = require('bcoin/lib/protocol/consensus');
const RelayClient = require('../lib/client');
const random = require('bcrypto/lib/random');
const assert = require('bsert');
const {NodeClient, WalletClient} = require('bclient');
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

    const request = await rclient.getRequestRecord(id);
    assert.deepEqual(json.request, request);

    const outpoint = await rclient.getOutpointRecord(hash, index);
    assert.deepEqual(json.outpoint, outpoint);

    const script = await rclient.getScriptRecord(pays);
    assert.deepEqual(json.script, script);
  });

  it('should receive a websocket event on spend to "pays"', async () => {
    let event = false;

    rclient.bind('relay output created', () => {
      event = true;
    });

    const tx = await wallet.send({
      account: 'default',
      outputs: [
        {value: 0.1 * consensus.COIN, script: pays}
      ]
    });

    assert(tx);

    // mine a block to get it in the chain
    await nclient.execute('generatetoaddress', [1, coinbase]);

    assert(event);
  });

  it('should return the latest id from GET /', async () => {
    const info = await rclient.getRelayInfo();
    assert('latestId' in info);

    const n = 10;
    // create a bunch of Requests
    // send n and assert that info.latestId + n === new response
    for (let i = 0; i < n; i++) {
      const address = random.randomBytes(20).toString('hex');
      const hash = random.randomBytes(32).toString('hex');
      const index = random.randomRange(0, 4);

      await rclient.putRequestRecord({
        address: address,
        value: consensus.COIN,
        spends: {
          index: index,
          hash: hash
        },
        pays: pays
      });
    }

    const post = await rclient.getRelayInfo();

    assert.deepEqual(info.latestId + n, post.latestId);
  });
});
