/**
 * Relay Rescan Tests
 */

'use strict';

const FullNode = require('bcoin/lib/node/fullnode');
const consensus = require('bcoin/lib/protocol/consensus');
const RelayClient = require('../lib/client');
const random = require('bcrypto/lib/random');
const assert = require('bsert');
const {NodeClient, WalletClient} = require('bcoin/lib/client');
const {MTX, Coin, Output} = require('bcoin');

const ports = {
  p2p: 49211,
  node: 49212,
  wallet: 49213,
  relay: 49214
};

const node = new FullNode({
  network: 'regtest',
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

const wallet = wclient.wallet('primary');

// address used for coinbase rewards
let coinbase;

describe('HTTP and Websockets', function() {
  before(async () => {
    consensus.COINBASE_MATURITY = 0;

    await node.open();
    await rclient.open();
    await wclient.open();

    const info = await wallet.createAddress('default');
    coinbase = info.address;

    for (let i = 0; i < 20; i++)
      await nclient.execute('generatetoaddress', [2, coinbase]);
  });

  after(async () => {
    await rclient.close();
    await wclient.close();
    await node.close();

    consensus.COINBASE_MATURITY = 100;
  });

  // create two Requests
  // send to pays, assert websocket event
  // spend the spends, assert websocket event
  // track the height of both the blocks
  // that triggered the events
  // rescan from behind those, assert
  // that the events were received again

  // a scriptPubKey pulled from blockstream.info
  const pays = '76a914c22a601f8a1f4cc20bdc595447b6aeaf4b6cd31288ac';
  let coin;

  it('should create Requests', async () => {
    const address = random.randomBytes(20).toString('hex');

    // create a Request for pays
    await rclient.putRequestRecord({
      id: 0,
      address: address,
      value: consensus.COIN,
      pays: pays
    });

    const coins = await wallet.getCoins();
    // wallet should have coins to spend from mining
    assert(coins.length);

    // sort the coins to be sure selecting the oldest coin
    coins.sort((a, b) => a.height > b.height);
    coin = Coin.fromJSON(coins[0]);

    await rclient.putRequestRecord({
      id: 1,
      address: address,
      value: consensus.COIN,
      spends: {
        hash: coin.hash.toString('hex'),
        index: coin.index
      }
    });
  });

  it('should get websocket events from Requests', async () => {
    this.skip();

    let event = false;

    // TODO: debug why this isn't firing
    rclient.bind('relay requests satisfied', (data) => {
      event = true;
    });

    const info = await wallet.createAddress('default');

    // build tx locally, send to wallet to sign and broadcast
    const mtx = new MTX();
    mtx.addCoin(coin);

    const output = new Output({
      value: coin.value * 0.4999,
      address: info.address
    });

    // add output twice to prevent absurd fee rejection
    mtx.addOutput(output);
    mtx.addOutput(output);

    const tx = mtx.toRaw().toString('hex');

    // send tx to wallet and sign
    const txn = await wallet.sign({
      tx: tx
    });

    const txid = await nclient.execute('sendrawtransaction', [txn.hex]);
    assert(txid);

    // assert tx in mempool
    const mempool = await nclient.getMempool();
    assert.equal(txid, mempool[0]);

    await nclient.execute('generatetoaddress', [1, coinbase]);

    assert(event);
  });

  it('should rescan and get the same websocket events', async () => {
    this.skip();
  });
});
