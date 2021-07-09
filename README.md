# antimatter: a pruning JSON CRDT.

`var {antimatter, sync9, sync8} = require('@glittle/antimatter')`

antimatter is a peer-to-peer network algorithm that keeps track of what can be pruned in a sync9 data structure, in order for peers to still be able to reconnect with each other and merge their changes. antimatter is implemented as a subclass of sync9, so an antimatter object is a sync9 object with additional methods.

sync9 is a pruneable JSON CRDT -- JSON meaning it represents an arbitrary JSON datstructure, CRDT meaning this structure can be merged with other ones, and pruneable meaning that the meta-data necessary for this merging can also be removed when it is no longer needed (whereas CRDT's often keep track of this meta-data forever).

sync8 is a pruneable sequence CRDT -- sequence meaning it represents a javascript string or array, CRDT and pruneable having the same meaning as for sync9 above. sync9 makes recursive use of sync8 structures to represent arbitrary JSON (for instance, a map is represented with a sync8 structure for each value, where the first element in the sequence is the value).

# API

# antimatter.create(send[, init])
creates and returns a new antimatter object (or adds stuff to `init`)
* `send`: a callback function to be called whenever this antimatter wants to send a message to a peer antimatter. the function takes two parameters: (peer, message), where "peer" is a string id of the peer to send to, and "message" is a javascript object to send to them, where ultimately we want to call "receive" on the target peer, and pass it "message" as a parameter.
* `init`: (optional) an antimatter object to start with, which we'll add any properties to that it doesn't have, and we'll add all the antimatter methods to it, created to be able to serialize an antimatter instance as JSON, and then restore it later

``` js
var antimatter_instance = antimatter.create((peer, msg) => {
    websockets[peer].send(JSON.stringify(msg))
}, JSON.parse(fs.readFileSync('./antimatter.backup')))
```

# antimatter.receive(message)
let this antimatter object "receive" a message from another antimatter object, presumably from its `send` callback

``` js
websocket.on('message', data => {
    antimatter_instance.receive(JSON.parse(data))
});
```

# message

you generally do not need to mess with a message object directly, but here are the keys that may be present -- these keys are described in more detail below:

``` js
{
    cmd,
    version, 
    parents,
    patches,
    fissure,
    unack_boundary,
    min_leaves,
    peer,
    conn
}
```

* `cmd`: any of the following strings:
    * `get`: first message sent to a newly connected peer
    * `get_back`: sent in response to `get`
    * `forget`: used to disconnect without creating a fissure
    * `forget_ack`: sent in response to `forget`
    * `disconnect`: issued when we detect that a peer has disconnected
    * `fissure`: sent to alert peers about a fissure
    * `set`: sent to alert peers about a change in the document
    * `ack1`: sent in response to `set`, but not right away; a peer will first send the `set` to all its other peers, and only after they have all responded with `ack1` will the peer send `ack1` to the originating peer
    * `ack2`: sent after an originating peer has received `ack1` from all its peers
    * `welcome`: sent in response to a `get`, basically contains the initial state of the document
* `version`: some unique id
* `parents`: set of parent versions represented as a map with version keys and true values
* `patches`: array of patches, where each patch is an object like this: `{range: '.json.path', content: 'value'}`
* `fissure`: a fissure object, which looks like this: `{a, b, conn, versions, time}`, where:
    * `a`: peer id of peer on one side of disconnection
    * `b`: peer id of peer on other side of disconnection
    * `conn`: connection id
    * `versions`: set of versions to protect, represented as a map with version keys and true values
    * `time`: fissure creation time, as milliseconds since UNIX epoc
* `unack_boundary`: set of versions, represented as a map with version keys and true values; used in a welcome message; if any of these versions, or any of their ancestors, were marked as being acknowledge by everyone, then un-mark them as such.. this is meant to deal with the issue of a peer disconnecting during the connection process itself, in which case we'll want to include these "unack" versions in the fissure
* `min_leaves`: set of versions, represented as a map with version keys and true values; used in a welcome message; these versions and their ancestors are NOT unacknowledged, even if they are behind the unack_boundary
* `peer`: the peer who sent the message
* `conn`: the id of the connection over which the message was sent

# antimatter_instance.get/connect(peer)
triggers this antimatter object to send a `get` message to the given peer

``` js
alice_antimatter_instance.get('bob')
```

# antimatter_instance.forget(peer)
disconnect from the given peer without creating a fissure -- we don't need to reconnect with them.. it seems

``` js
alice_antimatter_instance.forget('bob')
```

# antimatter_instance.disconnect(peer)
if we detect that a peer has disconnected, let the antimatter object know by calling this method with the given peer -- this will create a fissure so we can reconnect with this peer if they come back

``` js
alice_antimatter_instance.disconnect('bob')
```

# antimatter_instance.set(...patches)
modify this antimatter object by applying the given patches. each patch looks like `{range: '.life.meaning', content: 42}`. calling this method will trigger calling the `send` callback to let our peers know about this change.

``` js
antimatter_instance.set({range: '.life.meaning', content: 42})
```

---

# sync9.create([init])
create a new sync9 object (or start with `init`, and add stuff to that).

``` js
var sync9_instance = sync9.create()
```

# sync9_instance.read()
returns an instance of the json object represented by this sync9 data-structure

``` js
JSON.stringify(sync9_instance.read())
```

# sync9_instance.generate_braid(versions)
returns a list of `set` messages necessary to reconstruct the data in this sync9 datastructure, assuming the recipient already has the given `versions` (which is represented as an object where each key is a version, and each value is `true`).

``` js
sync9_instance.generate_braid({alice2: true, bob3: true})
```

# sync9_instance.apply_bubbles(to_bubble)
this method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions -- these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble; "bottom" and "top" make sense when viewing versions in a directed graph with the oldest version(s) at the top, and each version pointing up to it's parents. a bubble is then a set of versions where the only arrows leaving the bubble upward are from the "top" version, and the only arrows leaving the bubble downward are from the "bottom" version. this method effectively combines all the versions in a bubble into a single version, and may allow the data structure to be compressed, since now we don't need to distinguish between certain versions that we used to need to

``` js
sync9_instance.apply_bubbles({alice4: ['bob5', 'alice4'], bob5: ['bob5', 'alice4']})
```

# sync9_instance.add_version(version, parents, patches[, sort_keys])
the main method for modifying a sync9 data structure.
* `version`: unique string associated with this edit
* `parents`: a set of versions that this version is aware of, represented as a map with versions as keys, and values of true
* `patches`: an array of patches, where each patch is an object like this `{range: '.life.meaning', content: 42}`
* `sort_keys`: (optional) an object where each key is an index, and the value is a sort_key to use with the patch at the given index in the `patches` array -- a sort_key overrides the version for a patch for the purposes of sorting.. this can be useful after doing some pruning.

``` js
sync9_instance.add_version('alice6',
    {alice5: true, bob7: true},
    [{range: '.a.b', content: 'c'}])
```

# sync9_instance.ancestors(versions, ignore_nonexistent=false)
gather `versions` and all their ancestors into a set. `versions` is a set of versions, i.e. a map with version-keys and values of true -- we'll basically return a larger set. if `ignore_nonexistent` is `true`, then we won't throw an exception if we encounter a version that we don't have in our datastructure.

``` js
sync9_instance.ancestors({alice12: true, bob10: true})
```

# sync9_instance.get_leaves(versions)



        self.get_leaves = versions => {
            var leaves = {...versions}
            Object.keys(versions).forEach(v => {
                Object.keys(self.T[v]).forEach(p => delete leaves[p])
            })
            return leaves
        }

        self.parse_patch = patch => {
            let x = self.parse_json_path(patch.range)
            x.value = patch.content
            return x
        }

        self.parse_json_path = json_path => {
            var ret = { path : [] }
            var re = /^(delete)\s+|\.?([^\.\[ =]+)|\[((\-?\d+)(:\-?\d+)?|"(\\"|[^"])*")\]/g
            var m
            while (m = re.exec(json_path)) {
                if (m[1]) ret.delete = true
                else if (m[2]) ret.path.push(m[2])
                else if (m[3] && m[5]) ret.slice = [JSON.parse(m[4]), JSON.parse(m[5].substr(1))]
                else if (m[3]) ret.path.push(JSON.parse(m[3]))
            }
            return ret
        }

        return self
    }

    sync8.create_node = (version, elems, end_cap, sort_key) => ({
        version : version,
        sort_key : sort_key,
        elems : elems,
        deleted_by : {},
        end_cap : end_cap,
        nexts : [],
        next : null
    })

    sync8.generate_braid = (S, version, is_anc) => {
        var splices = []

        function add_ins(offset, ins, sort_key, end_cap) {
            if (typeof(ins) !== 'string')
                ins = ins.map(x => read_raw(x, () => false))
            if (splices.length > 0) {
                var prev = splices[splices.length - 1]
                if (prev[0] + prev[1] === offset && !end_cap && (prev[4] === 'i' || (prev[4] === 'r' && prev[1] === 0))) {
                    prev[2] = prev[2].concat(ins)
                    return
                }
            }
            splices.push([offset, 0, ins, sort_key, end_cap ? 'r' : 'i'])
        }

        function add_del(offset, del, ins) {
            if (splices.length > 0) {
                var prev = splices[splices.length - 1]
                if (prev[0] + prev[1] === offset && prev[4] !== 'i') {
                    prev[1] += del
                    return
                }
            }
            splices.push([offset, del, ins, null, 'd'])
        }
        
        var offset = 0
        function helper(node, _version, end_cap) {
            if (_version === version) {
                add_ins(offset, node.elems.slice(0), node.sort_key, end_cap)
            } else if (node.deleted_by[version] && node.elems.length > 0) {
                add_del(offset, node.elems.length, node.elems.slice(0, 0))
            }
            
            if ((!_version || is_anc(_version)) && !Object.keys(node.deleted_by).some(is_anc)) {
                offset += node.elems.length
            }
            
            node.nexts.forEach(next => helper(next, next.version, node.end_cap))
            if (node.next) helper(node.next, _version)
        }
        helper(S, null)
        splices.forEach(s => {
            // if we have replaces with 0 deletes,
            // make them have at least 1 delete..
            // this can happen when there are multiple replaces of the same text,
            // and our code above will associate those deletes with only one of them
            if (s[4] === 'r' && s[1] === 0) s[1] = 1
        })
        return splices
    }

    sync8.apply_bubbles = (S, to_bubble) => {

        sync8.traverse(S, () => true, node => {
            if (to_bubble[node.version] && to_bubble[node.version][0] != node.version) {
                if (!node.sort_key) node.sort_key = node.version
                node.version = to_bubble[node.version][0]
            }

            for (var x of Object.keys(node.deleted_by)) {
                if (to_bubble[x]) {
                    delete node.deleted_by[x]
                    node.deleted_by[to_bubble[x][0]] = true
                }
            }
        }, true)

        function set_nnnext(node, next) {
            while (node.next) node = node.next
            node.next = next
        }

        do_line(S, S.version)
        function do_line(node, version) {
            var prev = null
            while (node) {
                if (node.nexts[0] && node.nexts[0].version == version) {
                    for (let i = 0; i < node.nexts.length; i++) {
                        delete node.nexts[i].version
                        delete node.nexts[i].sort_key
                        set_nnnext(node.nexts[i], i + 1 < node.nexts.length ? node.nexts[i + 1] : node.next)
                    }
                    node.next = node.nexts[0]
                    node.nexts = []
                }

                if (node.deleted_by[version]) {
                    node.elems = node.elems.slice(0, 0)
                    node.deleted_by = {}
                    if (prev) { node = prev; continue }
                }

                var next = node.next

                if (!node.nexts.length && next && (!node.elems.length || !next.elems.length || (Object.keys(node.deleted_by).every(x => next.deleted_by[x]) && Object.keys(next.deleted_by).every(x => node.deleted_by[x])))) {
                    if (!node.elems.length) node.deleted_by = next.deleted_by
                    node.elems = node.elems.concat(next.elems)
                    node.end_cap = next.end_cap
                    node.nexts = next.nexts
                    node.next = next.next
                    continue
                }

                for (let n of node.nexts) do_line(n, n.version)

                prev = node
                node = next
            }
        }
    }

    sync8.get = (S, i, is_anc) => {
        var ret = null
        var offset = 0
        sync8.traverse(S, is_anc ? is_anc : () => true, (node) => {
            if (i - offset < node.elems.length) {
                ret = node.elems[i - offset]
                return false
            }
            offset += node.elems.length
        })
        return ret
    }

    sync8.set = (S, i, v, is_anc) => {
        var offset = 0
        sync8.traverse(S, is_anc ? is_anc : () => true, (node) => {
            if (i - offset < node.elems.length) {
                if (typeof node.elems == 'string') node.elems = node.elems.slice(0, i - offset) + v + node.elems.slice(i - offset + 1)
                else node.elems[i - offset] = v
                return false
            }
            offset += node.elems.length
        })
    }

    sync8.length = (S, is_anc) => {
        var count = 0
        sync8.traverse(S, is_anc ? is_anc : () => true, node => {
            count += node.elems.length
        })
        return count
    }

    sync8.break_node = (node, x, end_cap, new_next) => {
        var tail = sync8.create_node(null, node.elems.slice(x), node.end_cap)
        Object.assign(tail.deleted_by, node.deleted_by)
        tail.nexts = node.nexts
        tail.next = node.next
        
        node.elems = node.elems.slice(0, x)
        node.end_cap = end_cap
        node.nexts = new_next ? [new_next] : []
        node.next = tail

        return tail
    }

    sync8.add_version = (S, version, splices, sort_key, is_anc) => {

        var rebased_splices = []
        
        function add_to_nexts(nexts, to) {
            var i = binarySearch(nexts, function (x) {
                if ((to.sort_key || to.version) < (x.sort_key || x.version)) return -1
                if ((to.sort_key || to.version) > (x.sort_key || x.version)) return 1
                return 0
            })
            nexts.splice(i, 0, to)
        }
        
        var si = 0
        var delete_up_to = 0
        
        var process_patch = (node, offset, has_nexts, prev, _version, deleted) => {
            var s = splices[si]
            if (!s) return false
            
            if (deleted) {
                if (s[1] == 0 && s[0] == offset) {
                    if (node.elems.length == 0 && !node.end_cap && has_nexts) return
                    var new_node = sync8.create_node(version, s[2], null, sort_key)

                    rebased_splices.push([rebase_offset, 0, s[2]])

                    if (node.elems.length == 0 && !node.end_cap)
                        add_to_nexts(node.nexts, new_node)
                    else
                        sync8.break_node(node, 0, undefined, new_node)
                    si++
                }
                return            
            }
            
            if (s[1] == 0) {
                var d = s[0] - (offset + node.elems.length)
                if (d > 0) return
                if (d == 0 && !node.end_cap && has_nexts) return
                var new_node = sync8.create_node(version, s[2], null, sort_key)

                rebased_splices.push([rebase_offset + s[0] - offset, 0, s[2]])

                if (d == 0 && !node.end_cap) {
                    add_to_nexts(node.nexts, new_node)
                } else {
                    sync8.break_node(node, s[0] - offset, undefined, new_node)
                }
                si++
                return
            }
            
            if (delete_up_to <= offset) {
                var d = s[0] - (offset + node.elems.length)
                if (d >= 0) return
                delete_up_to = s[0] + s[1]
                
                if (s[2]) {
                    var new_node = sync8.create_node(version, s[2], null, sort_key)

                    rebased_splices.push([rebase_offset + s[0] - offset, 0, s[2]])

                    if (s[0] == offset && prev && prev.end_cap) {
                        add_to_nexts(prev.nexts, new_node)
                    } else {
                        sync8.break_node(node, s[0] - offset, true, new_node)
                        return
                    }
                } else {
                    if (s[0] == offset) {
                    } else {
                        sync8.break_node(node, s[0] - offset)
                        return
                    }
                }
            }
            
            if (delete_up_to > offset) {
                if (delete_up_to <= offset + node.elems.length) {
                    if (delete_up_to < offset + node.elems.length) {
                        sync8.break_node(node, delete_up_to - offset)
                    }
                    si++
                }
                node.deleted_by[version] = true

                rebased_splices.push([rebase_offset, node.elems.length, ''])

                return
            }
        }
        
        var f = is_anc || (() => true)
        var exit_early = {}
        var offset = 0
        var rebase_offset = 0
        function traverse(node, prev, version) {
            var rebase_deleted = Object.keys(node.deleted_by).length > 0
            if (!version || f(version)) {
                var has_nexts = node.nexts.find(next => f(next.version))
                var deleted = Object.keys(node.deleted_by).some(version => f(version))
                if (process_patch(node, offset, has_nexts, prev, version, deleted) == false) throw exit_early
                if (!deleted) offset += node.elems.length
            }
            if (!rebase_deleted) rebase_offset += node.elems.length

            for (var next of node.nexts) traverse(next, null, next.version)
            if (node.next) traverse(node.next, node, version)
        }
        try {
            traverse(S, null, S.version)
        } catch (e) {
            if (e != exit_early) throw e
        }

        return rebased_splices
    }

    sync8.traverse = (S, f, cb, view_deleted, tail_cb) => {
        var exit_early = {}
        var offset = 0
        function helper(node, prev, version) {
            var has_nexts = node.nexts.find(next => f(next.version))
            var deleted = Object.keys(node.deleted_by).some(version => f(version))
            if (view_deleted || !deleted) {
                if (cb(node, offset, has_nexts, prev, version, deleted) == false)
                    throw exit_early
                offset += node.elems.length
            }
            for (var next of node.nexts)
                if (f(next.version)) helper(next, null, next.version)
            if (node.next) helper(node.next, node, version)
            else if (tail_cb) tail_cb(node)
        }
        try {
            helper(S, null, S.version)
        } catch (e) {
            if (e != exit_early) throw e
        }
    }

    // modified from https://stackoverflow.com/questions/22697936/binary-search-in-javascript
    function binarySearch(ar, compare_fn) {
        var m = 0;
        var n = ar.length - 1;
        while (m <= n) {
            var k = (n + m) >> 1;
            var cmp = compare_fn(ar[k]);
            if (cmp > 0) {
                m = k + 1;
            } else if(cmp < 0) {
                n = k - 1;
            } else {
                return k;
            }
        }
        return m;
    }
})()







