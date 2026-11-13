import { describe, expect, it } from "vitest";
import {
  COLOR_GROUP_PACKED,
  packColorGroup,
  unpackColorGroup,
} from "./color-group";

const g = (a: number, b: number, c: number) => ({
  unknown0: a,
  unknown1: b,
  unknown2: c,
});

describe("colour groups", () => {
  it("round-trips the hair group the PS4 create screen sends", () => {
    const hair = g(1701, 1702, 1703);
    expect(packColorGroup(hair)).toBe(1701);
    expect(unpackColorGroup(1701)).toEqual(hair);
  });

  it("round-trips the feature group with the eyebrow colour in slot 2", () => {
    const feature = g(-1, -1, 1674);
    const packed = packColorGroup(feature);
    expect(packed).toBe(COLOR_GROUP_PACKED + 1675);
    expect(unpackColorGroup(packed)).toEqual(feature);
  });

  it("round-trips an all-none group", () => {
    expect(unpackColorGroup(packColorGroup(g(-1, -1, -1)))).toEqual(
      g(-1, -1, -1)
    );
  });

  it("reads an old stored -1 back as all none", () => {
    expect(unpackColorGroup(-1)).toEqual(g(-1, -1, -1));
  });

  it("falls back to slot 0 for a group it can't pack", () => {
    expect(packColorGroup(g(3, 9, 1))).toBe(3);
  });
});
