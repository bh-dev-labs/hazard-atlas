export type TimedGeometry = { date: string; precision: "day" | "second" };
export type GeometryEpochs = {
  // The instant after which the geometry counts as observed: the end of the
  // UTC day for date-only records, the stated instant otherwise.
  last: number;
  // A representative instant for range checks: UTC noon for date-only
  // records, the stated instant otherwise.
  noon: number;
};
// Date.parse is a measurable cost when the replay tick re-filters every
// incident's geometry; parse each geometry object once and remember it.
const epochs = new WeakMap<TimedGeometry, GeometryEpochs>();
export function geometryEpochs(g: TimedGeometry): GeometryEpochs {
  let e = epochs.get(g);
  if (!e) {
    e =
      g.precision === "day"
        ? {
            last: Date.parse(g.date + "T23:59:59.999Z"),
            noon: Date.parse(
              g.date.length === 10 ? g.date + "T12:00:00Z" : g.date,
            ),
          }
        : { last: Date.parse(g.date), noon: Date.parse(g.date) };
    epochs.set(g, e);
  }
  return e;
}
// A "day" precision date has no real time-of-day, so scrubbing past it means
// scrubbing past the whole day, not the instant midnight UTC begins.
export function geometryAt<T extends TimedGeometry>(
  geometry: T[],
  cursor: number,
): T[] {
  return geometry.filter((g) => geometryEpochs(g).last <= cursor);
}
