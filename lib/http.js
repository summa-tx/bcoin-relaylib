/**
 * bcoin relaylib HTTP Endpoints
 */

const assert = require('bsert');
const Validator = require('bval');
const {Script, Outpoint} = require('bcoin');

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
 */

class HTTP {
  constructor(node, relay) {
    assert(node, 'Must pass node.');
    assert(relay, 'Must pass relay.');
    this.node = node;
    this.relay = relay;
    this.http = node.http;

    this.init();
  }

  init() {
    /**
     * Get relay info.
     * - Number of Outpoints/Scripts indexed
     * - Number of Requests
     * - Block height
     */

    this.http.get('/relay', async (req, res) => {
      res.json(200);
    });

    /**
     * Get all indexed outpoints.
     */

    this.http.get('/relay/outpoint', async (req, res) => {
      res.json(400);
    });

    /**
     * Test if an outpoint is indexed.
     */
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

    /**
     * Get all indexed scriptPubKeys
     */
    this.node.http.get('/relay/script', async (req, res) => {
      res.json(400);
    });

    /**
     * Test if a scriptPubKey is indexed.
     */
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

    /**
     * Index a request.
     *
     * address - ethereum address, secp256k1 public key
     * amount  -
     * spends  - outpoint
     * pays    - scriptPubKey
     *
     * Must have one of spends or pays or both.
     */

    this.node.http.post('/relay/request', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const address = valid.buf('address');
      const amount = valid.u64('amount');
      const spends = valid.buf('spends');
      const pays = valid.buf('pays');

      assert(address && address.length === 20);
      assert(typeof amount === 'number');
      assert(Buffer.isBuffer(spends));
      assert(Buffer.isBuffer(pays));

      // TODO: add validation here inside fromOptions
      const request = Request.fromOptions({
        address: address,
        amount: amount,
        spends: spends,
        pays: pays
      });

      const json = await this.relay.putRequest(request);

      res.json(200, json);
    });
  }

  // TODO: set up websockets
  open() {
    ;
  }
}

module.exports = HTTP;
