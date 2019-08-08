/*!
 * layout.js - librelay layout for bcoin
 * Copyright (c) 2018, the bcoin developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const bdb = require('bdb');

/*
 *  Index outpoints and scripthashes
 *
 *  V -> db version
 *  o[hash][index] -> dummy (outpoint)
 *  s[hash] -> script (script)
 *
 */

const layout = {
  V: bdb.key('V'),
  o: bdb.key('o', ['hash256', 'uint32']),
  s: bdb.key('s', ['hash', 'buffer'])
};

/*
 * Expose
 */

module.exports = layout;
