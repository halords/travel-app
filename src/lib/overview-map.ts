import type { Place } from './model';

export type OverviewPoint = { place: Place; number: number; coordinates: [number, number] };

export function overviewPoints(places: Place[]): OverviewPoint[] {
  return places.flatMap((place, index) =>
    place.latitude !== null && place.longitude !== null
      ? [
          {
            place,
            number: index + 1,
            coordinates: [place.latitude, place.longitude] as [number, number],
          },
        ]
      : [],
  );
}
