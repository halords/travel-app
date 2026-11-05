import type { Category } from './model';

export type SearchResult = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: Category;
};
const cache = new Map<string, SearchResult[]>();
let lastRequest = 0;

export async function searchPlaces(
  query: string,
  destination: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const key = `${query.trim()} ${destination}`.trim();
  if (cache.has(key)) return cache.get(key)!;
  if (Date.now() - lastRequest < 1000) throw new Error('Give it a second, then search again.');
  lastRequest = Date.now();
  const url = new URL('https://photon.komoot.io/api/');
  url.search = new URLSearchParams({ q: key, limit: '5', lang: 'en' }).toString();
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok)
    throw new Error('Place search is busy. Try again, or add the address manually.');
  const body = await response.json();
  if (!Array.isArray(body.features))
    throw new Error('Place search is unavailable. You can still add a place manually.');
  const results: SearchResult[] = [];
  for (const feature of body.features) {
    const props = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    if (
      !props ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !coordinates.slice(0, 2).every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
    )
      continue;
    const address = [
      ...new Set(
        [
          [props.housenumber, props.street].filter(Boolean).join(' '),
          props.district,
          props.city ?? props.town ?? props.village,
          props.state,
          props.country,
        ].filter((v): v is string => typeof v === 'string' && v.length > 0),
      ),
    ].join(', ');
    const type = props.osm_value;
    const category: Category = ['restaurant', 'fast_food', 'bar', 'pub', 'food_court'].includes(
      type,
    )
      ? 'food'
      : type === 'cafe'
        ? 'cafe'
        : ['hotel', 'hostel', 'guest_house'].includes(type)
          ? 'stay'
          : ['park', 'nature_reserve', 'garden', 'beach'].includes(type)
            ? 'outdoors'
            : ['station', 'aerodrome', 'bus_stop'].includes(type)
              ? 'transport'
              : 'sightseeing';
    results.push({
      name: String(props.name ?? props.street ?? query).slice(0, 180),
      address: (address || query).slice(0, 500),
      longitude: coordinates[0],
      latitude: coordinates[1],
      category,
    });
  }
  if (cache.size > 30) cache.clear();
  cache.set(key, results);
  return results;
}
