// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DayOverviewMap from '../src/components/DayOverviewMap';
import { demoData } from '../src/lib/demo';
import { overviewPoints } from '../src/lib/overview-map';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the map of itinerary destinations', () => {
  it('renders every sample destination at its saved coordinates and fits the full group', () => {
    const places = demoData().places;
    const marker = vi.spyOn(L, 'marker');
    const fit = vi.spyOn(L.Map.prototype, 'fitBounds');
    render(createElement(DayOverviewMap, { places }));
    expect(marker).toHaveBeenCalledTimes(places.length);
    for (const [index, place] of places.entries()) {
      expect(marker.mock.calls[index][0]).toEqual([place.latitude, place.longitude]);
      expect(marker.mock.calls[index][1]?.title).toBe(`${index + 1}. ${place.name}`);
    }
    const bounds = fit.mock.calls[0][0] as L.LatLngBounds;
    expect(places.every((place) => bounds.contains([place.latitude!, place.longitude!]))).toBe(
      true,
    );
  });
  it('rebuilds markers after a destination changes and removes the previous map', () => {
    const places = demoData().places.slice(0, 2);
    const marker = vi.spyOn(L, 'marker');
    const remove = vi.spyOn(L.Map.prototype, 'remove');
    const view = render(createElement(DayOverviewMap, { places }));
    const next = [{ ...places[0], latitude: 0, longitude: 0 }];
    view.rerender(createElement(DayOverviewMap, { places: next }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(marker.mock.calls.at(-1)?.[0]).toEqual([0, 0]);
    view.unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('keeps stop numbering when an address has no coordinates', () => {
    const places = demoData().places.slice(0, 3);
    places[1] = { ...places[1], latitude: null, longitude: null };
    expect(overviewPoints(places).map((point) => point.number)).toEqual([1, 3]);
  });
});
