// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { readData, writeData, writePreferences } from '../src/lib/storage';
import { emptyData, GOOGLE_MAPS_URL_LIMIT, savePlace, saveTrip } from '../src/lib/model';
import * as placeSearch from '../src/lib/search';

vi.mock('../src/components/PlacePickerMap', () => ({
  default: ({ onPick }: { onPick: (latitude: number, longitude: number) => void }) =>
    createElement(
      'button',
      { type: 'button', onClick: () => onPick(10.293, 123.902) },
      'Choose test destination',
    ),
}));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ configured: true, user: null }),
    })),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};
const change = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function createTrip() {
  fireEvent.click(screen.getByRole('button', { name: 'Plan a new trip' }));
  change('Trip name', 'Cebu weekend');
  change('Destination', 'Cebu, Philippines');
  change('Trip start date', '2026-12-01');
  change('Trip end date', '2026-12-03');
  fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));
}
function addPlace(name: string, address: string) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Add a place' })[0]);
  change('Place name', name);
  change('Address', address);
  fireEvent.click(screen.getByRole('button', { name: 'Add to my trip' }));
}
async function pickDestination() {
  fireEvent.click(screen.getByRole('button', { name: 'Or choose a point on the map' }));
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Choose test destination' }));
}
function tripFixture(count = 1) {
  let data = emptyData();
  for (let i = 1; i <= count; i++)
    data = saveTrip(data, {
      title: `Trip ${i}`,
      destination: 'Cebu, Philippines',
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      cover: 'lavender',
      notes: '',
    });
  return data;
}

