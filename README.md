# bcoin-relaylib

# Overview

Indexs data for relays and emits events over websockets.

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

# Configuration

New config options are added to configure the Relay Server.
Be sure to add these to the bcoin config file or pass them
along at runtime.

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

[bcoin](https://github.com/bcoin-org/bcoin) are licensed as follows:

```
This software is licensed under the MIT License.

Copyright (c) 2014-2015, Fedor Indutny (https://github.com/indutny)
Copyright (c) 2014-2019, Christopher Jeffrey (https://github.com/chjj)
Copyright (c) 2014-2019, bcoin Contributors (https://github.com/bcoin-org)
```
