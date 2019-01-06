import test from 'tape'
import { unique } from './unique'

test('unique simple', (t) => {
  t.deepEqual(
    unique([
      'c',
      'a',
      'b',
      'a',
      'c',
      'a',
    ]),
    [
      'a',
      'c',
      'b',
    ]
  )
  t.end()
})

test('unique keyfunc', (t) => {
  t.deepEqual(
    unique([
      {k: 'c', v: 3},
      {k: 'a', v: 1},
      {k: 'b', v: 2},
      {k: 'a', v: 1},
      {k: 'c', v: 3},
      {k: 'a', v: 1},
    ], (v) => v.k),
    [
      { k: 'a', v: 1 },
      { k: 'c', v: 3 },
      { k: 'b', v: 2 },
    ]
  )

  t.end()
})