describe('the trip planning interface', () => {
  it('creates a dated trip and places with working one-tap directions and a day overview', async () => {
    render(createElement(App));
    await settle();
    createTrip();
    expect(screen.getByRole('heading', { name: 'Cebu weekend' })).toBeTruthy();
    addPlace('Fort San Pedro', 'A. Pigafetta Street, Cebu City, Philippines');
    addPlace('Magellan’s Cross', 'P. Burgos Street, Cebu City, Philippines');
    const stored = readData().data;
    const trip = stored.trips.find((t) => t.title === 'Cebu weekend')!;
    expect(stored.places.filter((p) => p.tripId === trip.id)).toHaveLength(2);
    const directions = screen.getByRole('link', {
      name: 'Directions to Fort San Pedro',
    }) as HTMLAnchorElement;
    expect(new URL(directions.href).searchParams.get('destination')).toBe(
      'Fort San Pedro, A. Pigafetta Street, Cebu City, Philippines',
    );
    expect(directions.target).toBe('_blank');
    const overview = screen.getByRole('link', {
      name: /overview in Google Maps/,
    }) as HTMLAnchorElement;
    const params = new URL(overview.href).searchParams;
    expect(params.get('origin')).toContain('Fort San Pedro');
    expect(params.get('destination')).toContain('Magellan’s Cross');
    expect(screen.queryByLabelText('Interactive map of your saved places')).toBeNull();
  });
  it('moves a place to the later list and removes it only after confirmation', async () => {
    render(createElement(App));
    await settle();
    createTrip();
    addPlace('A little café', 'Cebu City, Philippines');
    fireEvent.click(screen.getByRole('button', { name: 'Options for A little café' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit place' }));
    change('Day', '');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('heading', { name: 'A few possibilities' })).toBeTruthy();
    expect(readData().data.places.find((p) => p.name === 'A little café')?.date).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Options for A little café' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit place' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete place' }));
    expect(readData().data.places.find((p) => p.name === 'A little café')?.deletedAt).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove place' }));
    expect(
      readData().data.places.find((p) => p.name === 'A little café')?.deletedAt,
    ).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'A little café' })).toBeNull();
  });
  it('updates directions to the chosen maps app without changing the Google day overview', async () => {
    render(createElement(App));
    await settle();
    createTrip();
    addPlace('Fort San Pedro', 'Cebu City, Philippines');
    fireEvent.click(screen.getByRole('button', { name: 'Settings & account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apple Maps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    const directions = screen.getByRole('link', {
      name: 'Directions to Fort San Pedro',
    }) as HTMLAnchorElement;
    expect(new URL(directions.href).hostname).toBe('maps.apple.com');
    const overview = screen.getByRole('link', {
      name: /overview in Google Maps/,
    }) as HTMLAnchorElement;
    expect(new URL(overview.href).hostname).toBe('www.google.com');
  });
  it('keeps a manually picked pin when the required address is filled afterward', async () => {
    render(createElement(App));
    await settle();
    createTrip();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a place' })[0]);
    await pickDestination();
    change('Place name', 'Pinned meeting point');
    change('Address', 'Waterfront, Cebu City');
    fireEvent.click(screen.getByRole('button', { name: 'Add to my trip' }));
    expect(
      readData().data.places.find((place) => place.name === 'Pinned meeting point'),
    ).toMatchObject({
      latitude: 10.293,
      longitude: 123.902,
      address: 'Waterfront, Cebu City',
    });
    const directions = screen.getByRole('link', {
      name: 'Directions to Pinned meeting point',
    }) as HTMLAnchorElement;
    expect(new URL(directions.href).searchParams.get('destination')).toBe('10.293,123.902');
  });
  it('clears a searched pin when its address changes', async () => {
    vi.spyOn(placeSearch, 'searchPlaces').mockResolvedValueOnce([
      {
        name: 'Fort San Pedro',
        address: 'Cebu City, Philippines',
        latitude: 10.292,
        longitude: 123.905,
        category: 'sightseeing',
      },
    ]);
    render(createElement(App));
    await settle();
    createTrip();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a place' })[0]);
    change('Find a place', 'Fort San Pedro');
    fireEvent.click(screen.getByRole('button', { name: 'Search for places' }));
    await settle();
    fireEvent.click(screen.getByText('Fort San Pedro').closest('button')!);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    change('Address', 'A different address, Cebu');
    fireEvent.click(screen.getByRole('button', { name: 'Add to my trip' }));
    expect(readData().data.places.find((place) => place.name === 'Fort San Pedro')).toMatchObject({
      latitude: null,
      longitude: null,
      address: 'A different address, Cebu',
    });
  });
  it('keeps the trip filter clearable after deleting the fifth trip', async () => {
    writeData(tripFixture(5));
    render(createElement(App));
    await settle();
    const mobileNavigation = within(screen.getByRole('navigation', { name: 'Mobile navigation' }));
    fireEvent.click(mobileNavigation.getByRole('button', { name: 'My trips' }));
    change('Find a trip', 'Trip 5');
    fireEvent.click(screen.getByRole('heading', { name: 'Trip 5' }).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Edit trip details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }));
    expect(readData().data.trips.filter((trip) => trip.deletedAt === null)).toHaveLength(4);
    expect((screen.getByLabelText('Find a trip') as HTMLInputElement).value).toBe('Trip 5');
    change('Find a trip', '');
    for (let i = 1; i <= 4; i++)
      expect(screen.getByRole('heading', { name: `Trip ${i}` })).toBeTruthy();
    expect(
      mobileNavigation.getByRole('button', { name: 'My trips' }).getAttribute('aria-current'),
    ).toBe('page');
  });
  it('shows only the chosen day in separate links when addresses cannot fit together', async () => {
    let data = tripFixture();
    for (let i = 1; i <= 4; i++)
      data = savePlace(data, {
        tripId: data.trips[0].id,
        name: i === 4 ? 'Tomorrow’s stop' : `Today’s stop ${i}`,
        address: '街'.repeat(140),
        latitude: null,
        longitude: null,
        category: 'sightseeing',
        date: i === 4 ? '2026-12-02' : '2026-12-01',
        time: null,
        duration: 60,
        notes: '',
      });
    writeData(data);
    writePreferences({ mapProvider: 'google', travelMode: 'transit' });
    render(createElement(App));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Day overview' }));
    const overview = within(screen.getByRole('dialog'));
    expect(overview.getByText(/Some sections open separately/)).toBeTruthy();
    expect(overview.queryByText('Tomorrow’s stop')).toBeNull();
    expect(overview.queryByText(/use driving/)).toBeNull();
    const links = overview.getAllByRole('link', { name: /Open part \d in Google Maps/ });
    expect(links).toHaveLength(3);
    links.forEach((link, index) => {
      const href = (link as HTMLAnchorElement).href;
      expect(href.length).toBeLessThanOrEqual(GOOGLE_MAPS_URL_LIMIT);
      expect(new URL(href).searchParams.get('query')).toBe(
        `Today’s stop ${index + 1}, ${'街'.repeat(140)}`,
      );
    });
  });
  it('offers an editable location for legacy addresses too long for a Google link', async () => {
    let data = tripFixture();
    data = savePlace(data, {
      tripId: data.trips[0].id,
      name: 'Long address stop',
      address: 'Cebu City',
      latitude: null,
      longitude: null,
      category: 'sightseeing',
      date: data.trips[0].startDate,
      time: null,
      duration: 60,
      notes: '',
    });
    data.places[0].address = '街'.repeat(500);
    writeData(data);
    render(createElement(App));
    await settle();
    expect(screen.queryByRole('link', { name: 'Directions to Long address stop' })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Set location for Long address stop' }),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Day overview' }));
    const overview = within(screen.getByRole('dialog'));
    expect(overview.getByText(/too long for a Google Maps link/)).toBeTruthy();
    fireEvent.click(overview.getByRole('button', { name: 'Set location' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert').textContent).toContain('set an exact map pin');
    await pickDestination();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(readData().data.places[0].address).toBe('街'.repeat(500));
    const directions = screen.getByRole('link', {
      name: 'Directions to Long address stop',
    }) as HTMLAnchorElement;
    expect(new URL(directions.href).searchParams.get('destination')).toBe('10.293,123.902');
  });
});
