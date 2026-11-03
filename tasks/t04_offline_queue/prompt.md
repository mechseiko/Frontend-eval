# Persistent offline action queue

Implement `createOfflineQueue` in `src/solution.js` (named export).

```js
const q = createOfflineQueue({ storage, send, key = "queue:v1", maxAttempts = 5 });
q.enqueue(action)   // synchronous, returns undefined
q.flush()           // returns a Promise<{ sent: string[], failed: {id, reason}[], remaining: number }>
q.size()            // number of pending items
q.peek()            // array of pending items: { id, type, payload, dedupeKey, attempts } (copies, FIFO order)
```

- `storage` is synchronous with `getItem(key)` (string or null) and `setItem(key, string)`.
- `send(action)` is async and receives `{ id, type, payload }`. It resolves `{ ok: true }` on success. It resolves `{ ok: false, retryable: false }` when the server permanently rejected the action. Anything else is a **retryable failure**: a rejection, `{ ok: false }`, `{ ok: false, retryable: true }`, or any other resolved value.
- An action is `{ id: string, type: string, payload: any, dedupeKey?: string }`.

Rules
1. **Persistence**: the queue is stored as a JSON array under `key`. Persist after **every** change (enqueue, each item completing, each attempt count change). A new queue created on the same storage continues with the pending items. If storage holds invalid JSON or JSON that is not an array, start empty and do not throw.
2. **enqueue**: new items start with `attempts: 0` and are appended in FIFO order.
   - If an item with the same `id` is already pending, ignore the call.
   - Else if `dedupeKey` is given and a pending item has the same `dedupeKey`, **replace that item's `type` and `payload` in place** (it keeps its position, its original `id`, and its `attempts` reset to 0) instead of appending.
   - The item currently being sent is **in flight** and is never matched by `dedupeKey`; in that case append the new action as a separate item. (An `id` match against the in-flight item is still ignored.)
3. **flush**: process items strictly in FIFO order, one at a time.
   - Success: remove the item, add its id to `sent`.
   - Permanent failure: remove the item, add `{ id, reason: "rejected" }` to `failed`, then continue with the next item.
   - Retryable failure: increment the item's `attempts`. If `attempts >= maxAttempts`, remove it and add `{ id, reason: "max-attempts" }` to `failed`. Either way **stop flushing immediately**; all later items stay queued in order.
   - Items enqueued while a flush is running are processed by that same flush.
   - `remaining` is the number of items still queued when the flush ends.
   - If the queue is empty, resolve `{ sent: [], failed: [], remaining: 0 }` without calling `send`.
4. **Single-flight**: if `flush()` is called while a flush is running, return the running flush's promise. Never send the same item twice because of overlapping flushes. A flush called after the previous one finished starts a fresh run.
