import suite from 'easier-abstract-leveldown/dist/tests'
import test from 'tape'
import levelmultiplexer from '.'
import memdown from 'memdown'

suite({
  test: test,
  factory: () => levelmultiplexer({
    store: memdown(),
    stores: [
      {
        key: '0',
        store: memdown(),
      },
      {
        key: '1',
        store: memdown(),
      },
      {
        key: '2',
        store: memdown(),
      },
      {
        key: '3',
        store: memdown(),
      },
    ],
    // We have 4 underlying stores (0, 1,2,3),
    //  if any of the keys appear in the store
    //  we put it in that store, falling back to 0
    // e.g.
    //   hello123  would go to 1, 2, and 3
    //   hi        would go to 0
    //   hi2       would go to 2
    mapper: (val) => {
      // Split the value string and get 1,2,3
      const ret = String(val).split('').filter((v) => ['1','2','3'].indexOf(v) !== -1)
      if (ret.length === 0)
        return ['0']
      return ret
    }
  }) as any,
})
