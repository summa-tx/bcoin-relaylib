/*!
 * client.js - HTTP and websocket client for bcoin-relaylib
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

const {NodeClient} = require('bcoin/lib/client');

/**
 * Client for relay
 * Extends NodeClient, the relay http
 * server will proxy the bcoin requests to
 * the bcoin http server.
 *
 * GET /relay
 * GET /relay/outpoint
 * GET /relay/outpoint/:hash/:index
 * GET /relay/script
 * GET /relay/script/:script
 * POST /relay/request
 * DEL /relay
 *
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

  async getRequest(id) {
    return this.get(`/relay/request/${id}`);
  }

  async getRequests() {
    return this.get('/relay/request');
  }

  async wipe() {
    return this.del('/relay');
  }

  async rescan(height) {
    return this.post('/relay/rescan', {height});
  }
}

module.exports = RelayClient;
