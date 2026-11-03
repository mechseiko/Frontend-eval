import { createOptimisticStore } from "../src/solution";

const deepFreeze = (o) => { Object.values(o).forEach((v) => typeof v === "object" && v && deepFreeze(v)); return Object.freeze(o); };
const add = (n) => (s) => ({ ...s, n: s.n + n });
const mul = (n) => (s) => ({ ...s, n: s.n * n });
const push = (x) => (s) => ({ ...s, list: [...s.list, x] });

describe("createOptimisticStore", () => {
  test("[initial] getState returns the initial object itself", () => {
    const init = { n: 0, list: [] };
    expect(createOptimisticStore(init).getState()).toBe(init);
  });

  test("[apply] optimistic changes show immediately and in order", () => {
    const s = createOptimisticStore({ n: 0 });
    s.apply("a", add(1));
    s.apply("b", mul(2));
    expect(s.getState()).toEqual({ n: 2 });
  });

  test("[apply] update is called exactly once with the current visible state", () => {
    const s = createOptimisticStore({ n: 1 });
    const fn = jest.fn(add(1));
    s.apply("a", fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ n: 1 });
  });

  test("[rollback-middle] rolling back a middle change keeps the later ones", () => {
    const s = createOptimisticStore({ n: 0 });
    s.apply("a", add(1));
    s.apply("b", mul(2));
    s.apply("c", add(10));
    expect(s.getState().n).toBe(12);
    expect(s.rollback("b")).toBe(true);
    expect(s.getState().n).toBe(11);
  });

  test("[rollback-middle] rolling back the first change recomputes the rest", () => {
    const s = createOptimisticStore({ n: 5 });
    s.apply("a", add(1));
    s.apply("b", mul(3));
    s.rollback("a");
    expect(s.getState().n).toBe(15);
  });

  test("[rollback-middle] rolling back everything returns the exact base object", () => {
    const init = { n: 0 };
    const s = createOptimisticStore(init);
    s.apply("a", add(1));
    s.apply("b", add(1));
    s.rollback("a");
    s.rollback("b");
    expect(s.getState()).toBe(init);
  });

  test("[confirm-order] confirming folds into the base; visible state is unchanged for in-order confirms", () => {
    const s = createOptimisticStore({ n: 0 });
    s.apply("a", add(1));
    s.apply("b", add(10));
    expect(s.confirm("a")).toBe(true);
    expect(s.getState().n).toBe(11);
    s.rollback("b");
    expect(s.getState().n).toBe(1);
  });

  test("[confirm-order] rolling back after a confirm keeps the confirmed change", () => {
    const s = createOptimisticStore({ n: 0 });
    s.apply("a", add(1));
    s.apply("b", add(10));
    s.confirm("b");
    s.rollback("a");
    expect(s.getState().n).toBe(10);
  });

  test("[confirm-order] out-of-order confirmation re-applies pending on top of the new base", () => {
    const s = createOptimisticStore({ list: [] });
    s.apply("a", push("A"));
    s.apply("b", push("B"));
    expect(s.getState().list).toEqual(["A", "B"]);
    s.confirm("b");
    expect(s.getState().list).toEqual(["B", "A"]);
    s.confirm("a");
    expect(s.getState().list).toEqual(["B", "A"]);
  });

  test("[unknown-id] confirm and rollback of unknown or finished ids return false without notifying", () => {
    const s = createOptimisticStore({ n: 0 });
    const l = jest.fn();
    s.subscribe(l);
    expect(s.confirm("nope")).toBe(false);
    expect(s.rollback("nope")).toBe(false);
    s.apply("a", add(1));
    l.mockClear();
    s.confirm("a");
    l.mockClear();
    expect(s.confirm("a")).toBe(false);
    expect(s.rollback("a")).toBe(false);
    expect(l).not.toHaveBeenCalled();
  });

  test("[duplicate-id] applying a pending id again throws and changes nothing", () => {
    const s = createOptimisticStore({ n: 0 });
    const l = jest.fn();
    s.apply("a", add(1));
    s.subscribe(l);
    const before = s.getState();
    expect(() => s.apply("a", add(5))).toThrow(Error);
    expect(s.getState()).toBe(before);
    expect(l).not.toHaveBeenCalled();
  });

  test("[duplicate-id] an id can be reused after it was confirmed or rolled back", () => {
    const s = createOptimisticStore({ n: 0 });
    s.apply("a", add(1));
    s.confirm("a");
    expect(() => s.apply("a", add(1))).not.toThrow();
    s.rollback("a");
    expect(() => s.apply("a", add(1))).not.toThrow();
    expect(s.getState().n).toBe(2);
  });

  test("[bad-update] a throwing update leaves the store unchanged and unnotified", () => {
    const s = createOptimisticStore({ n: 0 });
    const l = jest.fn();
    s.subscribe(l);
    s.apply("a", add(1));
    l.mockClear();
    const before = s.getState();
    expect(() => s.apply("bad", () => { throw new TypeError("boom"); })).toThrow(TypeError);
    expect(s.getState()).toBe(before);
    expect(l).not.toHaveBeenCalled();
    expect(s.rollback("bad")).toBe(false);
  });

  test("[memo] getState is referentially stable between operations", () => {
    const s = createOptimisticStore({ n: 0 });
    s.apply("a", add(1));
    s.apply("b", add(1));
    const x = s.getState();
    expect(s.getState()).toBe(x);
    expect(s.getState()).toBe(x);
    s.rollback("a");
    const y = s.getState();
    expect(y).not.toBe(x);
    expect(s.getState()).toBe(y);
  });

  test("[no-mutation] states are never mutated", () => {
    const init = deepFreeze({ n: 0, list: [] });
    const s = createOptimisticStore(init);
    expect(() => {
      s.apply("a", push("x"));
      s.apply("b", add(1));
      s.rollback("a");
      s.confirm("b");
    }).not.toThrow();
    expect(init).toEqual({ n: 0, list: [] });
    expect(s.getState().n).toBe(1);
  });

  test("[notify] one notification per successful operation, in subscription order", () => {
    const s = createOptimisticStore({ n: 0 });
    const order = [];
    s.subscribe(() => order.push("first"));
    s.subscribe(() => order.push("second"));
    s.apply("a", add(1));
    expect(order).toEqual(["first", "second"]);
    order.length = 0;
    s.confirm("a");
    expect(order).toEqual(["first", "second"]);
    s.apply("b", add(1));
    order.length = 0;
    s.rollback("b");
    expect(order).toEqual(["first", "second"]);
  });

  test("[notify] listeners see the new state when called", () => {
    const s = createOptimisticStore({ n: 0 });
    const seen = [];
    s.subscribe(() => seen.push(s.getState().n));
    s.apply("a", add(1));
    s.apply("b", add(2));
    s.rollback("a");
    expect(seen).toEqual([1, 3, 2]);
  });

  test("[unsubscribe] unsubscribe stops notifications and is idempotent", () => {
    const s = createOptimisticStore({ n: 0 });
    const l = jest.fn();
    const off = s.subscribe(l);
    s.apply("a", add(1));
    off();
    off();
    s.apply("b", add(1));
    expect(l).toHaveBeenCalledTimes(1);
  });

  test("[unsubscribe] unsubscribing during notification does not skip other listeners", () => {
    const s = createOptimisticStore({ n: 0 });
    const calls = [];
    const off1 = s.subscribe(() => { calls.push(1); off1(); });
    s.subscribe(() => calls.push(2));
    s.subscribe(() => calls.push(3));
    s.apply("a", add(1));
    expect(calls).toEqual([1, 2, 3]);
    calls.length = 0;
    s.apply("b", add(1));
    expect(calls).toEqual([2, 3]);
  });

  test("[listener-error] a throwing listener does not stop the others or corrupt the store", () => {
    const s = createOptimisticStore({ n: 0 });
    const ok = jest.fn();
    s.subscribe(() => { throw new Error("listener"); });
    s.subscribe(ok);
    expect(() => s.apply("a", add(1))).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(s.getState().n).toBe(1);
    expect(s.rollback("a")).toBe(true);
    expect(s.getState().n).toBe(0);
  });
});
