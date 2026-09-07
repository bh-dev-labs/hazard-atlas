export type TimedGeometry = { date: string; precision: "day" | "second" };
// A "day" precision date has no real time-of-day, so scrubbing past it means
// scrubbing past the whole day, not the instant midnight UTC begins.
export function geometryAt<T extends TimedGeometry>(
  geometry: T[],
  cursor: number,
): T[] {
  return geometry.filter((g) =>
    g.precision === "day"
      ? Date.parse(g.date + "T23:59:59.999Z") <= cursor
      : Date.parse(g.date) <= cursor,
  );
}
