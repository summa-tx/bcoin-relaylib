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
    super();
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

    this.http = new HTTP(this.node, this.relay);

    this.init();
  }

  async open() {
    await this.relay.open();
    await this.http.open();
  }

  init() {
    this.relay.on('error', err => this.node.error(err));

    const handleSocket = node.http.handleSocket;
    node.http.handleSocket = function handleSocket(socket) {
      handleSocket(socket);

      // hmm what is join doing?
      // need to add to node.http
      socket.hook('watch relay', () => {
        socket.join('relay');
        return null;
      });

      socket.hook('unwatch relay', () => {
        socket.leave('relay');
        return null;
      });
    }

    this.relay.on('', () => {
      const sockets = this.node.http.channel('relay')

      if (!sockets)
        return;

      this.node.http.to('relay', '');

    });

    this.relay.on('', () => {
      const sockets = this.node.http.channel('relay')

      if (!sockets)
        return;

      this.node.http.to('relay', '');
    });
  }
}

plugin.id = 'relay';

plugin.init = function init(node) {
  return new Plugin(node);
};
