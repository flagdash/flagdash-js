import { describe, expect, it } from "vitest";
import { formatTranslation } from "../translation";

describe("formatTranslation", () => {
  it("formats variables, plural branches, exact matches, and selects", () => {
    expect(formatTranslation("Hello {name}", "en", { name: "Marta" })).toBe("Hello Marta");

    const plural = "{count, plural, one {# item} other {# items}}";
    expect(formatTranslation(plural, "en", { count: 1 })).toBe("1 item");
    expect(formatTranslation(plural, "en", { count: 3 })).toBe("3 items");
    expect(formatTranslation("{count, plural, =0 {Empty} other {# items}}", "en", { count: 0 })).toBe("Empty");
    expect(formatTranslation("{role, select, admin {Administrator} other {Member}}", "en", { role: "admin" })).toBe("Administrator");
  });

  it("preserves a missing simple variable for diagnosis", () => {
    expect(formatTranslation("Hello {name}", "en")).toBe("Hello {name}");
  });
});
