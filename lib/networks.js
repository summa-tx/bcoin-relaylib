/**
 * Decorate bcoin Network object
 */

'use strict';

function decorate(network) {
  // the relay port is defined to always be
  // 3 larger than the rpc port
  network.relayPort = network.rpcPort + 3;

  return network;
}

module.exports = decorate;
