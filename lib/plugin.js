/*
 * Bitcoin relay events for bcoin
 */

'use strict';

const EventEmitter = require('events');
const Validator = require('bval');
const {BufferSet, BufferMap} = require('buffer-map');
const {Script, Outpoint} = require('bcoin');
const BN = require('bcrypto/lib/bn.js');
const Relay = require('./relay');

const plugin = exports;

class Plugin extends EventEmitter {
  constructor(node) {
    super();
    this.node = node;
    this.config = node.config;
    this.network = node.network;
    this.chain = node.chain;
    this.http = node.http;

    this.prevouts = new BufferSet();
    this.scripts = new BufferSet();

    // Buffer(txid || index) -> BN
    this.weights = new BufferMap();

    // TODO: test not running in memory
    this.relay = new Relay({
      logger: node.logger,
      prefix: this.config.prefix,
      chain: node.chain,
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
  //

  init() {
    this.initCacheListeners();
    this.initChainListeners();
    this.initHTTPEndpoints();
    // this.initCache();
    // create each of the caches
  }

  // think about what actually needs to be cached
  initCaches() {

  }

  /**
   * Initialize HTTP Endpoints.
   * Extends the bcoin HTTP endpoints with
   * a new base path /relay
   *
   * GET /relay
   * GET /relay/outpoint
   * GET /relay/outpoint/:hash/:index
   * POST /relay/outpoint <-- consider deleting this
   * GET /relay/script
   * GET /relay/script/:script
   * POST /relay/script
   */

  // TODO: move http to its own module
  initHTTPEndpoints() {
    this.node.http.get('/relay', async (req, res) => {
      // TODO: what other useful info?
      res.json(200, {
        rescanning: false
      });
    });

    // Get all indexed outpoints.
    this.http.get('/relay/outpoint', async (req, res) => {
      res.json(400);
    });

    // Test if an outpoint is indexed.
    this.http.get('/relay/outpoint/:hash/:index', async (req, res) => {
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

    // Index an outpoint.
    this.http.post('/relay/outpoint', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const hash = valid.buf('hash');
      const index = valid.uint('index');

      if (hash == null || index == null)
        return res.json(400);

      const outpoint = Outpoint.fromOptions({
        hash: hash,
        index: index
      });

      const json = await this.relay.putOutpoint(outpoint);

      res.json(200, json);
    });

    // Get all indexed scriptPubKeys
    this.node.http.get('/relay/script', async (req, res) => {
      res.json(400);
    });

    // Test if a scriptPubKey is indexed.
    this.node.http.get('/relay/script/:script', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const raw = valid.buf('script');

      if (hash == null)
        return res.json(400);

      const script = Script.fromRaw(raw);

      const indexed = await this.relay.hasScript(script);

      if (!indexed)
        return res.json(404);

      res.json(200, script.toJSON());
    });

    // Index a scriptPubKey.
    this.node.http.post('/relay/script', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const raw = valid.buf('script');
      const rescan = valid.bool('true', false);
      const height = valid.uint('height', 0);

      if (hash == null)
        return res.json(400);

      const script = Script.fromRaw(raw);

      const json = await this.relay.putScript(script);

      if (rescan)
        this.relay.rescan(height);

      res.json(200, json);
    });
  }

  /**
   * Initialize listeners to manage the caches
   *
   */
  initCacheListeners() {
    // i don't think i need the outpoint anymore
    this.relay.on('put outpoint', (outpoint) => {
      this.prevouts.set(outpoint.toRaw());
    });

    this.relay.on('put script', (script) => {
      this.scripts.set(script.toRaw());
      this.weights.set(script.toRaw(), new BN(0));
    });

    this.relay.on('delete outpoint', (outpoint) => {
      this.prevouts.delete(outpoint.toRaw());
    });

    this.relay.on('delete script', (script) => {
      this.scripts.delete(script.toRaw());
    });
  }

  /**
   * Initialize chain listeners. Outpoints are added
   * elsewhere.
   */

  initChainListeners() {
    this.chain.on('connect', async (entry, block, view) => {
      const work = this.relay.getWork(block.hash());

      for (const tx of block.txs) {
        for (const input of tx.inputs) {
          const prevout = input.prevout.toKey();

          if (this.prevouts.has(prevout)) {
            const accumulated = this.scripts.get(raw);
            this.weights.add(script, accumulated.add(work));
          }
        }

        for (const output of tx.outputs) {
          const raw = output.script.toRaw();

          // NO! set as outpoint instead
          if (this.scripts.has(raw)) {
            const accumulated = this.scripts.get(raw);
            this.scripts.set(raw, accumulated.add(work));
          }
        }
      }
    });

    // unroll stuff...
    this.chain.on('disconnect', async () => {

    });
  }
}

plugin.id = 'relay';

plugin.init = function init(node) {
  return new Plugin(node);
};
