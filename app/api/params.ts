// Query parameters are parsed strictly: the whole value has to be the number,
// once. parseFloat would read "175abc" as 175 and Number would read " 12 ",
// "0x10" and "" as numbers too, so both would score or route from a point
// nobody asked about instead of saying the request was wrong.

const DECIMAL = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const WHOLE = /^\d+$/;

// The one value of name, or null when it is missing or given more than once.
function single(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  return values.length === 1 ? values[0] : null;
}

// Any real coordinate is accepted, not just Hamilton's: a point outside the
// city is a fair question, and walkreach_analysis answers it as off the
// network. Only a position that cannot exist on Earth is refused.
export function parsePoint(
  params: URLSearchParams,
): { lng: number; lat: number } | null {
  const lng = single(params, "lng");
  const lat = single(params, "lat");
  if (lng === null || lat === null || !DECIMAL.test(lng) || !DECIMAL.test(lat))
    return null;

  const point = { lng: Number(lng), lat: Number(lat) };
  return Math.abs(point.lng) <= 180 && Math.abs(point.lat) <= 90 ? point : null;
}

// A positive id that fits amenities.id, a Postgres integer. Anything larger
// would reach the database and fail there as a 500 rather than a 400.
export function parseId(params: URLSearchParams, name: string): number | null {
  const value = single(params, name);
  if (value === null || !WHOLE.test(value)) return null;
  const id = Number(value);
  return id >= 1 && id <= 2_147_483_647 ? id : null;
}
