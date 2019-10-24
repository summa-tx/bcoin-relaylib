/**
 * networks.js - Decorate bcoin Network object
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

function decorate(network) {
  // the relay port is defined to always be
  // 3 larger than the rpc port
  network.relayPort = network.rpcPort + 3;

  return network;
}

module.exports = decorate;
