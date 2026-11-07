import { isBusinessDay as isBD, addBusinessDays as add, businessDaysBetween as between } from "../src/solution";

const XMAS_2026 = ["2026-12-25", "2026-12-26"]; // Fri, Sat
const XMAS_2027 = ["2027-12-25", "2027-12-26"]; // Sat, Sun

describe("business days", () => {
  test("[weekdays] weekends are not business days", () => {
    expect(isBD("2026-11-06")).toBe(true); // Friday
    expect(isBD("2026-11-07")).toBe(false); // Saturday
    expect(isBD("2026-11-08")).toBe(false); // Sunday
    expect(isBD("2026-11-09")).toBe(true); // Monday
  });

  test("[add] forward over a weekend", () => {
    expect(add("2026-11-06", 1)).toBe("2026-11-09");
    expect(add("2026-11-02", 5)).toBe("2026-11-09");
    expect(add("2026-11-02", 10)).toBe("2026-11-16");
  });

  test("[add] starting on a weekend does not count the start", () => {
    expect(add("2026-11-07", 1)).toBe("2026-11-09");
    expect(add("2026-11-08", 2)).toBe("2026-11-10");
  });

  test("[add] negative n moves backwards", () => {
    expect(add("2026-11-09", -1)).toBe("2026-11-06");
    expect(add("2026-11-07", -1)).toBe("2026-11-06");
    expect(add("2026-11-10", -5)).toBe("2026-11-03");
  });

  test("[zero] n = 0 returns a business day unchanged, otherwise rolls forward", () => {
    expect(add("2026-11-04", 0)).toBe("2026-11-04");
    expect(add("2026-11-07", 0)).toBe("2026-11-09");
    expect(add("2026-11-08", 0)).toBe("2026-11-09");
    expect(add("2026-12-25", 0, XMAS_2026)).toBe("2026-12-29");
  });

  test("[holidays] a weekday holiday is skipped", () => {
    expect(isBD("2026-12-25", XMAS_2026)).toBe(false);
    expect(add("2026-12-24", 1, XMAS_2026)).toBe("2026-12-29");
  });

  test("[observed] a Saturday holiday is observed on Monday", () => {
    expect(isBD("2026-12-28", XMAS_2026)).toBe(false);
    expect(isBD("2026-12-29", XMAS_2026)).toBe(true);
    expect(add("2026-12-24", 2, XMAS_2026)).toBe("2026-12-30");
  });

  test("[observed] Saturday and Sunday holidays cascade to Monday and Tuesday", () => {
    expect(isBD("2027-12-24", XMAS_2027)).toBe(true);
    expect(isBD("2027-12-27", XMAS_2027)).toBe(false);
    expect(isBD("2027-12-28", XMAS_2027)).toBe(false);
    expect(isBD("2027-12-29", XMAS_2027)).toBe(true);
    expect(add("2027-12-24", 1, XMAS_2027)).toBe("2027-12-29");
  });

  test("[observed] list order does not matter", () => {
    expect(add("2027-12-24", 1, [...XMAS_2027].reverse())).toBe("2027-12-29");
  });

  test("[observed] a weekend holiday yields to a weekday holiday on the Monday, whatever the list order", () => {
    // Sat 2 Jan 2027 would move to Mon 4 Jan, which is itself a holiday, so it moves to Tue 5 Jan.
    const a = ["2027-01-02", "2027-01-04"];
    for (const list of [a, [...a].reverse()]) {
      expect(isBD("2027-01-04", list)).toBe(false);
      expect(isBD("2027-01-05", list)).toBe(false);
      expect(isBD("2027-01-06", list)).toBe(true);
      expect(add("2027-01-01", 1, list)).toBe("2027-01-06");
    }
  });

  test("[observed] cascade skips a following weekday holiday too", () => {
    // Sat 2 Jan -> Mon 4 Jan is taken, Tue 5 Jan is a listed holiday -> Wed 6 Jan.
    const list = ["2027-01-02", "2027-01-04", "2027-01-05"];
    expect(isBD("2027-01-06", list)).toBe(false);
    expect(isBD("2027-01-07", list)).toBe(true);
  });

  test("[observed] a duplicate holiday entry changes nothing", () => {
    expect(add("2026-12-24", 1, ["2026-12-25", "2026-12-25"])).toBe("2026-12-28");
  });

  test("[between] counts business days after start up to and including end", () => {
    expect(between("2026-11-02", "2026-11-09")).toBe(5);
    expect(between("2026-11-06", "2026-11-08")).toBe(0);
    expect(between("2026-11-02", "2026-11-02")).toBe(0);
    expect(between("2026-11-07", "2026-11-09")).toBe(1);
  });

  test("[between] reversed range is negative", () => {
    expect(between("2026-11-09", "2026-11-02")).toBe(-5);
  });

  test("[between] respects observed holidays", () => {
    // 24 Dec 2026 (Thu) -> 29 Dec (Tue): 25 holiday, 28 observed, so only 29 counts
    expect(between("2026-12-24", "2026-12-29", XMAS_2026)).toBe(1);
    expect(between("2026-12-23", "2026-12-29", XMAS_2026)).toBe(2);
  });

  test("[timezone] results do not depend on DST changes (US spring forward and fall back)", () => {
    expect(add("2026-03-06", 1)).toBe("2026-03-09");
    expect(add("2026-03-06", 5)).toBe("2026-03-13");
    expect(add("2026-10-30", 1)).toBe("2026-11-02");
    expect(add("2026-10-30", 3)).toBe("2026-11-04");
    expect(between("2026-03-01", "2026-03-31")).toBe(22);
    expect(between("2026-10-25", "2026-11-08")).toBe(10);
  });

  test("[timezone] a full year of business days", () => {
    expect(add("2026-01-01", 260)).toBe("2026-12-31");
    expect(add("2026-12-31", -260)).toBe("2026-01-01");
    expect(between("2026-01-01", "2026-12-31")).toBe(260);
  });

  test("[leap] leap day handling", () => {
    expect(add("2028-02-28", 1)).toBe("2028-02-29");
    expect(add("2028-02-29", 1)).toBe("2028-03-01");
    expect(isBD("2028-02-29")).toBe(true);
  });

  test.each(["2026-02-30", "2026-13-01", "2026-00-10", "2026-1-5", "26-01-01", "2026-01-32", "tomorrow", "", "2027-02-29"])(
    "[validation] rejects invalid date %j", (s) => {
      expect(() => isBD(s)).toThrow(RangeError);
      expect(() => add(s, 1)).toThrow(RangeError);
      expect(() => between(s, "2026-11-02")).toThrow(RangeError);
      expect(() => between("2026-11-02", s)).toThrow(RangeError);
    });

  test("[validation] non-strings, bad n and bad holidays", () => {
    expect(() => isBD(20261102)).toThrow(RangeError);
    expect(() => isBD(null)).toThrow(RangeError);
    expect(() => add("2026-11-02", 1.5)).toThrow(RangeError);
    expect(() => add("2026-11-02", "2")).toThrow(RangeError);
    expect(() => isBD("2026-11-02", ["2026-02-30"])).toThrow(RangeError);
  });
});

// Added after mutation testing showed these rules were not pinned down by any check.
describe("business days: lone weekend holidays", () => {
  test("[observed] {L2} a lone Sunday holiday is observed on the Monday right after it", () => {
    expect(isBD("2026-11-09", ["2026-11-08"])).toBe(false);
    expect(isBD("2026-11-10", ["2026-11-08"])).toBe(true);
  });
  test("[observed] {L2} a lone Saturday holiday is observed on the following Monday", () => {
    expect(isBD("2026-11-09", ["2026-11-07"])).toBe(false);
    expect(isBD("2026-11-10", ["2026-11-07"])).toBe(true);
    expect(isBD("2026-11-06", ["2026-11-07"])).toBe(true);
  });
});
