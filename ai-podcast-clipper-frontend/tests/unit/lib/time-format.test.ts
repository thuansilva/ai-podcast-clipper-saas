import { describe, it, expect } from "vitest";
import { parseTimeInput, formatTimeInput } from "~/lib/time-format";

describe("parseTimeInput", () => {
  it.each([
    ["0:00", 0],
    ["00:00", 0],
    ["0:05", 5],
    ["1:30", 90],
    ["01:30", 90],
    ["59:59", 3599],
    ["75:00", 4500],
    ["1:00:00", 3600],
    ["01:02:03", 3723],
    ["2:59:59", 10799],
    ["  1:30  ", 90],
  ])("converte %s para %d segundos", (input, expected) => {
    expect(parseTimeInput(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "abc",
    "90",
    "1:5",
    "1:60",
    "1:00:60",
    "1:60:00",
    "-1:00",
    "1.5:00",
    "1:30.5",
    "1:2:3:4",
    ":30",
    "1:",
    "1::30",
    "0x1:00",
  ])("rejeita %j", (input) => {
    expect(parseTimeInput(input)).toBeNull();
  });
});

describe("formatTimeInput", () => {
  it.each([
    [0, "00:00"],
    [5, "00:05"],
    [90, "01:30"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3723, "1:02:03"],
    [10799, "2:59:59"],
  ])("formata %d segundos como %s", (seconds, expected) => {
    expect(formatTimeInput(seconds)).toBe(expected);
  });

  it("arredonda para baixo segundos fracionários e trata negativos como zero", () => {
    expect(formatTimeInput(61.9)).toBe("01:01");
    expect(formatTimeInput(-5)).toBe("00:00");
  });

  it("é inverso de parseTimeInput", () => {
    for (const s of [0, 7, 60, 599, 3600, 7322]) {
      expect(parseTimeInput(formatTimeInput(s))).toBe(s);
    }
  });
});
