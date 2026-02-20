import { describe, it, expect } from "vitest";
import { isNotFoundError } from "../src/utils.js";

describe("isNotFoundError", () => {
  it("returns true for Error with statusCode 404", () => {
    const err = Object.assign(new Error("not found"), { statusCode: 404 });
    expect(isNotFoundError(err)).toBe(true);
  });

  it("returns false for Error with different statusCode", () => {
    const err = Object.assign(new Error("conflict"), { statusCode: 409 });
    expect(isNotFoundError(err)).toBe(false);
  });

  it("returns false for plain Error without statusCode", () => {
    expect(isNotFoundError(new Error("oops"))).toBe(false);
  });

  it("returns false for non-Error objects", () => {
    expect(isNotFoundError({ statusCode: 404 })).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});
