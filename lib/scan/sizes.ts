// Order sizes the way a shop reads them: XS S M L XL 2XL…, then numbers
// (28 30 32…), then anything else alphabetically.

const letterOrder = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "6XL", "FREE", "FS"];

function rank(size: string) {
  const key = size.trim().toUpperCase().replace(/\s+/g, "");
  const letter = letterOrder.indexOf(key);
  if (letter >= 0) return [0, letter, 0, key] as const;
  const number = Number.parseFloat(key);
  if (Number.isFinite(number) && /^\d/.test(key)) return [1, 0, number, key] as const;
  return [2, 0, 0, key] as const;
}

export function compareSizes(a: string, b: string) {
  const [ra, rb] = [rank(a), rank(b)];
  for (let index = 0; index < 3; index += 1) {
    if (ra[index] !== rb[index]) return Number(ra[index]) - Number(rb[index]);
  }
  return ra[3].localeCompare(rb[3]);
}