# 

sync9 is a pruneable JSON CRDT -- JSON meaning it represents an arbitrary JSON datstructure, CRDT meaning this structure can be merged with other ones, and pruneable meaning that the meta-data necessary for this merging can also be removed when it is no longer needed (whereas CRDT's often keep track of this meta-data forever).

sync8 is a pruneable sequence CRDT -- sequence meaning it represents a javascript string or array, CRDT and pruneable having the same meaning as for sync9 above. sync9 makes recursive use of sync8 structures to represent arbitrary JSON (for instance, a map is represented with a sync8 structure for each value, where the first element in the sequence is the value).

# API

# antimatter.create(send[, init])
creates and returns a new antimatter object (or adds antimatter methods and properties to `init`)
* `send`: a callback function to be called whenever this antimatter wants to send a message to a peer antimatter. the function takes two parameters: `peer`, and `message`, where `peer` is a string id of the peer to send to, and `message` is a javascript object to send to them, where ultimately we want to call `receive` on the target peer, and pass it `message` as a parameter.
* `init`: (optional) an antimatter object to start with, which we'll add any properties to that it doesn't have, and we'll add all the antimatter methods to it. this option exists so you can serialize an antimatter instance as JSON, and then restore it later.

``` js
var antimatter_instance = antimatter.create((peer, msg) => {
    websockets[peer].send(JSON.stringify(msg))
}, JSON.parse(fs.readFileSync('./antimatter.backup')))
```

# antimatter.receive(message)
let this antimatter object "receive" a message from another antimatter object, presumably from its `send` callback

``` js
websocket.on('message', data => {
    antimatter_instance.receive(JSON.parse(data))
});
```

# message

you generally do not need to mess with a message object directly, but here are the keys that may be present -- these keys are described in more detail below:

``` js
{
    cmd,
    version, 
    parents,
    patches,
    fissure,
    unack_boundary,
    min_leaves,
    peer,
    conn
}
```

* `cmd`: any of the following strings:
    * `get`: first message sent to a newly connected peer
    * `get_back`: sent in response to `get`
    * `forget`: used to disconnect without creating a fissure
    * `forget_ack`: sent in response to `forget`
    * `disconnect`: issued when we detect that a peer has disconnected
    * `fissure`: sent to alert peers about a fissure
    * `set`: sent to alert peers about a change in the document
    * `ack1`: sent in response to `set`, but not right away; a peer will first send the `set` to all its other peers, and only after they have all responded with `ack1` will the peer send `ack1` to the originating peer
    * `ack2`: sent after an originating peer has received `ack1` from all its peers
    * `welcome`: sent in response to a `get`, basically contains the initial state of the document
* `version`: some unique id
* `parents`: set of parent versions represented as a map with version keys and true values
* `patches`: array of patches, where each patch is an object like this: `{range: '.json.path', content: 'value'}`
* `fissure`: a fissure object, which looks like this: `{a, b, conn, versions, time}`, where:
    * `a`: peer id of peer on one side of disconnection
    * `b`: peer id of peer on other side of disconnection
    * `conn`: connection id
    * `versions`: set of versions to protect, represented as a map with version keys and true values
    * `time`: fissure creation time, as milliseconds since UNIX epoc
* `unack_boundary`: set of versions, represented as a map with version keys and true values; used in a welcome message; if any of these versions, or any of their ancestors, were marked as being acknowledge by everyone, then un-mark them as such.. this is meant to deal with the issue of a peer disconnecting during the connection process itself, in which case we'll want to include these "unack" versions in the fissure
* `min_leaves`: set of versions, represented as a map with version keys and true values; used in a welcome message; these versions and their ancestors are NOT unacknowledged, even if they are behind the unack_boundary
* `peer`: the peer who sent the message
* `conn`: the id of the connection over which the message was sent (useful for disambiguating fissures between the same peers)

# antimatter_instance.get(peer) or connect(peer)
connect to the given peer -- triggers this antimatter object to send a `get` message to the given peer

``` js
alice_antimatter_instance.get('bob')
```

# antimatter_instance.forget(peer)
disconnect from the given peer without creating a fissure -- we don't need to reconnect with them.. it seems.. if we do, then we need to call disconnect instead, which will create a fissure allowing us to reconnect.

``` js
alice_antimatter_instance.forget('bob')
```

# antimatter_instance.disconnect(peer)
if we detect that a peer has disconnected, let the antimatter object know by calling this method with the given peer -- this will create a fissure so we can reconnect with this peer if they come back

``` js
alice_antimatter_instance.disconnect('bob')
```

# antimatter_instance.set(...patches)
modify this antimatter object by applying the given patches. each patch looks like `{range: '.life.meaning', content: 42}`. calling this method will trigger calling the `send` callback to let our peers know about this change.

``` js
antimatter_instance.set({range: '.life.meaning', content: 42})
```

---

# sync9.create([init])
create a new sync9 object (or start with `init`, and add stuff to that).

``` js
var sync9_instance = sync9.create()
```

# sync9_instance.read()
returns an instance of the json object represented by this sync9 data-structure

``` js
console.log(sync9_instance.read())
```

# sync9_instance.generate_braid(versions)
returns an array of `set` messages that each look like this: `{version, parents, patches, sort_keys}`, such that if we pass all these messages to an antimatter's `receive` method, we'll reconstruct the data in this sync9 datastructure, assuming the recipient already has the given `versions` (which is represented as an object where each key is a version, and each value is `true`).

``` js
sync9_instance.generate_braid({alice2: true, bob3: true})
```

# sync9_instance.apply_bubbles(to_bubble)
this method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions -- these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble; "bottom" and "top" make sense when viewing versions in a directed graph with the oldest version(s) at the top, and each version pointing up to it's parents. a bubble is then a set of versions where the only arrows leaving the bubble upward are from the "top" version, and the only arrows leaving the bubble downward are from the "bottom" version. this method effectively combines all the versions in a bubble into a single version, and may allow the data structure to be compressed, since now we don't need to distinguish between certain versions that we used to need to.

``` js
sync9_instance.apply_bubbles({alice4: ['bob5', 'alice4'], bob5: ['bob5', 'alice4']})
```

# sync9_instance.add_version(version, parents, patches[, sort_keys])
the main method for modifying a sync9 data structure.
* `version`: unique string associated with this edit.
* `parents`: a set of versions that this version is aware of, represented as a map with versions as keys, and values of `true`.
* `patches`: an array of patches, where each patch is an object like this `{range: '.life.meaning', content: 42}`
* `sort_keys`: (optional) an object where each key is an index, and the value is a sort_key to use with the patch at the given index in the `patches` array -- a sort_key overrides the version for a patch for the purposes of sorting.. this can be useful after doing some pruning.

``` js
sync9_instance.add_version('alice6',
    {alice5: true, bob7: true},
    [{range: '.a.b', content: 'c'}])
```

# sync9_instance.ancestors(versions, ignore_nonexistent=false)
gather `versions` and all their ancestors into a set. `versions` is a set of versions, i.e. a map with version-keys and values of true -- we'll basically return a larger set. if `ignore_nonexistent` is `true`, then we won't throw an exception if we encounter a version that we don't have in our datastructure.

``` js
sync9_instance.ancestors({alice12: true, bob10: true})
```

# sync9_instance.get_leaves(versions)
returns a set of versions from `versions` which don't also have a child in `versions`. `versions` is itself a set of versions, represented as an object with version keys and `true` values, and the return value is represented the same way.

# sync9_instance.parse_patch(patch)
takes a patch in the form `{range, content}`, and returns an object of the form `{path: [...], [slice: [...]], [delete: true], content}`; basically calling `parse_json_path` on `patch.range`, and adding `patch.content` along for the ride.

# sync9_instance.parse_json_path(json_path)
parses the string `json_path` into an object like: `{path: [...], [slice: [...]], [delete: true]}`.
* `a.b[3]` --> `{path: ['a', 'b', 3]}`
* `a.b[3:5]` --> `{path: ['a', 'b'], slice: [3, 5]}`
* `delete a.b` --> `{path: ['a', 'b'], delete: true}`

``` js
console.log(sync9_instance.parse_json_path('a.b.c'))
```

---

# sync8.create_node(version, elems, [end_cap, sort_key])
creates a node for a sync8 sequence CRDT with the given properties. the resulting node will look like this:

``` js
{
    version, // globally unique string
    elems, // a string or array representing actual data elements of the underlying sequence
    end_cap, // this is useful for dealing with replace operations
    sort_key, // version to pretend this is for the purposes of sorting
    deleted_by : {}, // if this node gets deleted, we'll mark it here
    nexts : [], // array of nodes following this one
    next : null // final node following this one (after all the nexts)
}

var sync8_node = sync8.create_node('alice1', 'hello')
```

# sync8.generate_braid(root_node, version, is_anc)
reconstructs an array of splice-information which can be passed to `sync8.add_version` in order to add `version` to another sync8 instance -- the returned array looks like: `[[insert_pos, delete_count, insert_elems, sort_key], ...]`. `is_anc` is a function which accepts a version string and returns `true` if and only if the given version is an ancestor of `version` (i.e. a version which the author of `version` knew about when they created that version).

``` js
var root_node = sync8.create_node('alice1', 'hello')
console.log(sync8.generate_braid(root_node, 'alice1', x => false)) // outputs [0, 0, "hello"]
```

# sync8.apply_bubbles(root_node, to_bubble)
this method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions -- these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble. we will rename the given version to the "bottom" of the bubble. "bottom" and "top" make sense when viewing versions in a directed graph with the oldest version(s) at the top, and each version pointing up to it's parents. a bubble is then a set of versions where the only arrows leaving the bubble upward are from the "top" version, and the only arrows leaving the bubble downward are from the "bottom" version. this method effectively combines all the versions in a bubble into a single version, and may allow the data structure to be compressed, since now we don't need to distinguish between certain versions that we used to need to.

``` js
sync8.apply_bubbles(root_node, {alice4: ['bob5', 'alice4'], bob5: ['bob5', 'alice4']})
```

# sync8.get(root_node, i, is_anc)
returns the element at the `i`th position (0-based) in the sequence rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.

``` js
var x = sync8.get(root_node, 2, {alice1: true})
```

# sync8.set(root_node, i, v, is_anc)
sets the element at the `i`th position (0-based) in the sequence rooted at `root_node` to the value `v`, when only considering versions which result in `true` when passed to `is_anc`.

``` js
sync8.set(root_node, 2, 'x', {alice1: true})
```

# sync8.length(root_node, is_anc)
returns the length of the sequence rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.

``` js
console.log(sync8.length(root_node, {alice1: true}))
```

# sync8.break_node(node, break_position, end_cap, new_next)
this methods breaks apart a sync8 node into two nodes, each representing a subsequence of the sequence represented by the original node; the `node` parameter is modified into the first node, and the second node is returned. the first node represents the elements of the sequence before `break_position`, and the second node represents the rest of the elements. if `end_cap` is truthy, then the first node will have `end_cap` set -- this is generally done if the elements in the second node are being replaced. this method will add `new_next` to the first node's `nexts` array.

``` js
var node = sync8.create_node('alice1', 'hello')
// node node.elems == 'hello'

var second = sync8.break_node(node, 2)
// now node.elems   == 'he',
// and second.elems == 'llo'
```

# sync8.add_version(root_node, version, splices, [is_anc])
this is the main method of sync8, used to modify the sequence. the modification must be given a unique `version` string, and the modification itself is represented as an array of `splices`, where each splice looks like this: `[position, num_elements_to_delete, elements_to_insert, optional_sort_key]`. note that all positions are relative to the original sequence, before any splices have been applied. positions are counted by only considering nodes with versions which result in `true` when passed to `is_anc` (and are not `deleted_by` any versions which return `true` when passed to `is_anc`).

``` js
var node = sync8.create_node('alice1', 'hello')
sync8.add_version(node, 'alice2', [[5, 0, ' world']], null, v => v == 'alice1')
```

# sync8.traverse(root_node, is_anc, callback, [view_deleted, tail_callback])
traverses the subset of nodes in the tree rooted at `root_node` whos versions return true when passed to `is_anc`. for each node, `callback` is called with these parameters: `node, offset, has_nexts, prev, version, deleted`, where `node` is the current node being traversed; `offset` says how many elements we have passed so far getting here; `has_nexts` is true if some of this node's `nexts` will be traversed according to `is_anc`; `prev` is a pointer to the node whos `next` points to this one, or `null` if this is the root node; `version` is the version of this node, or this node's `prev` if our version is `null`, or that node's `prev` if it is also `null`, etc; `deleted` is true if this node is deleted according to `is_anc` (usually we skip deleted nodes when traversing, but we'll include them if `view_deleted` is `true`). `tail_callback` is an optional callback that will get called with a single parameter `node` after all of that node's children `nexts` and `next` have been traversed.

``` js
sync8.traverse(node, () => true, node => process.stdout.write(node.elems))
```
