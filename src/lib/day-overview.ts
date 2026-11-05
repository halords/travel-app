import { GOOGLE_MAPS_URL_LIMIT, mapDestination, type Place, type TravelMode } from './model';

export type DayRoute = { url: string | null; from: number; to: number; places: Place[] };

function routeUrl(places: Place[], mode: TravelMode): string {
  if (places.length === 1)
    return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: mapDestination(places[0]) })}`;
  const params = new URLSearchParams({
    api: '1',
    origin: mapDestination(places[0]),
    destination: mapDestination(places[places.length - 1]),
    travelmode: mode === 'transit' && places.length > 2 ? 'driving' : mode,
  });
  if (places.length > 2) params.set('waypoints', places.slice(1, -1).map(mapDestination).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

export function dayRoutes(places: Place[], mode: TravelMode): DayRoute[] {
  const routes: DayRoute[] = [];
  let start = 0;
  while (start < places.length) {
    // Mobile Maps links allow three waypoints and at most 2,048 encoded characters.
    let end = Math.min(start + 5, places.length);
    let url = routeUrl(places.slice(start, end), mode);
    while (end > start + 1 && url.length > GOOGLE_MAPS_URL_LIMIT) {
      end--;
      url = routeUrl(places.slice(start, end), mode);
    }
    // An overlap that cannot fit beside the next stop was already shown in the previous part.
    if (end > start + 1 || routes.at(-1)?.to !== start + 1)
      routes.push({
        from: start + 1,
        to: end,
        places: places.slice(start, end),
        url: url.length <= GOOGLE_MAPS_URL_LIMIT ? url : null,
      });
    if (end === places.length) break;
    // Share an endpoint wherever a connecting route fits; otherwise retain individual stops.
    start = end > start + 1 ? end - 1 : end;
  }
  return routes;
}
