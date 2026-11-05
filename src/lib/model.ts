import { z } from 'zod';

export const categories = [
  'sightseeing',
  'food',
  'cafe',
  'outdoors',
  'shopping',
  'stay',
  'transport',
  'other',
] as const;
export const categoryLabels: Record<Category, string> = {
  sightseeing: 'Sightseeing',
  food: 'Food & drink',
  cafe: 'Café',
  outdoors: 'Outdoors',
  shopping: 'Shopping',
  stay: 'Stay',
  transport: 'Transport',
  other: 'Other',
};
export type Category = (typeof categories)[number];
export const covers = ['lavender', 'sage', 'sand', 'blue'] as const;

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dateSchema = z.string().refine(isDate, 'Choose a valid date.');
const timestamp = z.number().int().min(0).max(8_640_000_000_000_000);
const recordFields = {
  id: z.string().uuid(),
  updatedAt: timestamp,
  deletedAt: timestamp.nullable(),
};

export const tripSchema = z
  .object({
    ...recordFields,
    title: z.string().trim().min(1).max(100),
    destination: z.string().trim().min(1).max(160),
    startDate: dateSchema,
    endDate: dateSchema,
    cover: z.enum(covers),
    notes: z.string().max(3000),
    isDemo: z.boolean(),
  })
  .refine(
    (t) => t.endDate >= t.startDate && dayDifference(t.startDate, t.endDate) < 90,
    'A trip can be from 1 to 90 days.',
  );

export const placeSchema = z
  .object({
    ...recordFields,
    tripId: z.string().uuid(),
    name: z.string().trim().min(1).max(180),
    address: z.string().trim().min(1).max(500),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    date: dateSchema.nullable(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    duration: z.number().int().min(0).max(1440),
    category: z.enum(categories),
    notes: z.string().max(3000),
    visited: z.boolean(),
    order: z.number().finite().min(-1e9).max(1e9),
  })
  .refine(
    (p) => (p.latitude === null) === (p.longitude === null),
    'Latitude and longitude must be provided together.',
  );

export const dataSchema = z
  .object({
    version: z.literal(1),
    // Offline merges retain tombstones; transfer and import limits are enforced in bytes.
    trips: z.array(tripSchema),
    places: z.array(placeSchema),
  })
  .superRefine((data, ctx) => {
    const tripIds = new Set(data.trips.map((t) => t.id));
    if (
      tripIds.size !== data.trips.length ||
      new Set(data.places.map((p) => p.id)).size !== data.places.length
    ) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate records in this backup.' });
    }
    if (data.places.some((p) => !tripIds.has(p.tripId)))
      ctx.addIssue({ code: 'custom', message: 'A place is missing its trip.' });
  });

export type Trip = z.infer<typeof tripSchema>;
export type Place = z.infer<typeof placeSchema>;
export type AppData = z.infer<typeof dataSchema>;
export type TripInput = Pick<
  Trip,
  'title' | 'destination' | 'startDate' | 'endDate' | 'cover' | 'notes'
>;
export type PlaceInput = Pick<
  Place,
  | 'tripId'
  | 'name'
  | 'address'
  | 'latitude'
  | 'longitude'
  | 'date'
  | 'time'
  | 'duration'
  | 'category'
  | 'notes'
>;
export type MapProvider = 'google' | 'apple';
export type TravelMode = 'walking' | 'driving' | 'transit';
export type Preferences = { mapProvider: MapProvider; travelMode: TravelMode };
export type User = { id: string; name: string; email: string };

export const emptyData = (): AppData => ({ version: 1, trips: [], places: [] });
export const activeTrips = (data: AppData) =>
  data.trips
    .filter((t) => t.deletedAt === null)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
