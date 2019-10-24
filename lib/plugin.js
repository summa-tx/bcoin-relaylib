/*!
 * plugin.js - Relay Plugin for bcoin
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

const EventEmitter = require('events');
const Relay = require('./relay');
const HTTP = require('./http');
const decorate = require('./networks');

const plugin = exports;

class Plugin extends EventEmitter {
  constructor(node) {
    super(node);
    this.node = node;
    this.config = node.config;
    this.chain = node.chain;
    // decorate network object with relay variables
    this.network = decorate(node.network);

    this.relay = new Relay({
      network: node.network.type,
      logger: node.logger,
      chain: node.chain,
      blocks: node.blocks,
      memory: this.config.bool('memory'),
      prefix: this.config.str('index-prefix', this.config.prefix),
      pruned: this.config.bool('pruned'),
      spv: this.config.bool('spv'),
      indextx: this.config.bool('index-tx')
    });

    this.http = new HTTP({
      node: this.node,
      relay: this.relay,
      network: node.network,
      logger: node.logger,
      prefix: this.config.prefix,
      ssl: this.config.bool('relay-ssl'),
      keyFile: this.config.path('relay-ssl-key'),
      certFile: this.config.path('relay-ssl-cert'),
      host: this.config.str('relay-http-host', this.config.str('http-host')),
      port: this.config.uint('relay-http-port', this.network.relayPort),
      apiKey: this.config.str('relay-api-key', this.config.str('apikey')),
      noAuth: this.config.bool('relay-no-auth', this.config.bool('no-auth')),
      cors: this.config.bool('relay-cors', this.config.bool('cors'))
    });

    this.init();
  }

  async open() {
    await this.relay.open();
    await this.http.open();
  }

  async close() {
    await this.relay.close();
    await this.http.close();
  }

  init() {
    this.relay.on('error', err => this.node.error(err));
    this.http.on('error', err => this.node.error(err));
  }
}

plugin.id = 'relay';

plugin.init = function init(node) {
  return new Plugin(node);
};
