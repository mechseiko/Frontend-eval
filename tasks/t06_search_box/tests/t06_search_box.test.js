/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SearchBox } from "../src/solution";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(props = {}) {
  const requests = [];
  const search = jest.fn((query, opts) => {
    const d = deferred();
    requests.push({ query, signal: opts && opts.signal, ...d });
    return d.promise;
  });
  const utils = render(<SearchBox search={search} {...props} />);
  const input = screen.getByRole("searchbox");
  const type = (v) => fireEvent.change(input, { target: { value: v } });
  const wait = (ms) => act(() => { jest.advanceTimersByTime(ms); });
  const settle = (fn) => act(async () => { fn(); });
  const items = () => screen.queryAllByRole("listitem").map((li) => li.textContent);
  const status = () => screen.getByRole("status").textContent;
  return { ...utils, search, requests, input, type, wait, settle, items, status };
}
const abortError = () => Object.assign(new Error("Aborted"), { name: "AbortError" });

describe("SearchBox", () => {
  test("[render] initial markup", () => {
    const s = setup();
    expect(s.input).toHaveValue("");
    expect(s.status()).toBe("");
    expect(screen.getByRole("list", { name: "Results" })).toBeInTheDocument();
    expect(s.items()).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("[debounce] request fires only after debounceMs without typing", () => {
    const s = setup();
    s.type("ab");
    s.wait(299);
    expect(s.search).not.toHaveBeenCalled();
    s.wait(1);
    expect(s.search).toHaveBeenCalledTimes(1);
    expect(s.search.mock.calls[0][0]).toBe("ab");
    expect(s.requests[0].signal).toBeInstanceOf(AbortSignal);
  });

  test("[debounce] every keystroke restarts the timer and only the last value is searched", () => {
    const s = setup();
    s.type("ab");
    s.wait(200);
    s.type("abc");
    s.wait(200);
    s.type("abcd");
    s.wait(299);
    expect(s.search).not.toHaveBeenCalled();
    s.wait(1);
    expect(s.search).toHaveBeenCalledTimes(1);
    expect(s.search.mock.calls[0][0]).toBe("abcd");
  });

  test("[debounce] custom debounceMs", () => {
    const s = setup({ debounceMs: 50 });
    s.type("ab");
    s.wait(49);
    expect(s.search).not.toHaveBeenCalled();
    s.wait(1);
    expect(s.search).toHaveBeenCalledTimes(1);
  });

  test("[trim] the query is trimmed but the input shows what was typed", () => {
    const s = setup();
    s.type("  hello  ");
    s.wait(300);
    expect(s.search.mock.calls[0][0]).toBe("hello");
    expect(s.input).toHaveValue("  hello  ");
  });

  test("[min-chars] {L2} short or blank queries make no request", () => {
    const s = setup();
    s.type("a");
    s.wait(1000);
    s.type("    ");
    s.wait(1000);
    s.type(" a ");
    s.wait(1000);
    expect(s.search).not.toHaveBeenCalled();
    s.type("ab");
    s.wait(300);
    expect(s.search).toHaveBeenCalledTimes(1);
  });

  test("[min-chars] {L2} custom minChars", () => {
    const s = setup({ minChars: 4 });
    s.type("abc");
    s.wait(300);
    expect(s.search).not.toHaveBeenCalled();
    s.type("abcd");
    s.wait(300);
    expect(s.search).toHaveBeenCalledTimes(1);
  });

  test("[min-chars] {L2} dropping below minChars cancels the timer, aborts, and clears results", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    await s.settle(() => s.requests[0].resolve(["one", "two"]));
    expect(s.items()).toEqual(["one", "two"]);
    s.type("abc");
    s.wait(300);
    expect(s.requests).toHaveLength(2);
    s.type("a");
    expect(s.requests[1].signal.aborted).toBe(true);
    expect(s.items()).toEqual([]);
    expect(s.status()).toBe("");
    s.wait(1000);
    expect(s.requests).toHaveLength(2);
  });

  test("[min-chars] {L2} a pending debounce timer is cancelled when the query gets too short", () => {
    const s = setup();
    s.type("abc");
    s.wait(200);
    s.type("a");
    s.wait(1000);
    expect(s.search).not.toHaveBeenCalled();
  });

  test("[loading] status shows Searching... then results", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    expect(s.status()).toBe("Searching...");
    await s.settle(() => s.requests[0].resolve(["x", "y"]));
    expect(s.status()).toBe("");
    expect(s.items()).toEqual(["x", "y"]);
  });

  test("[empty] an empty result shows No results", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    await s.settle(() => s.requests[0].resolve([]));
    expect(s.status()).toBe("No results");
  });

  test("[keep-results] {L2} previous results stay visible while the next request loads", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    await s.settle(() => s.requests[0].resolve(["old"]));
    s.type("abc");
    s.wait(300);
    expect(s.status()).toBe("Searching...");
    expect(s.items()).toEqual(["old"]);
  });

  test("[abort] {L2} starting a new request aborts the previous one", () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    expect(s.requests[0].signal.aborted).toBe(false);
    s.type("abc");
    s.wait(300);
    expect(s.requests[0].signal.aborted).toBe(true);
    expect(s.requests[1].signal.aborted).toBe(false);
  });

  test("[stale-response] {L3} an old response arriving after a newer one is ignored", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    s.type("abc");
    s.wait(300);
    await s.settle(() => s.requests[1].resolve(["new"]));
    await s.settle(() => s.requests[0].resolve(["old"]));
    expect(s.items()).toEqual(["new"]);
    expect(s.status()).toBe("");
  });

  test("[stale-response] {L3} an old response arriving while the newer one is pending is ignored", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    s.type("abc");
    s.wait(300);
    await s.settle(() => s.requests[0].resolve(["old"]));
    expect(s.items()).toEqual([]);
    expect(s.status()).toBe("Searching...");
  });

  test("[stale-response] {L3} an old failure does not show an error", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    s.type("abc");
    s.wait(300);
    await s.settle(() => s.requests[0].reject(new Error("late")));
    expect(screen.queryByRole("alert")).toBeNull();
    await s.settle(() => s.requests[1].resolve(["ok"]));
    expect(s.items()).toEqual(["ok"]);
  });

  test("[abort] {L2} an AbortError from the latest request shows no error UI", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    await s.settle(() => s.requests[0].reject(abortError()));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("[error] failure clears results and shows alert with Retry", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    await s.settle(() => s.requests[0].resolve(["one"]));
    s.type("abc");
    s.wait(300);
    await s.settle(() => s.requests[1].reject(new Error("boom")));
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(s.items()).toEqual([]);
    expect(s.status()).toBe("");
  });

  test("[retry] {L2} Retry re-runs the trimmed query immediately and clears the error", async () => {
    const s = setup();
    s.type(" ab ");
    s.wait(300);
    await s.settle(() => s.requests[0].reject(new Error("boom")));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(s.requests).toHaveLength(2);
    expect(s.requests[1].query).toBe("ab");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(s.status()).toBe("Searching...");
    await s.settle(() => s.requests[1].resolve(["fine"]));
    expect(s.items()).toEqual(["fine"]);
  });

  test("[dedupe-query] {L3} a trailing space does not trigger a new request", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    s.type("ab ");
    s.wait(300);
    expect(s.requests).toHaveLength(1);
    await s.settle(() => s.requests[0].resolve(["r"]));
    s.type("ab  ");
    s.wait(300);
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0].signal.aborted).toBe(false);
  });

  test("[dedupe-query] {L3} typing away and back to the in-flight query does not re-request", () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    s.type("abc");
    s.type("ab");
    s.wait(300);
    expect(s.requests).toHaveLength(1);
  });

  test("[dedupe-query] {L3} after a failure the same query is requested again", async () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    await s.settle(() => s.requests[0].reject(new Error("boom")));
    s.type("ab ");
    s.wait(300);
    expect(s.requests).toHaveLength(2);
  });

  test("[unmount] {L3} pending timer is cleared and in-flight request is aborted", () => {
    const s = setup();
    s.type("ab");
    s.wait(300);
    s.type("abc");
    s.unmount();
    expect(s.requests[0].signal.aborted).toBe(true);
    s.wait(1000);
    expect(s.requests).toHaveLength(1);
  });

  test("[unmount] {L3} a late resolution after unmount causes no error", async () => {
    const s = setup();
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    s.type("ab");
    s.wait(300);
    s.unmount();
    await s.settle(() => s.requests[0].resolve(["late"]));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
