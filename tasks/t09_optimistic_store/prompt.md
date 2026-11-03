# Optimistic update store

Implement `createOptimisticStore` in `src/solution.js` (named export, no dependencies).

```js
const store = createOptimisticStore(initialState);
store.getState()                 // the visible state
store.apply(id, update)          // optimistic change; update is a pure function (state) => newState
store.confirm(id)                // the server accepted this change -> boolean
store.rollback(id)               // the server rejected this change -> boolean
store.subscribe(listener)        // returns an unsubscribe function
```

Model
- The store keeps a **base** state (confirmed changes only) and an ordered list of **pending** changes. The **visible** state, returned by `getState()`, is the base with every pending `update` applied in order: `pending.reduce((s, m) => m.update(s), base)`.
- Initially the base is `initialState` and `getState()` returns that exact object.

Rules
1. `apply(id, update)`: if a pending change with this `id` already exists, throw an `Error` and change nothing. Call `update` exactly once, with the current visible state, to compute the new visible state. If `update` throws, rethrow the error and leave the store unchanged (nothing pending, no notification). Otherwise append the change to pending and notify listeners once.
2. `confirm(id)`: if `id` is not pending return `false` (no notification). Otherwise remove it from pending, make `base = update(base)` (apply it to the **base**), recompute the visible state from the remaining pending changes on top of the new base, notify once, return `true`. Confirmations are folded into the base in the order `confirm` is called, which can differ from the order of `apply`.
3. `rollback(id)`: if `id` is not pending return `false` (no notification). Otherwise remove it from pending **without** applying it to the base, recompute the visible state from the remaining pending changes, notify once, return `true`. Other pending changes must be kept, never restored from an old snapshot.
4. `getState()` returns the same object reference until a successful `apply`, `confirm` or `rollback` happens. When nothing is pending, the visible state is exactly the base object.
5. Never mutate `initialState` or any state object; updates are expected to return new objects (tests freeze the state).
6. `subscribe(listener)`: listeners are called with no arguments after each state-changing operation, in subscription order. The returned function unsubscribes; calling it twice is harmless. Unsubscribing while listeners are being notified must not skip other listeners. If a listener throws, the remaining listeners are still notified and the error is swallowed.
