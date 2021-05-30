<a href="https://glittle.org">blah</a>

antimatter: a pruning JSON CRDT.

`var {antimatter, sync9, sync8} = require('@glittle/antimatter')`

API

``` js
var antimatter_instance = antimatter.create(
    send, // this function will get called when this antimatter
          // wants to send a message to a peer antimatter,
          // the function takes two paramters: (peer, message),
          // where "peer" is a string id of the peer to send to,
          // and "message" is a javascript object to send to them

    init  // this is an antimatter object to start with,
          // which we'll add any properties to that it doesn't have,
          // and we'll add all the antimatter methods to it
)
```

``` js
antimatter_instance.get or connect(
    peer // string id of the peer we want to connect to;
         // this method will trigger calling "send" with this peer
)
```

``` js
antimatter_instance.forget(
    peer // string id of the peer we want to disconnect with,
         // without creating a fissure
)
```

``` js
antimatter_instance.disconnect(
    peer // string id of the peer we disconnected with;
         // this will create a fissure to remember how to reconnect
         // with this peer
)
```

``` js
antimatter_instance.set(
    ...patches // each patch is an object like this {range: '.life.meaning', content: 42};
               // this method will apply the patches, and send them to
               // our peers (using the "send" method passed to "create")
)
```

``` js
antimatter_instance.receive(
    message // an object passed to another antimatter's "send" callback
)
```

``` js
var sync9_instance = sync9.create(
    init  // this is a sync9 object to start with,
          // which we'll add any properties to that it doesn't have,
          // and we'll add all the sync9 methods to it
)
```

``` js
sync9_instance.read() // returns an instance of the json object
                      // represented by this sync9 data-structure
```

``` js
sync9_instance.generate_braid(
    versions // set of versions; we want a list of edit operations since these versions
             // (each key is a version, and it's value is "true")

) // returns a list of "set" messages necessary to reconstruct the data,
  // assuming the recipient already has the given versions
```

``` js
sync9_instance.apply_bubbles(
    to_bubble // map where keys are versions and values are "bubbles",
              // each bubble represented with an array of two elements,
              // the first element is the "bottom" of the bubble,
              // and the second element is the "top" of the bubble;
              // "bottom" and "top" make sense when viewing versions
              // in a directed graph with the oldest version(s) at the top,
              // and each version pointing up to it's parents.
              // a bubble is then a set of versions where the only
              // arrows leaving the bubble upward are from the "top" version,
              // and the only arrows leaving the bubble downward are
              // from the "bottom" version.
              // this method effectively combines all the versions in a bubble
              // into a single version, and may allow the datastructure
              // to be compressed, since now we don't need to
              // distinguish between certain versions that we used to need to
)
```

``` js
sync9_instance.add_version(
    version,   // unique string associated with this edit
    parents,   // a set of versions that this version is aware of,
               // represented as a map with versions as keys, and values of true
    patches,   // an array of patches, where each patch is an object
               // like this {range: '.life.meaning', content: 42}
    sort_keys, // (optional) an object where each key is an index,
               // and the value is a sort_key to use with the patch
               // at the given index in the "patches" array --
               // a sort_key overrides the version for a patch
               // for the purposes of sorting..
               // this situation can arise when pruning
)
```

``` js
sync9_instance.ancestors(
    versions, // set of versions (map with version-keys and values of true);
              // we will return a set of versions which includes all these,
              // as well as all their ancestors
              // (their parents, and parents' parents, etc..) 
    ignore_nonexistent, // boolean: true to supress throwing an error
                        // when encountering a version which we don't have,
                        // e.g. if we don't have one of the parents of a version
)
```







# sync8

sync8 is a sequence-CRDT, which is a syncronizable list. A sync8 datastructure is a tree, and you can uncover the list by traversing the tree in pre-order.

This api consists of a set of global functions which operate on these trees, usually accepting a pointer to the root of the tree as a first parameter.

The api supports both javascript arrays and strings.

# datastructure

