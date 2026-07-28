/** Builds an EWKT point literal that Postgres/PostGIS casts to `geography(Point,4326)` on insert. */
export function toEwktPoint(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/** Parses the `POINT(lng lat)` / `SRID=4326;POINT(lng lat)` text PostgREST returns for geography columns. */
export function parseEwktPoint(value: string | null): { lat: number; lng: number } | null {
  if (!value) return null;
  const match = value.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) return null;
  return { lng: Number(match[1]), lat: Number(match[2]) };
}

export const DAY_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"] as const;
