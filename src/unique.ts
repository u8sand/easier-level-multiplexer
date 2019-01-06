export function unique<K extends string, V>(
  L: Array<V>,
  K: (v: V) => K = (v) => String(v) as K
): Array<V> {
  // Count by K func
  const C = L.reduce((c, v) => {
    if (c[K(v)] === undefined)
      c[K(v)] = { v, c: 0 }
    c[K(v)].c += 1
    return c
  }, {} as {[key: string]: {c: number, v: V}})

  return Object.keys(C).sort(
    (a, b) => C[b].c - C[a].c
  ).map(
    (k) => C[k].v
  )
}
