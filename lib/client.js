/**
 * Client for relay
 *
 * GET /relay
 * GET /relay/outpoint
 * GET /relay/outpoint/:hash/:index
 * GET /relay/script
 * GET /relay/script/:script
 * POST /relay/request
 *
 */

const {NodeClient} = require('bclient');

class RelayClient extends NodeClient {
  constructor(options) {
    super(options);
  }

  async getRelayInfo() {
    return this.get('/relay');
  }

  async getOutpointRecords() {
    return this.get('/relay/outpoint');
  }

  async getOutpointRecord(hash, index) {
    return this.get(`/relay/outpoint/${hash}/${index}`);
  }

  async getScriptRecords() {
    return this.get('/relay/script');
  }

  async getScriptRecord(script) {
    return this.get(`/relay/script/${script}`);
  }

  async putRequestRecord(options) {
    return this.put(`/relay/request`, options);
  }
}