export const tripPlaces = (data: AppData, tripId: string) =>
  data.places
    .filter((p) => p.tripId === tripId && p.deletedAt === null)
    .sort(
      (a, b) =>
        (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
        a.order - b.order ||
        a.id.localeCompare(b.id),
    );

export function dayDifference(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function tripDays(trip: Trip): string[] {
  return Array.from(
    { length: Math.max(1, Math.min(90, dayDifference(trip.startDate, trip.endDate) + 1)) },
    (_, i) => addDays(trip.startDate, i),
  );
}

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

export function formatRange(trip: Pick<Trip, 'startDate' | 'endDate'>): string {
  return `${formatDate(trip.startDate)} – ${formatDate(trip.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function formatTime(time: string | null): string {
  if (!time) return 'Any time';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function nextTimestamp(data: AppData): number {
  return [...data.trips, ...data.places].reduce((n, r) => Math.max(n, r.updatedAt + 1), Date.now());
}

// Merge individual records, retaining deletion tombstones so offline devices cannot resurrect deleted places.
// Simultaneous edits to the same record use the latest timestamp, with a deterministic tie-break.
function mergeRecords<T extends { id: string; updatedAt: number }>(left: T[], right: T[]): T[] {
  const merged = new Map<string, T>();
  for (const record of [...left, ...right]) {
    const previous = merged.get(record.id);
    if (
      !previous ||
      record.updatedAt > previous.updatedAt ||
      (record.updatedAt === previous.updatedAt && JSON.stringify(record) > JSON.stringify(previous))
    )
      merged.set(record.id, record);
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function mergeData(left: AppData, right: AppData): AppData {
  return {
    version: 1,
    trips: mergeRecords(left.trips, right.trips),
    places: mergeRecords(left.places, right.places),
  };
}

export function nonDemoData(data: AppData): AppData {
  const trips = data.trips.filter((t) => !t.isDemo);
  const ids = new Set(trips.map((t) => t.id));
  return { version: 1, trips, places: data.places.filter((p) => ids.has(p.tripId)) };
}

export function saveTrip(data: AppData, input: TripInput, id?: string): AppData {
  const updatedAt = nextTimestamp(data);
  const existing = data.trips.find((t) => t.id === id);
  const trip = tripSchema.parse({
    ...input,
    id: id ?? crypto.randomUUID(),
    updatedAt,
    deletedAt: null,
    isDemo: false,
  });
  const shift = existing ? dayDifference(existing.startDate, trip.startDate) : 0;
  return {
    ...data,
    trips: [...data.trips.filter((t) => t.id !== trip.id), trip],
    places: data.places.map((p) => {
      if (!existing || p.tripId !== existing.id || !p.date || p.deletedAt !== null) return p;
      const moved = addDays(p.date, shift);
      const date =
        moved < trip.startDate ? trip.startDate : moved > trip.endDate ? trip.endDate : moved;
      return date === p.date ? p : { ...p, date, updatedAt };
    }),
  };
}

export function savePlace(data: AppData, input: PlaceInput, id?: string): AppData {
  if (!data.trips.some((t) => t.id === input.tripId && t.deletedAt === null))
    throw new Error('This trip is no longer available.');
  const updatedAt = nextTimestamp(data);
  const existing = data.places.find((p) => p.id === id);
  const siblings = tripPlaces(data, input.tripId).filter((p) => p.date === input.date);
  const place = placeSchema.parse({
    ...input,
    id: id ?? crypto.randomUUID(),
    updatedAt,
    deletedAt: null,
    visited: existing?.visited ?? false,
    order:
      existing?.date === input.date
        ? existing.order
        : Math.max(0, ...siblings.map((p) => p.order)) + 1000,
  });
  const locationError = mapLinkError(place);
  if (locationError) throw new Error(locationError);
  return {
    ...data,
    places: [...data.places.filter((p) => p.id !== place.id), place],
    trips: data.trips.map((t) =>
      t.id === input.tripId && t.isDemo ? { ...t, isDemo: false, updatedAt } : t,
    ),
  };
}

export function markVisited(data: AppData, id: string): AppData {
  const updatedAt = nextTimestamp(data);
  const place = data.places.find((p) => p.id === id);
  return {
    ...data,
    places: data.places.map((p) => (p.id === id ? { ...p, visited: !p.visited, updatedAt } : p)),
    trips: data.trips.map((t) =>
      t.id === place?.tripId && t.isDemo ? { ...t, isDemo: false, updatedAt } : t,
    ),
  };
}

export function removePlace(data: AppData, id: string): AppData {
  const updatedAt = nextTimestamp(data);
  return {
    ...data,
    places: data.places.map((p) => (p.id === id ? { ...p, deletedAt: updatedAt, updatedAt } : p)),
  };
}

export function removeTrip(data: AppData, id: string): AppData {
  const updatedAt = nextTimestamp(data);
  return {
    ...data,
    trips: data.trips.map((t) => (t.id === id ? { ...t, deletedAt: updatedAt, updatedAt } : t)),
    places: data.places.map((p) =>
      p.tripId === id ? { ...p, deletedAt: updatedAt, updatedAt } : p,
    ),
  };
}

export function reorderPlace(data: AppData, id: string, direction: -1 | 1): AppData {
  const target = data.places.find((p) => p.id === id);
  if (!target) return data;
  const siblings = tripPlaces(data, target.tripId).filter((p) => p.date === target.date);
  const index = siblings.findIndex((p) => p.id === id);
  if (!siblings[index + direction]) return data;
  [siblings[index], siblings[index + direction]] = [siblings[index + direction], siblings[index]];
  const order = new Map(siblings.map((p, i) => [p.id, (i + 1) * 1000]));
  const updatedAt = nextTimestamp(data);
  return {
    ...data,
    places: data.places.map((p) =>
      order.has(p.id) ? { ...p, order: order.get(p.id)!, updatedAt } : p,
    ),
  };
}

export const GOOGLE_MAPS_URL_LIMIT = 2048;
type MapDestination = Pick<Place, 'name' | 'address' | 'latitude' | 'longitude'>;

export function mapDestination(place: MapDestination): string {
  return place.latitude !== null && place.longitude !== null
    ? `${place.latitude},${place.longitude}`
    : `${place.name}, ${place.address}`;
}

export function directionsUrl(place: MapDestination, preferences: Preferences): string {
  const destination = mapDestination(place);
  if (preferences.mapProvider === 'apple') {
    return `https://maps.apple.com/?${new URLSearchParams({ daddr: destination, dirflg: { walking: 'w', driving: 'd', transit: 'r' }[preferences.travelMode] })}`;
  }
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination, travelmode: preferences.travelMode, dir_action: 'navigate' })}`;
}

export function mapLinkError(place: MapDestination): string | null {
  const url = directionsUrl(place, { mapProvider: 'google', travelMode: 'walking' });
  return url.length > GOOGLE_MAPS_URL_LIMIT
    ? 'This destination is too long for a Google Maps link. Shorten the name or address, or set an exact map pin.'
    : null;
}

export function restoreBackup(current: AppData, raw: unknown): AppData {
  const parsed = dataSchema.parse(raw);
  const updatedAt = nextTimestamp(mergeData(current, parsed));
  // An explicit restore should win over subsequent deletions, while unrelated trips remain untouched.
  return mergeData(current, {
    ...parsed,
    trips: parsed.trips.map((t) => ({ ...t, updatedAt })),
    places: parsed.places.map((p) => ({ ...p, updatedAt })),
  });
}
