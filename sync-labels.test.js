// bun test

import { expect, test } from "bun:test";
import { restoreTabLabel } from "./sync-labels.js";

test("a numeric label is herdr's default -> re-derive from current position", () => {
  expect(restoreTabLabel("2", 1)).toBe("1");
  expect(restoreTabLabel("2", 2)).toBe("2");
  expect(restoreTabLabel("10", 7)).toBe("7");
});

test("a name the user chose is put back verbatim", () => {
  expect(restoreTabLabel("brain", 1)).toBe("brain");
  expect(restoreTabLabel("2 · api", 1)).toBe("2 · api");
});

test("no known position -> fall back to what was captured", () => {
  expect(restoreTabLabel("2", undefined)).toBe("2");
});
