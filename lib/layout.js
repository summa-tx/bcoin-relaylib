/*!
 * layout.js - layout for bcoin-relaylib
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

const bdb = require('bdb');
const layout = require('bcoin/lib/indexer/layout');
const assert = require('bsert');

/*
 *  Index outpoints and scripthashes
 *
 *  V -> db version
 *  h -> uint256 (height)
 *  s[script hash] -> script record  (script record by script hash)
 *                    - list of request ids
 *                    - script bytes
 *
 *  o[hash][index] -> outpoint record
 *                    - nextout
 *                        txid + index that consumes it
 *                    - key is the hash and index that creates outpoint
 *                    - list of request ids
 *
 *  i[hash256] -> request (request id by request record)
 *                    - bytes (eth address)
 *                    - uint64 (value)
 *                    - bytes (spends - outpoint, 0 or 1)
 *                    - bytes (pays - scriptPubKey, 0 or 1)
 *
 *  can use o to look up in chaindb.layout.c
 *
 *  - HTTP endpoint for creating request record
 *    must include list of outpoints/scriptPubKeys
 *
 *  - keep last known height indexed
 *  - on startup, read all script hashes and
 *    all outpoints, build bip37 bloom filter
 *  - scan from last known height
 *  - on positives, index outpoints and send alerts
 *    by looking up request ids in index
 *
 *  - when a new block connects, check each of its
 *    transactions outputs for a script that matches
 *  - index any outpoints that match the script
 *  - allow rescan from a certain height
 *
 *  need to send alert when request record is fulfilled
 */

const relay = {
  s: bdb.key('s', ['hash256']),
  o: bdb.key('o', ['hash256', 'uint32']),
  i: bdb.key('i', ['hash256'])
};

for (const key in Object.keys(relay))
  assert(!(key in layout));

Object.assign(layout, relay);

/*
 * Expose
 */

module.exports = layout;
