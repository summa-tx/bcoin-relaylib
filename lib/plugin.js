/*
 * Bitcoin relay events for bcoin
 */

'use strict';

const EventEmitter = require('events');
const Validator = require('bval');
const {Address, Outpoint} = require('bcoin');

const Relay = require('./relay');

const plugin = exports;

class Plugin extends EventEmitter {
  constructor(node) {
    super();
    this.node = node;
    this.config = node.config;
    this.network = node.network;

    this.relay = new Relay({
      logger: node.logger,
      prefix: this.config.prefix,
      module: 'relay',
      memory: this.config.bool('memory')
    });
  }

  async open() {
    await this.relay.open();
    this.init();
  }

  // TODO: set up event listening
  // on block in chain, iterate through all txs
  // looking for any outpoints or scriptPubKeys
  // that we have indexed. optimize in the future
  // with bloom filters.
  // see https://github.com/bcoin-org/bcoin/blob/master/lib/node/http.js#L512

  init() {
    // Check if an outpoint is indexed
    this.node.http.get('/relay/outpoint/:hash/:index', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const hash = valid.buf('hash');
      const index = valid.uint('index');

      if (hash == null || index == null)
        return res.json(400);

      const outpoint = Outpoint.fromOptions({
        hash: hash,
        index: index
      });

      const indexed = await this.relay.hasOutpoint(outpoint);

      if (!indexed)
        return res.json(404);

      res.json(200, outpoint.toJSON());
    });


    // Index an outpoint
    this.node.http.post('/relay/outpoint', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const hash = valid.buf('hash');
      const index = valid.uint('index');

      if (hash == null || index == null)
        return res.json(400);

      const outpoint = Outpoint.fromOptions({
        hash: hash,
        index: index
      });

      const json = await this.relay.setOutpoint(outpoint);

      res.json(200, json);
    });

    // Check if a scripthash is indexed
    this.node.http.get('/relay/scripthash/:hash', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const hash = valid.buf('hash');

      if (hash == null)
        return res.json(400);

      // validation
      const address = Address.fromScripthash(hash, this.network);

      const indexed = await this.relay.hasScripthash(address.getHash());

      if (!indexed)
        return res.json(404);

      res.json(200, {hash: address.getHash('hex')});
    });

    // Index a scriptPubKey hash
    this.node.http.post('/relay/scripthash', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const hash = valid.buf('hash');

      if (hash == null)
        return res.json(400);

      // validation
      const address = Address.fromScripthash(hash, this.network);

      const json = await this.relay.setScripthash(address.getHash());

      res.json(200, json);
    });
  }
}

plugin.id = 'relay';

plugin.init = function init(node) {
  return new Plugin(node);
};
