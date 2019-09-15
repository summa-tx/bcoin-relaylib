/*
 * Bitcoin relay events for bcoin
 */

'use strict';

const EventEmitter = require('events');
const Relay = require('./relay');
const HTTP = require('./http');

const plugin = exports;

class Plugin extends EventEmitter {
  constructor(node) {
    super(node);
    this.node = node;
    this.config = node.config;
    this.network = node.network;
    this.chain = node.chain;

    this.relay = new Relay({
      network: node.network,
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
      host: this.config.str('relay-http-host'),
      port: this.config.uint('relay-http-port'),
      apiKey: this.config.str('relay-api-key', this.config.str('apikey')),
      noAuth: this.config.bool('relay-no-auth'),
      cors: this.config.bool('relay-cors'),
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
  }
}

plugin.id = 'relay';

plugin.init = function init(node) {
  return new Plugin(node);
};
