// Hair and feature colour are each a group of three colour indices on the
// wire (80804705), but the character table keeps one integer per colour. The
// groups the create screen sends, observed on the 41375 PS4 client:
//   hair    (1701, 1702, 1703) - consecutive
//   feature (-1, -1, 1674)     - first two "none", the third (the eyebrows) set
// Keeping only slot 0 and repeating it three times (what the harness did)
// turns the eyebrows into a missing texture. These pack a group into the one
// stored integer and back:
//   consecutive (a, a+1, a+2)  -> a, unchanged
//   (a, a, b) with -1 <= a,b < 4095 -> COLOR_GROUP_PACKED | (a+1) << 12 | (b+1)
//   anything else              -> a (lossy, as before)
// A stored value below COLOR_GROUP_PACKED that is >= 0 reads back as
// consecutive; a negative one as (v, v, v).

export interface ColorGroup {
  unknown0: number;
  unknown1: number;
  unknown2: number;
}

// Bit 30: clear of every real colour index and of the sign, and the packed
// value still fits the store's 32-bit Int.
export const COLOR_GROUP_PACKED = 0x40_00_00_00;
const FIELD_MASK = 0xf_ff;
const FIELD_MAX = 4094;

export function packColorGroup(group: ColorGroup): number {
  const { unknown0: a, unknown1: b, unknown2: c } = group;
  if (b === a + 1 && c === a + 2) {
    return a;
  }
  if (a === b && a >= -1 && c >= -1 && a <= FIELD_MAX && c <= FIELD_MAX) {
    return COLOR_GROUP_PACKED + (a + 1) * 0x10_00 + (c + 1);
  }
  return a;
}

export function unpackColorGroup(value: number): ColorGroup {
  if (value >= COLOR_GROUP_PACKED) {
    // biome-ignore lint/suspicious/noBitwiseOperators: field extraction
    const a = ((value >> 12) & FIELD_MASK) - 1;
    // biome-ignore lint/suspicious/noBitwiseOperators: field extraction
    const c = (value & FIELD_MASK) - 1;
    return { unknown0: a, unknown1: a, unknown2: c };
  }
  if (value < 0) {
    return { unknown0: value, unknown1: value, unknown2: value };
  }
  return { unknown0: value, unknown1: value + 1, unknown2: value + 2 };
}
