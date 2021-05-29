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
