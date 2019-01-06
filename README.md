# easier-level-multiplexer
A level-multiplexer designed with easier-abstract-leveldown in mind (still compatible with abstract-leveldown)

Multiplex a single leveldown compatible store to many, determining which store will have a copy of the value based on some mapper function which utilizes the value.

Is similar but slightly more versitile than level-mount as instead of depending on the key, it enables you to sort based on the value. This however results in more
 overhead because you have to save *pointers* to the values in the multiplexed stores.
 
Fortunately this project supports singular values existing in multiple backend stores (replication), it also abuses the easier-leveldown `post` method enabling the
 `put` keys of the level-multiplexer to be completely independent of the keys in the replicated stores (which are obtained via a `post`).

Example:

```js
const hybrid_db = levelup(levelmount({
  store: leveldown('root'),
  options: {}, // options for leveldown open
  stores: [
    {
      key: 'fallback',
      store: memdown(),
    },
    {
      key: 'a',
      store: memdown(),
    },
    {
      key: 'b',
      store: someotherdown(),
      options: {}, // someotherdown options for leveldown open
    }
  ],
  // We'll map based on a `stores` variable which takes a list
  mapper: (v) => {
    const stores = v.stores.filter((store) => ['a', 'b'].indexOf(store))
    if (stores.length === 0)
      return ['fallback']
    return stores
  }
})

hybrid_db.put('hello', { stores: ['a', 'b'], doc: 'whatever' }) // ends up in stores `a` and `b` with an arbitrarily generated keys for each
hybrid_db.put('goodbye', { stores: [], doc: 'whatever' }) // ends up in store `fallback` with an arbitrarily generated key

hybrid_db.get('hello') // fetches the document versions back from the `a` and `b`, potentially dealing with collisions
```

It also supports the features of [easier-abstract-leveldown](https://github.com/u8sand/easier-abstract-leveldown), including `post`, propagation of `changes` from underlying easier leveldowns.