Here is an example sync8 node:
``` js
{
    version: "root", // id associated with node
    elems: "original document content.", // content, could be an array
    deleted_by: {"version_42": true}, // i guess the content is deleted
    end_cap: null, // used to support replaces
    nexts: [{ // recursively nested sync8 node..
        version: "version_42",
        elems: "NEW STUFF!",
        deleted_by: {}, // not deleted by anyone
        next: null
    }],
    next: null // a special child that always comes last, after the "nexts"
}
```

# methods

# `sync8.create_node`

simple
``` js
var S = sync8.create_node('root', 'hello world!')
```

verbose
``` js
sync8.create_node(
    version, // id associated with node
    elems, // content, could be a string or array
    end_cap, // you don't generally need to do this yourself,
             // but when this method is called internally,
             // this is used to help represent replaces
    sort_key // this is an advanced feature, used for "pruning",
             // but what it does is override the version for the purposes of sorting,
             // which can be useful for pruning, by allowing a
             // node to have a new version id, but still sort into the same
             // place as before.. anyway..
)
```

# `sync8.get`

simple
``` js
var S = sync8.create_node('root', 'hello world!')
var x = sync8.get(S, 6)
console.log(x) // w
```

verbose
``` js
sync8.get(
    S, // root node of sync8 tree (created from sync8.create_node)
    i, // index into list (0 based)
    is_anc, // a bit advanced.. a function that takes a version as input,
            // and returns true if we should traverse that version,
            // should we encounter it.. this let's us get the element
            // at a particular index of what the list looked like in the past.
            // the default is a function that always returns true.
)
```

# `sync8.set`

simple
``` js
var S = sync8.create_node('root', 'hello world!')
var x = sync8.set(S, 6, 'b')
// well.. now it says 'hello borld!'
```

verbose
``` js
sync8.set(
    S, // root node of sync8 tree (created from sync8.create_node)
    i, // index into list (0 based)
    v, // value to put at the given index
    is_anc, // a bit advanced.. a function that takes a version as input,
            // and returns true if we should traverse that version,
            // should we encounter it.. this let's us set the element
            // at a particular index of what the list looked like in the past.
            // the default is a function that always returns true.
)
```

# `sync8.length`

simple
``` js
var S = sync8.create_node('root', 'hello world!')
console.log(sync8.length(S)) // 12
```

verbose
``` js
sync8.set(
    S, // root node of sync8 tree (created from sync8.create_node)
    is_anc // a bit advanced.. a function that takes a version as input,
            // and returns true if we should traverse that version,
            // should we encounter it.. this let's us get the length
            // of what the list looked like in the past.
            // the default is a function that always returns true.
)
```

# `sync8.add_version`

this method is used to insert, delete, or replace stuff in the list.

simple
``` js
var S = sync8.create_node('root', 'hello world!')
sync8.add_version(S, 'v2', [[6, 5, 'globe']])
// now it says: hello globe!
```

verbose
``` js
sync8.add_version(
    S, // root node of sync8 tree (created from sync8.create_node)
    version, // id associated with node
    splices, // array of edits to make, each edit is itself an array,
             // that looks like this: [offset, delete_this_many, insert_this],
             // note that "insert_this" could be a string, or an array,
             // depending on whether S represents a string or an array.
    sort_key, // this is an advanced feature, used for "pruning",
             // but what it does is override the version for the purposes of sorting,
             // which can be useful for pruning, by allowing a
             // node to have a new version id, but still sort into the same
             // place as before.. anyway..
    is_anc // a bit advanced.. a function that takes a version as input,
            // and returns true if we should traverse that version,
            // should we encounter it.. this let's us apply these edits
            // to what the list looked like in the past.
            // the default is a function that always returns true.
)
```

# `sync8.traverse`

this method traverses a sync8 tree in the proper order to read off the nodes in the order they appear in the list being represented.

simple
``` js
var S = sync8.create_node('root', 'hello world!')
sync8.add_version(S, 'v2', [[6, 5, 'globe']])
sync8.traverse(S, () => {

})

// now it says: hello globe!
```

