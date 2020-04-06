# bcoin-relaylib

[bcoin](https://github.com/bcoin-org/bcoin) is an alternative implementation
of the Bitcoin Protocol used in production by [Purse.io](https://purse.io).

Indexes data that is useful for relays and emits events over websockets. Users
subscribe to transactions with certain characteristics, and receive
notifications when they occur.

This project is intended to serve the [OnDemandSPV](
https://github.com/summa-tx/relays/blob/master/solidity/contracts/OnDemandSPV.sol)
component of the Summa [relay project](https://github.com/summa-tx/relays).

# Overview

Register a `Request` with the server and be alerted when a particular
outpoint is consumed or a UTXO with a particular scriptPubKey is created.
This can be used to automate the creation of stateless SPV proofs.

# Usage

First clone the repository. `lib/plugin` can be used as
a `bcoin` plugin. The `bcoin/bin/node` script was copied
into `bin/node`. It additionally adds `lib/plugin` at
start.

```
$ ./bin/node
```

It is also possible to run this using the `--plugins`
flag with `bcoin`.

```
$ bcoin --plugins /path/to/bcoin-relaylib/lib/plugin
```

# HTTP API

- GET /relay
- GET /relay/latest/:maxID
- POST /relay/rescan
- GET /relay/outpoint/:hash/:index
- GET /relay/script/:script
- GET /relay/request/:id
- GET /relay/request
- PUT /relay/request
- DEL /relay/request
- DEL /relay

After adding a `Request`, the relay plugin will emit events via websocket when
the `Request` is fulfilled. Must include either the `pays` or `spends` keys or
both.

```js
const client = new RelayClient({
  host: '127.0.0.1'
  port: 8335
});

await client.putRequestRecord({
  // request id
  id: '0000000000000000000000000000000000000000000000000000000000000001',
  // ethereum address
  address: '0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c',
  // threshold value in sats
  value: 100,
  // a scriptPubKey, without its length-prefix
  pays: '76a914ba507bae8f1643d2556000ca26b9301b9069dc6b88ac',
  // an outpoint
  spends: {
    hash: 'fa328a6c891fa2020cb2cfdfeaf79203bc073dd0ab76dee5f06c89f35b8f6dd4',
    index: 0
  },
  height: 1000, // optional rescan height
});
```

Hook into to the `'watch relay'` websocket topic to receive
updates as blocks are connected to the chain. They will be
broadcast on the `'relay requests satisfied'` event.
This can be done using the `RelayClient`.

```js
const client = new RelayClient({
  host: '127.0.0.1'
  port: 8335
});

await client.open();

client.bind('relay requests satisfied', (data) => {
  console.log(data);
  // {txid, height, satisfied: [requestIds]}
});
```

# Configuration

New config options are added to configure the Relay Server.
Be sure to add these to the bcoin config file or pass them
along at runtime. See the [bcoin config docs](https://github.com/bcoin-org/bcoin/blob/master/docs/configuration.md).

```
relay-ssl: boolen,
relay-ssl-key: /path/to/key
relay-ssl-cert: /path/to/cert
relay-http-host: string
relay-http-port: uint
relay-api-key: string
relay-no-auth: bool
relay-cors: bool
```

# Dependencies

[bcoin](https://github.com/bcoin-org/bcoin) is licensed as follows:

```
This software is licensed under the MIT License.

Copyright (c) 2014-2015, Fedor Indutny (https://github.com/indutny)
Copyright (c) 2014-2019, Christopher Jeffrey (https://github.com/chjj)
Copyright (c) 2014-2019, bcoin Contributors (https://github.com/bcoin-org)
```
