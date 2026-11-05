import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, LoaderCircle, MapPin, Plus, Search } from 'lucide-react';
import {
  categories,
  categoryLabels,
  formatDate,
  mapLinkError,
  tripDays,
  type Place,
  type PlaceInput,
  type Trip,
} from '../lib/model';
import { searchPlaces, type SearchResult } from '../lib/search';
import { Modal } from './Modal';
const PlacePickerMap = lazy(() => import('./PlacePickerMap'));

export function PlaceForm({
  trip,
  place,
  initialDate,
  onSave,
  onClose,
  onDelete,
}: {
  trip: Trip;
  place?: Place;
  initialDate: string | null;
  onSave: (input: PlaceInput, id?: string) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<PlaceInput>(() => ({
    tripId: trip.id,
    name: place?.name ?? '',
    address: place?.address ?? '',
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    category: place?.category ?? 'sightseeing',
    date: place ? place.date : initialDate,
    time: place?.time ?? null,
    duration: place?.duration ?? 60,
    notes: place?.notes ?? '',
  }));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(place?.latitude !== null && place?.latitude !== undefined);
  const [coordinates, setCoordinates] = useState({
    latitude: place?.latitude?.toString() ?? '',
    longitude: place?.longitude?.toString() ?? '',
  });
  const [pinSource, setPinSource] = useState<'address' | 'manual'>('address');
  const controller = useRef<AbortController | null>(null);
  const searchGeneration = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);
  const update = <K extends keyof PlaceInput>(key: K, value: PlaceInput[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const search = async () => {
    if (query.trim().length < 2) {
      setSearchError('Type at least two characters to search.');
      return;
    }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const generation = ++searchGeneration.current;
    const timeout = window.setTimeout(() => active.abort(), 12_000);
    setSearching(true);
    setSearchError('');
    setSearched(false);
    setResults([]);
    try {
      const found = await searchPlaces(query, trip.destination, active.signal);
      if (generation === searchGeneration.current) {
        setResults(found);
        setSearched(true);
      }
    } catch (failure) {
      if (generation === searchGeneration.current)
        setSearchError(
          active.signal.aborted
            ? 'Search took too long. Try again, or add the address below.'
            : failure instanceof Error
              ? failure.message
              : 'Search is unavailable. Add this place manually below.',
        );
    } finally {
      window.clearTimeout(timeout);
      if (generation === searchGeneration.current) setSearching(false);
    }
  };
  const select = (result: SearchResult) => {
    setForm((previous) => ({ ...previous, ...result }));
    setCoordinates({ latitude: String(result.latitude), longitude: String(result.longitude) });
    setPinSource('address');
    setResults([]);
    setSearched(false);
    setQuery('');
    setSearchError('');
    setShowMap(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const lat = coordinates.latitude.trim();
    const lon = coordinates.longitude.trim();
    if (!!lat !== !!lon) return setError('Enter both latitude and longitude, or leave both empty.');
    const latitude = lat ? Number(lat) : null;
    const longitude = lon ? Number(lon) : null;
    if (
      (latitude !== null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))
    )
      return setError('Latitude must be −90 to 90; longitude must be −180 to 180.');
    const input = {
      ...form,
      latitude,
      longitude,
      name: form.name.trim(),
      address: form.address.trim(),
    };
    const locationError = mapLinkError(input);
    if (locationError) return setError(locationError);
    try {
      onSave(input, place?.id);
    } catch {
      setError('Please check the place name, address, and time.');
    }
  };
  return (
    <Modal
      title={place ? 'Edit this little stop' : 'Add somewhere good'}
      subtitle={
        place
          ? 'Keep the details handy for when you get there.'
          : `Find a place in ${trip.destination}, or add your own.`
      }
      onClose={onClose}
    >
      <form className="form-content place-form" onSubmit={submit}>
        <div className="place-search">
          <label className="field" htmlFor="place-search">
            Find a place
          </label>
          <div className="search-row">
            <div className="input-icon">
              <Search size={18} />
              <input
                id="place-search"
                autoFocus={!place}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void search();
                  }
                }}
                placeholder="A café, a landmark, a little detour…"
                maxLength={180}
              />
            </div>
            <button
              type="button"
              className="button primary"
              disabled={searching}
              onClick={() => void search()}
              aria-label="Search for places"
            >
              {searching ? <LoaderCircle size={18} className="spin" /> : <Search size={18} />}
              <span>Search</span>
            </button>
          </div>
          <div aria-live="polite">
            {searchError && <p className="search-message">{searchError}</p>}
            {searched && results.length === 0 && (
              <p className="search-message">
                No matches nearby. Try a more specific name, or enter an address below.
              </p>
            )}
          </div>
          {results.length > 0 && (
            <ul className="search-results">
              {results.map((result, i) => (
                <li key={`${result.latitude}-${result.longitude}-${i}`}>
                  <button type="button" onClick={() => select(result)}>
                    <MapPin size={18} />
                    <span>
                      <strong>{result.name}</strong>
                      <small>{result.address}</small>
                    </span>
                    <Plus size={17} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="search-credit">
            Place search by{' '}
            <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">
              Photon
            </a>{' '}
            ·{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>
          </p>
        </div>
        {showMap ? (
          <Suspense
            fallback={<div className="picker-loading">Opening the destination picker…</div>}
          >
            <PlacePickerMap
              latitude={coordinates.latitude === '' ? null : Number(coordinates.latitude)}
              longitude={coordinates.longitude === '' ? null : Number(coordinates.longitude)}
              onPick={(latitude, longitude) => {
                setCoordinates({ latitude: String(latitude), longitude: String(longitude) });
                setPinSource('manual');
              }}
            />
          </Suspense>
        ) : (
          <button
            type="button"
            className="text-button pick-map-button"
            onClick={() => setShowMap(true)}
          >
            <MapPin size={15} />
            Or choose a point on the map
          </button>
        )}
        <div className="form-divider">
          <span>THE DETAILS</span>
        </div>
        <label className="field">
          Place name
          <input
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Fushimi Inari Taisha"
            required
            maxLength={180}
          />
        </label>
        <label className="field">
          Address
          <input
            value={form.address}
            onChange={(e) => {
              update('address', e.target.value);
              if (pinSource === 'address') setCoordinates({ latitude: '', longitude: '' });
            }}
            placeholder="Street, city, country"
            required
            maxLength={500}
          />
        </label>
        {coordinates.latitude && coordinates.longitude && (
          <p className="pinned-hint">
            <Check size={14} />
            Exact destination set for your maps app.
          </p>
        )}
        <div className="form-row">
          <label className="field">
            Day
            <select
              value={form.date ?? ''}
              onChange={(e) => update('date', e.target.value || null)}
            >
              <option value="">Save for later</option>
              {tripDays(trip).map((day, i) => (
                <option key={day} value={day}>
                  Day {i + 1} ·{' '}
                  {formatDate(day, { month: 'short', day: 'numeric', weekday: 'short' })}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Time <span className="optional">optional</span>
            <input
              type="time"
              value={form.time ?? ''}
              onChange={(e) => update('time', e.target.value || null)}
            />
          </label>
        </div>
        <div className="form-row">
          <label className="field">
            Category
            <select
              value={form.category}
              onChange={(e) => update('category', e.target.value as PlaceInput['category'])}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabels[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Time to spend <span className="optional">minutes</span>
            <input
              type="number"
              min={0}
              max={1440}
              step={15}
              value={form.duration}
              onChange={(e) => update('duration', Number(e.target.value))}
              required
            />
          </label>
        </div>
        <label className="field">
          Notes <span className="optional">optional</span>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="A reservation, a must-try dish, a reminder…"
            maxLength={3000}
          />
        </label>
        <details className="coordinate-details">
          <summary>
            Coordinates <span className="optional">optional</span>
            <ChevronDown size={14} />
          </summary>
          <p>If you know the exact pin, add it here. An address works for directions too.</p>
          <div className="form-row">
            <label className="field">
              Latitude
              <input
                type="number"
                step="any"
                min={-90}
                max={90}
                value={coordinates.latitude}
                onChange={(e) => {
                  setCoordinates((previous) => ({ ...previous, latitude: e.target.value }));
                  setPinSource('manual');
                }}
                placeholder="35.0116"
              />
            </label>
            <label className="field">
              Longitude
              <input
                type="number"
                step="any"
                min={-180}
                max={180}
                value={coordinates.longitude}
                onChange={(e) => {
                  setCoordinates((previous) => ({ ...previous, longitude: e.target.value }));
                  setPinSource('manual');
                }}
                placeholder="135.7681"
              />
            </label>
          </div>
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          {place && onDelete ? (
            <button type="button" className="text-button danger" onClick={onDelete}>
              Delete place
            </button>
          ) : (
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="submit" className="button primary">
            {place ? 'Save changes' : 'Add to my trip'}
            {place ? <Check size={17} /> : <Plus size={17} />}
          </button>
        </div>
      </form>
    </Modal>
  );
}
