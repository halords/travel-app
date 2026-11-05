import { describe, expect, it } from 'vitest';
import {
  activeTrips,
  addDays,
  dataSchema,
  directionsUrl,
  emptyData,
  GOOGLE_MAPS_URL_LIMIT,
  isDate,
  mapDestination,
  mapLinkError,
  mergeData,
  removePlace,
  removeTrip,
  reorderPlace,
  restoreBackup,
  savePlace,
  saveTrip,
  tripDays,
  tripPlaces,
  type AppData,
  type PlaceInput,
  type TripInput,
} from '../src/lib/model';
import { dayRoutes } from '../src/lib/day-overview';

const tripInput: TripInput = {
  title: 'Kyoto escape',
  destination: 'Kyoto, Japan',
  startDate: '2026-11-19',
  endDate: '2026-11-22',
  cover: 'lavender',
  notes: '',
};
function fixture(count = 3): AppData {
  let data = saveTrip(emptyData(), tripInput);
  for (let i = 0; i < count; i++)
    data = savePlace(data, {
      tripId: data.trips[0].id,
      name: `Stop ${i + 1}`,
      address: `Kyoto street ${i + 1}, Japan`,
      latitude: 35 + i * 0.001,
      longitude: 135.7,
      date: tripInput.startDate,
      time: i === 0 ? '08:00' : null,
      category: 'sightseeing',
      duration: 60,
      notes: '',
    });
  return data;
}

