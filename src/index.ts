import { AbstractLevelDOWN } from 'abstract-leveldown'
import expose, { EasierLevelDOWN, LevelDOWNEasier, EasierLevelDOWNEmitter } from 'easier-abstract-leveldown'
import uuidv4 from 'uuid/v4'
import { unique } from './unique';

export interface LevelMultiplexerPointer {
  store: string
  key: string
}

export interface LevelMultiplexerOptions<V> {
  location?: string

  // The base store
  store: AbstractLevelDOWN<string, any>
  options?: any
  // Whether we are responsible for opening this store
  open?: boolean

  // The multi-store label-store mapping
  stores: Array<{
    key: string
    store: EasierLevelDOWN<string, V>
    // Whether we are responsible for opening this store
    open?: boolean
    options?: any
  }>

  // Map a value to a given store label
  mapper: (val: V) => string[]
}

export class LevelMultiplexer<
  V = any
> implements EasierLevelDOWN<
  string, V, LevelMultiplexerOptions<V>
> {
  _options: LevelMultiplexerOptions<V>
  _store: EasierLevelDOWN<string, string>
  _stores: {[key: string]: EasierLevelDOWN<string, V>}
  _mapper: (val: V) => string[]

  constructor(options: LevelMultiplexerOptions<V>) {
    this._options = {...options}
    this._store = new LevelDOWNEasier(this._options.store)

    this._stores = {}
    for (const store of this._options.stores)
      this._stores[store.key] = new LevelDOWNEasier(store.store)

    this._mapper = this._options.mapper
  }

  async open() {
    if (this._store.open !== undefined && this._options.open !== false)
      await this._store.open(this._options.options)

    for (const store of this._options.stores) {
      if (this._stores[store.key].open !== undefined && store.open !== false)
        await this._stores[store.key].open(store.options)
    }
  }

  async close() {
    for (const store of this._options.stores) {
      if (this._stores[store.key].close !== undefined && store.open !== false)
        await this._stores[store.key].close()
    }

    if (this._store.close !== undefined && this._options.open !== false)
      await this._store.close()
  }

  async get(key: string): Promise<V> {
    const ptrs = JSON.parse(await this._store.get(key))
    const recreate = []
    const vals = (await Promise.all<V>(ptrs.map(
      async (ptr) => {
        try {
          return await this._stores[ptr.store].get(ptr.key)
        } catch(e) {
          if (String(e) === 'Error: NotFound') {
            // It wasn't in this store, it should be [re-]created
            recreate.push(ptr)
            return undefined
          } else {
            throw e
          }
        }
      }
    ))).filter((v) => v !== undefined)

    if (vals.length === 0) // Couldn't be found anywhere
      throw new Error('NotFound')

    const unique_vals = unique<string, V>(vals, (v: V) => JSON.stringify(v))

    if (unique_vals.length > 1) { // collisions
      console.warn(unique_vals.length + ' collision(s) occured, dupes spawned')
      await Promise.all(unique_vals.slice(1).map(this.post))
    }

    // Recreate the value in the stores that are missing it
    for (const ptr of recreate)
      await this._stores[ptr.store].put(ptr.key, unique_vals[0])

    return unique_vals[0]
  }

  async put(key: string, val: V) {
    return await this._store.put(key, JSON.stringify(
      await Promise.all(
        this._mapper(val).map(async (store) => ({
          store,
          key: await this._stores[store].post(val),
        }))
      )
    ))
  }

  async del(key: string) {
    try {
      const ptrs = JSON.parse(await this._store.get(key))
      await Promise.all(
        ptrs.map(
          (ptr) => this._stores[ptr.store].del(ptr.key)
        ).concat(
          this._store.del(key)
        )
      )
    } catch(e) {
      // It's kind of silly that `del` shouldn't throw if key doesn't exist.
      if (String(e) !== "Error: NotFound")
        throw e
    }
  }

  async *iterator(opts) {
    const it = this._store.iterator(opts)
    let val = await it.next()
    while (!val.done) {
      yield {
        key: val.value.key,
        value: await this.get(String(val.value.key)),
      }
      val = await it.next()
    }
  }

  async post(val: V): Promise<string> {
    const key = String(uuidv4())
    await this.put(key, val)
    return key
  }

  async _reverse(key: string): Promise<string> {
    // TODO: Reverse lookup key
    return key
  }

  async _del(key: string) {
    let existingKey = await this._reverse(key)
    if (existingKey !== undefined)
      await this.del(existingKey)
    return existingKey
  }

  async _post(key: string, val: V): Promise<string> {
    let existingKey = await this._reverse(key)
    if (existingKey === undefined)
      existingKey = await this.post(val)
    else
      await this.put(existingKey, val)

    return existingKey
  }

  changes() {
    const emitter = new EasierLevelDOWNEmitter<string, V>()

    // Catch changes on store and resolve pointers before forwarding
    if (this._store.changes !== undefined) {
      this._store.changes().onPut(
        async (key, val) => emitter.emit(key, await this.get(key))
      ).onDel(
        (key) => emitter.emit(key)
      ).onBatch(
        async (array) => emitter.emitBatch(
          await Promise.all(
            array.map(async (op) => {
              if (op.type === 'put') {
                return {
                  type: op.type,
                  key: op.key,
                  value: await this.get(op.key),
                }
              } else if (op.type === 'del') {
                return {
                  type: op.type,
                  key: op.key
                }
              } else
                throw new Error(`Unrecognized batch operation '${(op as { type: string }).type}'`)
            })
          )
        )
      )
    }

    // Catch changes on multiplexed stores and update our records before forwarding
    for (const store of Object.keys(this._stores)) {
      if (this._stores[store].changes !== undefined) {
        this._stores[store].changes().onPut(
          async (key, val) => emitter.emit(await this._post(key, val), val)
        ).onDel(
          async (key) => {
            const existingKey = await this._del(key)
            if (existingKey !== undefined)
              emitter.emit(existingKey)
          }
        ).onBatch(
          async (array) => emitter.emitBatch(
            (await Promise.all(
              array.map(async (op) => {
                if (op.type === 'put') {
                  return {
                    type: op.type,
                    key: await this._post(op.key, op.value),
                    value: op.value,
                  }
                } else if (op.type === 'del') {
                  const existingKey = await this._del(op.key)
                  if (existingKey !== undefined) {
                    return {
                      type: op.type,
                      key: await this._del(op.key)
                    }
                  }
                } else
                  throw new Error(`Unrecognized batch operation '${(op as { type: string }).type}'`)
              })
            )).filter((op) => op !== undefined)
          )
        )
      }
    }

    return emitter
  }
}

export default function<V>(opts: LevelMultiplexerOptions<V>) {
  return expose<string, V, any>(() => new LevelMultiplexer<V>(opts))()
}
