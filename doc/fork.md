# Database forking

Swarm is a sync-centric database system, where every database is expected to exist in numerous replicas.
Similarly to the Unix process model, the only correct way to create a new replica is to *fork* an existing one.
The newly created copy will keep the parent as its *upstream*.
A replica can only initiate a connection to its upstream and accept connections from downstream replicas.
Downstream replicas may inherit all of the parent’s data, some part of it, or nothing.
A fork's behavior may vary depending on its *role*.
Roles are: Downstream, Shard, Ring, Slave, Switch, or sometimes a mix of those).

Let’s suppose we have a root copy of a database named `data`. Its handshake is `/Swarm#data!mytime+swarm.on`.
Note that `swarm` is our «root» replica.

## Client

The most common case of forking is to create a client's replica.
Suppose, a client connects to our server to become a part of our replica tree.
The operation order at the client is (potentially) different from the server because the client may work offline and even if connected it may generate concurrent ops.
Hence, the downstream gets a new replica identifier.
The identifier reflects the structure of the tree tree; it is tree path-like, using tilde as a separator.
In our case of a single root server, the fourth downstream replica created for a user named `gritzko` will likely be named `swarm˜gritzko˜4` (full tree form).
By convention, we abbreviate that to `gritzko˜4` (it’s annoying to mention `swarm` in every timestamp).
Hence, the new replica’s handshake is `/Swarm+Client#data!mytime+gritzko˜4.on`.

Typically, downstream replicas are created empty, but it is possible to clone all the data to a new replica or bootstrap it with some subset.
The latter is quite handy for server-side rendering and client-side rehydration.

Note that our naming convention "creates" a virtual replica named `swarm˜gritzko`, which does not actually exist.
That virtual upstream for `swarm˜gritzko˜4` is made with the sole purpose of mentioning the user id in the replica id.
We may do just fine with `swarm˜27zK` or something.
We may also use `swarm˜mycompany˜myname˜serial` or any other convention as long as de-facto upstream-downstream relations fit into the de-jure replica identifier tree.

### Clone

A Clone is a Client in all respects, except it is subscribed to all of the database by default.
A Client is subscribed to nothing initially, so it needs to issue upstream subscriptions on per-object basis.

## Shard

Suppose, one process/server can no longer handle the entire database.
Such a database needs to be *sharded* then.
In such a case, a fork inherits a part of the data (by default, one half).
Shards cover different subsets of objects, so their clocks can not conflict.
Hence, they are still considered logically the same replica named `swarm`.
The parent's handshake changes to `/Swarm+Shard#data+00W0!mytime+swarm.on` and the child has `/Swarm+Shard#data+W0˜˜!mytime+swarm.on`.
Note that the name of a database is extended with Base64 hash value ranges, `[00,W0)` and `[W0,˜˜)`.
A new shard may be bootstrapped with all the parent's data or it may incrementally download data from the upstream, depending on conditions.

## Switch

Those shards must reside behind a *switch* replica that forwards all the incoming object subscriptions to proper shards.
Its handshake is `/Swarm+Switch#data!mytime+swarm.on`.
Switches are stateless and transparent, so there can be any number of them.
Switches maintain subscription tables and multiplex ops, but they have no own storage and no own op order.
Differently from all other roles, a switch has many upstream replicas, namely an array of Shards covering the entire key space.
On the other hand, we already agreed that shards are parts of the same replica, so logically there is one upstream.
Once a shard forks off a new child shard, it notifies its downstream switches, so reconfiguration is fully dynamic.

## Ring

Let’s suppose we want to create geo-distributed copies of our database.
Replicas sync to each other continuously, but they must also keep working if disconnected.
In such a case, replicas will have independent clocks and independent local operation orders.
Hence, we cannot treat them like they are shards of the same replica.
Let’s call those *rings*.
Rings get their own replica identifiers: `swarm˜1` and `swarm˜2`.
So, the former root database becomes their *virtual* upstream.
In fact, they use each other as their upstream.
If we’ll make three rings, they will form a circular chain (1>2>3>1). If one ring dies, the rest still form a connected chain and synchronize all the changes.
Their handshakes are: `/Swarm+Ring#data!mytime+˜1.on`, `/Swarm+Ring#data!mytime+˜2.on` and so on.

Rings have different local operation orders. Hence, a client that was forked from one ring can not re-synchronize to another. Our end-user replica identifiers will look like `˜2˜gritzko˜4` (full form `swarm˜2˜gritzko˜4`).

## Slave

Sometimes we need to scale reads in our local cluster.
We want any client to be able to sync with any of our local copies, so we need identical operation orders.
Hence, we resort to the classic master-slave architecture: we attach several *slaves* to a master, quite likely in a chain formation.
All reads are done locally at a slave, while all the writes are forwarded to the master first.
Slaves have the master as their upstream replica, so they save and relay new ops in exactly the same order as the master.

Slave handshakes look exactly like their master’s except for a different role, e.g.
* `/Swarm+Slave#data!mytime+swarm.on` (slave of the root replica) or
* `/Swarm+RingSlave#data!mytime+˜1.on` (mixed role, slave of a ring) or
* `/Swarm+ShardRingSlave#data+W0˜˜!mytime+˜1.on` (wow, slave of a shard ring),
* `/Swarm+ShardRingSlaveSlave#data+W0˜˜!mytime+˜1.on` (unbelievable, a slave of a slave of a shard ring).

It may sound like a difficulty that shard rings have to synchronize to shard rings with equal ranges.
The single-upstream replica tree structure simplifies everything so much that it is definitely worth the effort.

## Components

Internal components can talk dialects of the protocol too.
In such a case those can be understood as "forks" of a local replica.
For example, a Client replica itself only manages op logs, while API objects are created by a "host" that can be attached to the replica locally or use a network connection.
Similarly, a storage engine is separated into a subsystem speaking a dialect of the same protocol.

Such "local" forks have same replica id and same database name as the replica.
They use a replica's clocks or use none.
By convention, local component roles are lowercase, like `host` or `level`.
In some case, components need to use their own clocks (like a host connected by the network).
Then, they get an uppercase role, their own replica id and clocks.