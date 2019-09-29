/*!
 * http.js - HTTP endpoints for bcoin-relaylib
 * Copyright (c) 2019, Mark Tyneway (Apache-2.0 License).
 * https://github.com/summa-tx/bcoin-relaylib
 */

'use strict';

const assert = require('bsert');
const path = require('path');
const {Server} = require('bweb');
const Validator = require('bval');
const {Script, Network} = require('bcoin');
const base58 = require('bcrypto/lib/encoding/base58');
const random = require('bcrypto/lib/random');
const sha256 = require('bcrypto/lib/sha256');
const {safeEqual} = require('bcrypto/lib/safe');
const Request = require('./request');

/**
 * Initialize HTTP Endpoints.
 * Extends the bcoin HTTP endpoints with
 * a new base path /relay
 *
 * GET /relay
 * GET /relay/outpoint
 * GET /relay/outpoint/:hash/:index
 * GET /relay/script
 * GET /relay/script/:script
 * POST /relay/request
 * GET /relay/request
 */

class HTTP extends Server {
  constructor(options) {
    super(new HTTPOptions(options));

    assert(options.node, 'Must pass node.');
    assert(options.relay, 'Must pass relay.');
    this.node = options.node;
    this.relay = options.relay;
    this.logger = options.logger;

    this.init();
  }

  init() {
    this.on('request', (req, res) => {
      if (req.method === 'POST' && req.pathname === '/')
        return;

      this.logger.debug('Request for method=%s path=%s (%s).',
        req.method, req.pathname, req.socket.remoteAddress);
    });

    this.on('listening', (address) => {
      this.logger.info('Relay HTTP server listening on %s (port=%d).',
        address.address, address.port);
    });

    this.initRouter();
    this.initSockets();
  };

  initRouter() {
    if (this.options.cors)
      this.use(this.cors());

    if (!this.options.noAuth) {
      this.use(this.basicAuth({
        hash: sha256.digest,
        password: this.options.apiKey,
        realm: 'node'
      }));
    }

    this.use(this.bodyParser({
      type: 'json'
    }));

    this.use(this.router());

    this.error((err, req, res) => {
      const code = err.statusCode || 500;
      res.json(code, {
        error: {
          type: err.type,
          code: err.code,
          message: err.message
        }
      });
    });

    /**
     * Get relay info.
     * The latestId returns the largest id indexed
     * in the database
     *
     * TODO: potentially remove latestID in favor of latest
     */

    this.get('/relay', async (req, res) => {
      const request = await this.relay.getLatestRequest();

      res.json(200, {
        latestId: request ? request.id : null,
        latest: request ? request.toJSON() : null
      });
    });

    /**
     * Get all indexed outpoints.
     */

    this.get('/relay/outpoint', async (req, res) => {
      res.json(400, {});
    });

    /**
     * Get an OutpointRecord.
     */

    this.get('/relay/outpoint/:hash/:index', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const hash = valid.buf('hash');
      const index = valid.uint('index');

      if (hash == null || index == null) {
        res.json(400);
        return;
      }

      assert(hash.length === 32);
      assert((index >>> 0) === index);

      const record = await this.relay.getOutpointRecord(hash, index);

      if (!record) {
        res.json(404);
        return;
      }

      res.json(200, record.toJSON());
    });

    /**
     * Get all ScriptRecords.
     */

    this.get('/relay/script', async (req, res) => {
      res.json(400);
    });

    /**
     * Get ScriptRecord.
     */

    this.get('/relay/script/:script', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const raw = valid.buf('script');

      if (raw == null) {
        res.json(400);
        return;
      }

      const script = Script.fromRaw(raw);

      const record = await this.relay.getScriptRecord(script.toRaw());

      if (!record) {
        res.json(404);
        return;
      }

      res.json(200, record.toJSON());
    });

    /**
     * Get Request.
     */

    this.get('/relay/request/:id', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const id = valid.u64('id');
      assert(typeof id === 'number');

      const request = await this.relay.getRequest(id);

      if (!request) {
        res.json(404);
        return;
      }

      res.json(200, request.toJSON());
    });

    /**
     * Index a request.
     *
     * id      - request id
     * address - ethereum address
     * value -
     * spends  - outpoint
     * pays    - scriptPubKey
     *
     * Must have one of spends or pays or both.
     * TODO: test the above statement
     *
     * TODO: Error if duplicate id, allow
     * for force argument to force overwrite
     */

    this.put('/relay/request', async (req, res) => {
      const valid = Validator.fromRequest(req);

      const id = valid.uint('id');
      assert(typeof id === 'number');

      const address = valid.buf('address');
      assert(address && address.length === 20);

      const value = valid.u64('value');
      assert(typeof value === 'number');

      const spends = valid.obj('spends', {});
      const pays = valid.buf('pays');

      const isValid = isValidRequestInput(spends, pays);

      if (!isValid) {
        res.json(400);
        return;
      }

      // NOTE: no endianness switching here
      if (typeof spends.hash === 'string')
        spends.hash = Buffer.from(spends.hash, 'hex');

      const request = Request.fromOptions({
        id: id,
        address: address,
        value: value,
        spends: spends,
        pays: pays
      });

      const records = await this.relay.addRequest(request);

      if (!records) {
        res.json(400);
        return;
      }

      const [r, orecord, srecord] = records;

      res.json(200, {
        request: r.toJSON(),
        outpoint: orecord ? orecord.toJSON() : null,
        script: srecord ? srecord.toJSON() : null
      });
    });

    /**
     * Delete a single Request
     */

    this.del('/relay/request', async (req, res) => {
      const valid = Validator.fromRequest(req);

      const id = valid.uint('id');
      assert(typeof id === 'number');

      await this.relay.deleteRequest(id);

      res.json(200, {success: true});
    });

    /**
     * Delete the entire relay database
     * TODO: add auth mechanism
     */

    this.del('/relay', async (req, res) => {
      await this.relay.wipe();

      res.json(200, {success: true});
    });
  }

  /**
   * Handle new websocket.
   * This is called internally when a new
   * websocket connection is attempted.
   * @private
   * @param {WebSocket} socket
   */

  handleSocket(socket) {
    socket.hook('auth', (...args) => {
      if (socket.channel('auth'))
        throw new Error('Already authed.');

      if (!this.options.noAuth) {
        const valid = new Validator(args);
        const key = valid.str(0, '');

        if (key.length > 255)
          throw new Error('Invalid API key.');

        const data = Buffer.from(key, 'ascii');
        const hash = sha256.digest(data);

        if (!safeEqual(hash, this.options.apiHash))
          throw new Error('Invalid API key.');
      }

      socket.join('auth');

      this.logger.info('Successful auth from %s.', socket.host);
      this.handleAuth(socket);

      return null;
    });
  }

  /**
   * Handle new auth'd websocket.
   * This adds hooks. The websocket client
   * must call 'watch relay' to receive events.
   * @private
   * @param {WebSocket} socket
   */

  handleAuth(socket) {
    socket.hook('watch relay', () => {
      socket.join('relay');
      return null;
    });

    socket.hook('unwatch relay', () => {
      socket.leave('relay');
      return null;
    });
  }

  /**
   * Bind to relay events.
   * Capture emitted events by the
   * relay and send via websocket.
   * @private
   */

  initSockets() {
    this.relay.on('requests satisfied', (data) => {
      const sockets = this.channel('relay');

      if (!sockets)
        return;

      this.to('relay', 'relay requests satisfied', data);
    });
  }
}

