
(() => {
    var sync8 = {}
    if (typeof module != 'undefined') module.exports = sync8

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
