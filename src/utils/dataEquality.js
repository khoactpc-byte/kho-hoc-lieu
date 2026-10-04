// Firestore does not preserve object key order. Arrays still preserve their order.
export function stableDataString(value) {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  });
}

export function sameData(first, second) {
  return stableDataString(first) === stableDataString(second);
}