class HTTPOptions {
  /**
   * HTTPOptions
   * @alias module:http.HTTPOptions
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    this.network = Network.primary;
    this.logger = null;
    this.node = null;
    this.apiKey = base58.encode(random.randomBytes(20));
    this.apiHash = sha256.digest(Buffer.from(this.apiKey, 'ascii'));
    this.noAuth = false;
    this.cors = false;
    this.maxTxs = 100;

    this.prefix = null;
    this.host = '127.0.0.1';
    this.port = 8080;
    this.ssl = false;
    this.keyFile = null;
    this.certFile = null;

    this.fromOptions(options);
  }

  /**
   * Inject properties from object.
   * @private
   * @param {Object} options
   * @returns {HTTPOptions}
   */

  fromOptions(options) {
    assert(options);
    assert(options.node && typeof options.node === 'object',
      'HTTP Server requires a Node.');

    this.node = options.node;
    this.network = options.node.network;
    this.logger = options.node.logger;

    this.port = this.network.rpcPort;

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger;
    }

    if (options.apiKey != null) {
      assert(typeof options.apiKey === 'string',
        'API key must be a string.');
      assert(options.apiKey.length <= 255,
        'API key must be under 256 bytes.');
      this.apiKey = options.apiKey;
      this.apiHash = sha256.digest(Buffer.from(this.apiKey, 'ascii'));
    }

    if (options.noAuth != null) {
      assert(typeof options.noAuth === 'boolean');
      this.noAuth = options.noAuth;
    }

    if (options.cors != null) {
      assert(typeof options.cors === 'boolean');
      this.cors = options.cors;
    }

    if (options.prefix != null) {
      assert(typeof options.prefix === 'string');
      this.prefix = options.prefix;
      this.keyFile = path.join(this.prefix, 'key.pem');
      this.certFile = path.join(this.prefix, 'cert.pem');
    }

    if (options.host != null) {
      assert(typeof options.host === 'string');
      this.host = options.host;
    }

    if (options.port != null) {
      assert((options.port & 0xffff) === options.port,
        'Port must be a number.');
      this.port = options.port;
    }

    if (options.ssl != null) {
      assert(typeof options.ssl === 'boolean');
      this.ssl = options.ssl;
    }

    if (options.keyFile != null) {
      assert(typeof options.keyFile === 'string');
      this.keyFile = options.keyFile;
    }

    if (options.certFile != null) {
      assert(typeof options.certFile === 'string');
      this.certFile = options.certFile;
    }

    if (options.maxTxs != null) {
      assert(Number.isSafeInteger(options.maxTxs));
      this.maxTxs = options.maxTxs;
    }

    // Allow no-auth implicitly
    // if we're listening locally.
    if (!options.apiKey) {
      if (this.host === '127.0.0.1' || this.host === '::1')
        this.noAuth = true;
    }

    return this;
  }

  /**
   * Instantiate http options from object.
   * @param {Object} options
   * @returns {HTTPOptions}
   */

  static fromOptions(options) {
    return new HTTPOptions().fromOptions(options);
  }
}

// one or the other or both
function isValidRequestInput(spends, pays) {
  let isSpendsValid = false;
  let isPaysValid = false;

  if (
    typeof spends === 'object'
      && !Number.isNaN(spends)
      && typeof spends.index === 'number'
      && typeof spends.hash === 'string'
  )
    isSpendsValid = true;

  if (
    typeof pays === 'object'
      && Buffer.isBuffer(pays)
      // TODO: check for size of pays
  )
    isPaysValid = true;

  return isSpendsValid || isPaysValid;
}

module.exports = HTTP;
