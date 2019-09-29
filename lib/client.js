/*!
 * client.js - HTTP and websocket client for bcoin-relaylib
 * Copyright (c) 2019, Mark Tyneway (Apache-2.0 License).
 * https://github.com/summa-tx/bcoin-relaylib
 */

'use strict';

const {NodeClient} = require('bclient');

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
 * TODO: proxy bcoin api through http server
 */

class RelayClient extends NodeClient {
  constructor(options) {
    super(options);
  }

  async open() {
    await super.open();
    await this.watchRelay();
  }

  async auth() {
    return this.call('auth', this.password);
  }

  async close() {
    await this.unwatchRelay();
    await super.close();
  }

  async watchRelay() {
    return await this.call('watch relay');
  }

  async unwatchRelay() {
    return await this.call('unwatch relay');
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
    return this.put('/relay/request', options);
  }

  async getRequestRecord(id) {
    return this.get(`/relay/request/${id}`);
  }

  async wipe() {
    return this.del('/relay');
  }
}

module.exports = RelayClient;