verbose
``` js
sync8.traverse(
    S, // root node of sync8 tree (created from sync8.create_node)
    is_anc, // a function that takes a version as input,
            // and returns true if we should traverse that version,
            // should we encounter it.. this let's us traverse
            // what the list looked like in the past.
            // (no default this time! but you can pass in: () => true)
    cb, // this callback will get called for each node, as we traverse it,
        // with these parameters: (
        //      node, // the current sync8 node we are traversing
        //      offset, // the number of list elements already encountered
        //      has_nexts, // truthy if this node has children which
        //                 // qualify to be traversed according to is_anc
        //      prev, // if "node" is some node's special "next" child,
        //            // then "prev" will be that node
        //      version, // id associated with node
        //      deleted // true if this node is deleted, according to is_anc
        // )
        // NOTE: if the callback returns exactly false,
        // the traversal will stop right away
    view_deleted, // should we call the callback for nodes which
                  // are deleted according to is_anc?
    tail_cb // advanced: if you set this callback,
            // it will called for each node right after all
            // that node's children have been processed,
            // with the node as the sole parameter
)
```

# `sync8.generate_braid`

this method traverses a sync8 tree in the proper order to read off the nodes in the order they appear in the list being represented.

simple
``` js
var S = sync8.create_node('root', 'hello world!')
sync8.add_version(S, 'v2', [[6, 5, 'globe']])
var x = sync8.generate_braid(S, 'v2', x => x != 'v2')
console.log(x) // [[6,5,"globe",null,"r"]]
```

verbose
``` js
sync8.generate_braid(
    S, // root node of sync8 tree (created from sync8.create_node)
    version, // the version we want to recover the edits for
    is_anc, // a function that takes a version as input,
            // and returns true if we should traverse that version,
            // should we encounter it.. this let's us reconstruct what
            // edits must have looked like in the past.
            // (no default this time!)
) // returns an array of edits,
  // where each edit is itself an array that looks like:
  // [offset, num_to_delete, what_to_insert, sort_key (or null), 'i'/'d'/'r' representing 'insert', 'delete' or 'replace'.. in case that's useful.. mainly this is used internally and I didn't bother to remove it]
```

# `sync8.apply_bubbles`

this method prunes the tree. You basically tell it which versions to rename, and then based on the renamings, the algorithm may be able to join some nodes together that it couldn't before.

simple
``` js
var S = sync8.create_node('root', 'hello world!')
sync8.add_version(S, 'v2', [[6, 5, 'globe']], null, x => x != 'v2')
console.log(JSON.stringify(S)) // {"version":"root","elems":"hello ","deleted_by":{},"end_cap":true,"nexts":[{"version":"v2","sort_key":null,"elems":"globe","deleted_by":{},"end_cap":null,"nexts":[],"next":null}],"next":{"version":null,"elems":"world","deleted_by":{"v2":true},"nexts":[],"next":{"version":null,"elems":"!","deleted_by":{},"nexts":[],"next":null}}}

sync8.apply_bubbles(S, {'root': ['v2']})
console.log(JSON.stringify(S)) // {"version":"v2","sort_key":"root","elems":"hello globe!","deleted_by":{},"nexts":[],"next":null}
```

verbose
``` js
sync8.apply_bubbles(
    S, // root node of sync8 tree (created from sync8.create_node)
    to_bubble, // an object, where a key represents a version to rename,
               // and the thing to rename it to lives in the first element of the
               // value, which is an array (this is historical, and I'd like to just
               // have the value be the thing to rename it to, alas)
)
```

# `sync8.break_node`

this method is pretty low-level -- you shouldn't need to call it, but, what it does is split a sync8 node into two nodes, where the first node's "next" points at the second node. This method is called interally by sync8.add_version to split a sync8 node, for instance, when performing an insertion.

simple
``` js
var S = sync8.create_node('root', 'hello world!')
sync8.break_node(S, 2)
console.log(JSON.stringify(S)) // {"version":"root","elems":"he","deleted_by":{},"nexts":[],"next":{"version":null,"elems":"llo world!","deleted_by":{},"nexts":[],"next":null}}
```

verbose
``` js
sync8.break_node(
    node, // sync8 node that you want to break in two
    x, // 0 based offset into this node's content elems where you'd like to break it
    end_cap, // boolean: set to true if we are breaking this node
             // because of a replace operation
    new_next // a sync8 node to add to "nexts" of the first of the two newly created nodes,
             // which is useful when performing an insertion
)
```
