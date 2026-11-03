import { normalizeNigerianPhone as norm, formatNigerianPhone as fmt } from "../src/solution";

describe("normalizeNigerianPhone", () => {
  test.each([
    "08031234567", "8031234567", "2348031234567", "+2348031234567",
    "+234 803 123 4567", "0803-123-4567", "(0803) 123 4567", "  0803 123 4567  ",
    "+234-803-123-4567", "0803.123.4567",
  ])("[formats] %j -> +2348031234567", (s) => {
    expect(norm(s)).toBe("+2348031234567");
  });

  test.each(["+234(0)803 123 4567", "+2340803 123 4567", "2340803 123 4567", "+234 (0) 803 123 4567"])(
    "[country-zero] trunk digit after the country code is tolerated: %j", (s) => {
      expect(norm(s)).toBe("+2348031234567");
    });

  test("[formats] 00234 international prefix", () => {
    expect(norm("002348031234567")).toBe("+2348031234567");
    expect(norm("00234 0803 123 4567")).toBe("+2348031234567");
  });

  test.each([
    ["07011234567", "+2347011234567"], ["07112345678", "+2347112345678"],
    ["08121234567", "+2348121234567"], ["09011234567", "+2349011234567"], ["09112345678", "+2349112345678"],
  ])("[prefix] valid prefix %s", (i, o) => {
    expect(norm(i)).toBe(o);
  });

  test.each(["06031234567", "07211234567", "08331234567", "09221234567", "05031234567", "01234567890"])(
    "[prefix] invalid prefix %s", (s) => {
      expect(norm(s)).toBeNull();
    });

  test.each(["0803123456", "080312345678", "803123456", "80312345678", "+23480312345678", "+2348031234", "2348031234567890"])(
    "[length] wrong length %j", (s) => {
      expect(norm(s)).toBeNull();
    });

  test("[country-zero] only one trunk zero is dropped", () => {
    expect(norm("+23400803 123 4567")).toBeNull();
    expect(norm("0234 803 123 4567")).toBeNull();
  });

  test.each(["", "   ", "abc", "0803abc4567", "0803 123 4567 ext 2", "++2348031234567", "+234803+1234567",
    "+14155552671", "+0803123 4567", "tel:+2348031234567", "+2348031234567x", "٠٨٠٣١٢٣٤٥٦٧"])(
    "[garbage] rejects %j", (s) => {
      expect(norm(s)).toBeNull();
    });

  test("[garbage] non-strings return null", () => {
    expect(norm(null)).toBeNull();
    expect(norm(undefined)).toBeNull();
    expect(norm(8031234567)).toBeNull();
    expect(norm({})).toBeNull();
    expect(norm(["08031234567"])).toBeNull();
  });
});

describe("formatNigerianPhone", () => {
  test("[display] formats valid numbers as 0XXX XXX XXXX", () => {
    expect(fmt("+2348031234567")).toBe("0803 123 4567");
    expect(fmt("2347011234567")).toBe("0701 123 4567");
    expect(fmt("+234(0)9011234567")).toBe("0901 123 4567");
  });
  test("[display] invalid returns null", () => {
    expect(fmt("0603123456")).toBeNull();
    expect(fmt(null)).toBeNull();
  });
});