describe('calendar dates', () => {
  it('validates real dates rather than accepting calendar rollovers', () => {
    expect(isDate('2026-02-29')).toBe(false);
    expect(isDate('2028-02-29')).toBe(true);
    expect(isDate('2026-11-31')).toBe(false);
    expect(isDate('2026-1-09')).toBe(false);
  });
  it('keeps date-only itineraries stable across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    const data = fixture();
    expect(tripDays(data.trips[0])).toEqual([
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });
  it('rejects reversed or unbounded trip dates', () => {
    expect(() => saveTrip(emptyData(), { ...tripInput, endDate: '2026-11-18' })).toThrow();
    expect(() => saveTrip(emptyData(), { ...tripInput, endDate: '2027-11-19' })).toThrow();
  });
  it('moves the itinerary with a changed trip date and keeps shortened trips in range', () => {
    const data = fixture();
    data.places[1].date = '2026-11-22';
    data.places[2].date = null;
    const moved = saveTrip(
      data,
      { ...tripInput, startDate: '2026-12-10', endDate: '2026-12-11' },
      data.trips[0].id,
    );
    expect(moved.places[0].date).toBe('2026-12-10');
    expect(moved.places[1].date).toBe('2026-12-11');
    expect(moved.places[2].date).toBeNull();
  });
});

describe('offline sync records', () => {
  it('keeps edits to different stops made on two devices', () => {
    const initial = fixture();
    const left = structuredClone(initial),
      right = structuredClone(initial);
    left.places[0] = {
      ...left.places[0],
      notes: 'Book at 9',
      updatedAt: initial.places[0].updatedAt + 20,
    };
    right.places[1] = {
      ...right.places[1],
      visited: true,
      updatedAt: initial.places[1].updatedAt + 20,
    };
    const merged = mergeData(left, right);
    expect(merged.places.find((p) => p.id === initial.places[0].id)?.notes).toBe('Book at 9');
    expect(merged.places.find((p) => p.id === initial.places[1].id)?.visited).toBe(true);
    expect(mergeData(left, right)).toEqual(mergeData(right, left));
    expect(mergeData(merged, merged)).toEqual(merged);
  });
  it('does not resurrect a deleted stop when an older device reconnects', () => {
    const initial = fixture();
    const removed = removePlace(initial, initial.places[0].id);
    const merged = mergeData(removed, initial);
    expect(tripPlaces(merged, initial.trips[0].id)).toHaveLength(2);
    expect(merged.places).toHaveLength(3);
  });
  it('tombstones the entire deleted trip and its stops', () => {
    const initial = fixture();
    const merged = mergeData(initial, removeTrip(initial, initial.trips[0].id));
    expect(activeTrips(merged)).toHaveLength(0);
    expect(merged.places.every((p) => p.deletedAt !== null)).toBe(true);
  });
  it('breaks equal-timestamp conflicts deterministically', () => {
    const left = fixture(),
      right = structuredClone(left);
    right.places[0].notes = 'A different note';
    expect(mergeData(left, right)).toEqual(mergeData(right, left));
  });
  it('keeps visit order independent from optional times', () => {
    const initial = fixture();
    const reordered = reorderPlace(initial, initial.places[1].id, -1);
    expect(tripPlaces(reordered, initial.trips[0].id).map((p) => p.name)).toEqual([
      'Stop 2',
      'Stop 1',
      'Stop 3',
    ]);
    expect(reorderPlace(reordered, initial.places[1].id, -1)).toEqual(reordered);
  });
  it('restores an explicit backup while preserving unrelated trips', () => {
    const initial = fixture();
    const deleted = removePlace(initial, initial.places[0].id);
    const more = saveTrip(deleted, { ...tripInput, title: 'Another trip' });
    const restored = restoreBackup(more, initial);
    expect(activeTrips(restored)).toHaveLength(2);
    expect(tripPlaces(restored, initial.trips[0].id)).toHaveLength(3);
  });
  it('reloads merged offline histories beyond the former aggregate record caps', () => {
    const history = (tripCount: number, placeCount: number): AppData => {
      const seed = fixture(1);
      const updatedAt = seed.places[0].updatedAt + 1;
      return {
        version: 1,
        trips: Array.from({ length: tripCount }, (_, index) => ({
          ...seed.trips[0],
          id: index === 0 ? seed.trips[0].id : crypto.randomUUID(),
          updatedAt,
          deletedAt: index === 0 ? null : updatedAt,
        })),
        places: Array.from({ length: placeCount }, (_, index) => ({
          ...seed.places[0],
          id: crypto.randomUUID(),
          updatedAt,
          deletedAt: index === 0 ? null : updatedAt,
        })),
      };
    };
    const left = dataSchema.parse(history(150, 5000));
    const right = dataSchema.parse(history(151, 5001));
    const merged = mergeData(left, right);
    const reloaded = dataSchema.parse(JSON.parse(JSON.stringify(merged)));

    expect(reloaded.trips).toHaveLength(301);
    expect(reloaded.places).toHaveLength(10_001);
    expect(activeTrips(reloaded)).toHaveLength(2);
    expect(reloaded.places.filter((place) => place.deletedAt === null)).toHaveLength(2);
    expect(reloaded).toEqual(merged);
  });
  it('rejects malformed backups, duplicate records, and invalid coordinates', () => {
    const data = fixture();
    expect(() => restoreBackup(data, { version: 2, trips: [], places: [] })).toThrow();
    expect(
      dataSchema.safeParse({ ...data, places: [...data.places, data.places[0]] }).success,
    ).toBe(false);
    const input: PlaceInput = { ...data.places[0], latitude: 91 };
    expect(() => savePlace(data, input)).toThrow();
    expect(() => savePlace(data, { ...input, latitude: null, longitude: 140 })).toThrow();
  });
});

describe('navigation and daily overviews', () => {
  it('opens Google navigation from the user’s location with the destination already filled in', () => {
    const place = fixture().places[0];
    const url = new URL(directionsUrl(place, { mapProvider: 'google', travelMode: 'walking' }));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('destination')).toBe('35,135.7');
    expect(url.searchParams.get('travelmode')).toBe('walking');
    expect(url.searchParams.get('dir_action')).toBe('navigate');
    expect(url.searchParams.has('origin')).toBe(false);
  });
  it('supports Apple Maps, zero coordinates, and safely encoded manual addresses', () => {
    const place = { ...fixture().places[0], latitude: 0, longitude: 0 };
    expect(
      new URL(
        directionsUrl(place, { mapProvider: 'apple', travelMode: 'transit' }),
      ).searchParams.get('daddr'),
    ).toBe('0,0');
    const addressPlace = {
      ...place,
      latitude: null,
      longitude: null,
      name: 'Café & tea',
      address: 'A&B street #2, Manila',
    };
    const url = new URL(
      directionsUrl(addressPlace, { mapProvider: 'google', travelMode: 'driving' }),
    );
    expect(url.searchParams.get('destination')).toBe('Café & tea, A&B street #2, Manila');
    expect(url.searchParams.size).toBe(4);
  });
  it('includes the stops of the chosen day in itinerary order', () => {
    const places = fixture(4).places;
    const routes = dayRoutes(places, 'walking');
    expect(routes).toHaveLength(1);
    const params = new URL(routes[0].url!).searchParams;
    expect(params.get('origin')).toBe('35,135.7');
    expect(params.get('destination')).toBe('35.003,135.7');
    expect(params.get('waypoints')?.split('|')).toEqual(['35.001,135.7', '35.002,135.7']);
    expect(params.has('dir_action')).toBe(false);
  });
  it('splits long days into connected mobile-safe sections without dropping a stop', () => {
    const places = fixture(12).places;
    const routes = dayRoutes(places, 'driving');
    expect(routes).toHaveLength(3);
    expect(routes.every((r) => r.places.length <= 5)).toBe(true);
    expect(routes[0].places.at(-1)?.id).toBe(routes[1].places[0].id);
    expect(routes[1].places.at(-1)?.id).toBe(routes[2].places[0].id);
    expect(new Set(routes.flatMap((r) => r.places.map((p) => p.id))).size).toBe(12);
  });
  it('splits long addresses before the encoded URL limit without changing a destination', () => {
    const places = fixture(5).places.map((place) => ({
      ...place,
      latitude: null,
      longitude: null,
      address: 'A'.repeat(420),
    }));
    const routes = dayRoutes(places, 'walking');
    expect(routes.length).toBeGreaterThan(1);
    expect(routes.every((route) => route.url && route.url.length <= GOOGLE_MAPS_URL_LIMIT)).toBe(
      true,
    );
    expect(new Set(routes.flatMap((route) => route.places.map((place) => place.id))).size).toBe(5);
    expect(routes[0].places.at(-1)?.id).toBe(routes[1].places[0].id);
    for (const route of routes) {
      const params = new URL(route.url!).searchParams;
      const destinations = params.has('query')
        ? [params.get('query')]
        : [
            params.get('origin'),
            ...(params.get('waypoints')?.split('|') ?? []),
            params.get('destination'),
          ];
      expect(destinations).toEqual(route.places.map(mapDestination));
    }
  });
  it('opens individual places when complete non-Latin addresses cannot fit together', () => {
    const places = fixture(3).places.map((place) => ({
      ...place,
      latitude: null,
      longitude: null,
      address: '街'.repeat(140),
    }));
    const routes = dayRoutes(places, 'transit');
    expect(routes.map((route) => [route.from, route.to])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(routes.flatMap((route) => route.places.map((place) => place.id))).toEqual(
      places.map((place) => place.id),
    );
    for (const route of routes) {
      expect(route.url!.length).toBeLessThanOrEqual(GOOGLE_MAPS_URL_LIMIT);
      expect(new URL(route.url!).searchParams.get('query')).toBe(mapDestination(route.places[0]));
    }
  });
  it('retains every place when a shared endpoint cannot fit beside the next address', () => {
    const places = fixture(3).places;
    for (const index of [1, 2])
      places[index] = {
        ...places[index],
        latitude: null,
        longitude: null,
        address: '街'.repeat(120),
      };
    const routes = dayRoutes(places, 'walking');
    expect(routes.map((route) => [route.from, route.to])).toEqual([
      [1, 2],
      [3, 3],
    ]);
    expect(routes.flatMap((route) => route.places.map((place) => place.id))).toEqual(
      places.map((place) => place.id),
    );
  });
  it('keeps legacy oversized stops visible and requires a pin before saving their changes', () => {
    const data = fixture(3);
    const legacy = {
      ...data.places[1],
      latitude: null,
      longitude: null,
      address: '街'.repeat(500),
    };
    data.places[1] = legacy;
    expect(dataSchema.safeParse(data).success).toBe(true);
    const routes = dayRoutes(data.places, 'walking');
    expect(routes.flatMap((route) => route.places.map((place) => place.id))).toEqual(
      data.places.map((place) => place.id),
    );
    expect(routes.find((route) => route.places[0].id === legacy.id)?.url).toBeNull();
    expect(mapLinkError(legacy)).toMatch(/exact map pin/);
    expect(() => savePlace(data, legacy, legacy.id)).toThrow(/exact map pin/);
    expect(() =>
      savePlace(data, { ...legacy, latitude: 10.29, longitude: 123.9 }, legacy.id),
    ).not.toThrow();
  });
  it('accepts the Google link boundary and rejects the next encoded character', () => {
    const place = {
      ...fixture(1).places[0],
      latitude: null,
      longitude: null,
      address: '街'.repeat(200),
    };
    const preferences = { mapProvider: 'google', travelMode: 'walking' } as const;
    place.address += 'A'.repeat(GOOGLE_MAPS_URL_LIMIT - directionsUrl(place, preferences).length);
    expect(directionsUrl(place, preferences)).toHaveLength(GOOGLE_MAPS_URL_LIMIT);
    expect(mapLinkError(place)).toBeNull();
    expect(mapLinkError({ ...place, address: `${place.address}A` })).toMatch(/exact map pin/);
  });
  it('does not make unsupported multi-waypoint transit links', () => {
    expect(
      new URL(dayRoutes(fixture(3).places, 'transit')[0].url!).searchParams.get('travelmode'),
    ).toBe('driving');
    expect(
      new URL(dayRoutes(fixture(2).places, 'transit')[0].url!).searchParams.get('travelmode'),
    ).toBe('transit');
    expect(dayRoutes([], 'walking')).toEqual([]);
    expect(dayRoutes(fixture(1).places, 'walking')[0].url).toContain('/maps/search/');
  });
});
