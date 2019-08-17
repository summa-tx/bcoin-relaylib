/*!
 * layout.js - librelay layout for bcoin
 * Copyright (c) 2018 Mark Tyneway (MIT License).
 * https://github.com/summa-one/bcoin-librelay
 */

'use strict';

const bdb = require('bdb');

/*
 *  Index outpoints and scripthashes
 *
 *  V -> db version
 *  s[script hash] -> script (script by its sha256)
 *  o[hash][index] -> dummy (outpoints)
 *
 *  can use o to look up in chaindb.layout.c
 *
 *  outpoints are unique, scripts are not
 *  everything needs to be an outpoint
 *  if watching a script, need to index the outpoint
 *  not the script. this simplifies the logic quite
 *  a bit.
 *
 *  - index a script
 *  - when a new block connects, check each of its
 *    transactions outputs for a script that matches
 *  - index any outpoints that match the script
 *  - allow rescan from a certain height
 */

const layout = {
  V: bdb.key('V'),
  o: bdb.key('o', ['hash256', 'uint32']),
  s: bdb.key('s', ['hash256'])
};

/*
 * Expose
 */

module.exports = layout;
