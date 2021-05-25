# antimatter

antimatter: a pruning JSON CRDT.

# `antimatter.create(self, send)`

create a new antimatter instance.

# `self.read(is_anc)`

read the contents of this JSON CRDT as a regular json datastructure.

# `self.set(...patches)`

modify the contents of this JSON CRDT.

# `self.get(peer)`

connect with the given peer.

# `self.forget(peer)`

disconnect from the given peer, and don't save information necessary for reconnecting.

# `self.disconnect(peer)`

tell the antimatter object that the given peer has disconnected, which will generate a so-called "fissure" object to remember the information necessary to reconnect with this peer in the future.

# `self.receive({cmd, version, parents, patches, fissure, versions, fissures, unack_boundary, min_leaves, peer, conn})`

give this antimatter object the argument passed to the `send` callback of another antimatter object.
