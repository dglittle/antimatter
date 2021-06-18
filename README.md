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

