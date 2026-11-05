import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Cloud,
  CloudOff,
  Compass,
  Download,
  LayoutGrid,
  Leaf,
  LoaderCircle,
  LogOut,
  MapPin,
  MapPinned,
  Navigation,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  Route,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useWorkspace } from './hooks/useWorkspace';
import { useInstall } from './hooks/useInstall';
import {
  activeTrips,
  dayDifference,
  formatDate,
  formatRange,
  markVisited,
  removePlace,
  removeTrip,
  reorderPlace,
  restoreBackup,
  savePlace,
  saveTrip,
  tripDays,
  tripPlaces,
  type Place,
  type PlaceInput,
  type Preferences,
  type Trip,
  type TripInput,
} from './lib/model';
import { readPreferences, writePreferences } from './lib/storage';
import { TripForm } from './components/TripForm';
import { PlaceForm } from './components/PlaceForm';
import { PlaceCard } from './components/PlaceCard';
import { AuthForm } from './components/AuthForm';
import { Settings, TravelModes, exportBackup, exportRawBackup } from './components/Settings';
import { DayOverview } from './components/DayOverview';
import { destinationPhoto } from './lib/destination-photos';
import { Modal } from './components/Modal';

type View = 'itinerary' | 'trips' | 'saved';
type OpenModal =
  | { type: 'trip'; trip?: Trip }
  | { type: 'place'; trip: Trip; place?: Place; date: string | null }
  | { type: 'auth' }
  | { type: 'settings' }
  | { type: 'signout' }
  | { type: 'install' }
  | { type: 'delete-trip'; trip: Trip }
  | { type: 'delete-place'; place: Place }
  | { type: 'overview'; places: Place[]; date: string }
  | null;
const isLater = (place: Place, trip: Trip) =>
  !place.date || place.date < trip.startDate || place.date > trip.endDate;

function Brand() {
  return (
    <span className="brand">
      <img src="/favicon.svg" width="35" height="35" alt="" />
      <span>
        roam<span className="brand-dot">.</span>
      </span>
    </span>
  );
}

export default function App() {
  const workspace = useWorkspace();
  const install = useInstall();
  const trips = useMemo(() => activeTrips(workspace.data), [workspace.data]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(
    () => activeTrips(workspace.data)[0]?.id ?? null,
  );
  const trip = trips.find((t) => t.id === selectedTripId) ?? trips[0];
  const photo = destinationPhoto(trip?.destination ?? '');
  const [view, setView] = useState<View>(() => (trips.length ? 'itinerary' : 'trips'));
  const [selectedDay, setSelectedDay] = useState<string>(() => trip?.startDate ?? 'all');
  const [modal, setModal] = useState<OpenModal>(null);
  const [preferences, setPreferences] = useState(readPreferences);
  const [toast, setToast] = useState('');
  const [tripSearch, setTripSearch] = useState('');
  const lastAccount = useRef(workspace.user?.id);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const places = useMemo(
    () => (trip ? tripPlaces(workspace.data, trip.id) : []),
    [workspace.data, trip],
  );
  const savedPlaces = useMemo(
    () => trips.flatMap((t) => tripPlaces(workspace.data, t.id).filter((p) => isLater(p, t))),
    [workspace.data, trips],
  );
  const laterPlaces = trip ? places.filter((p) => isLater(p, trip)) : [];
  const days = trip ? tripDays(trip) : [];

  useEffect(() => {
    if (
      trip &&
      selectedDay !== 'all' &&
      selectedDay !== 'later' &&
      (selectedDay < trip.startDate || selectedDay > trip.endDate)
    )
      setSelectedDay(trip.startDate);
  }, [trip, selectedDay]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (lastAccount.current !== workspace.user?.id) {
      lastAccount.current = workspace.user?.id;
      setModal(null);
    }
  }, [workspace.user?.id]);

  const selectTrip = (next: Trip) => {
    setSelectedTripId(next.id);
    setSelectedDay(next.startDate);
    setView('itinerary');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const updatePreferences = (next: Preferences) => {
    setPreferences(next);
    try {
      writePreferences(next);
    } catch {
      setToast('Couldn’t save your preference on this device.');
    }
  };
  const openInstall = async () => {
    if (!(await install.install())) setModal({ type: 'install' });
  };
  const openNewPlace = (date?: string | null) => {
    if (!trip) {
      setModal({ type: 'trip' });
      return;
    }
    setModal({
      type: 'place',
      trip,
      date:
        date !== undefined
          ? date
          : view === 'saved' || selectedDay === 'later'
            ? null
            : selectedDay === 'all'
              ? trip.startDate
              : selectedDay,
    });
  };
  const onSaveTrip = (input: TripInput, id?: string) => {
    const nextId = id ?? crypto.randomUUID();
    workspace.commit((current) => saveTrip(current, input, nextId));
    setSelectedTripId(nextId);
    setSelectedDay(input.startDate);
    setView('itinerary');
    setModal(null);
    setToast(id ? 'Trip details saved.' : 'Your next adventure starts here.');
  };
  const onSavePlace = (input: PlaceInput, id?: string) => {
    workspace.commit((current) => savePlace(current, input, id));
    setSelectedTripId(input.tripId);
    setSelectedDay(input.date ?? 'later');
    setView('itinerary');
    setModal(null);
    setToast(id ? 'Place updated. You’re good to go.' : 'One more place to look forward to.');
  };

  const statusText = !workspace.online
    ? 'Offline · saved here'
    : !workspace.user
      ? 'Saved on this device'
      : (
          {
            local: 'Saved on this device',
            syncing: 'Syncing…',
            synced: 'All changes synced',
            offline: 'Saved on this device',
            error: 'Saved · sync pending',
            signin: 'Sign in to sync',
          } as const
        )[workspace.status];
  const StatusIcon = !workspace.online
    ? WifiOff
    : workspace.status === 'syncing'
      ? LoaderCircle
      : workspace.status === 'synced'
        ? Cloud
        : workspace.status === 'error'
          ? CloudOff
          : ShieldCheck;
  const provider = preferences.mapProvider === 'google' ? 'Google Maps' : 'Apple Maps';
  const visibleDays =
    selectedDay === 'all'
      ? days.filter((date) => places.some((p) => p.date === date))
      : selectedDay === 'later'
        ? []
        : [selectedDay];
  const selectedPlaces =
    selectedDay === 'later'
      ? laterPlaces
      : selectedDay === 'all'
        ? places.filter((p) => p.date && days.includes(p.date))
        : places.filter((p) => p.date === selectedDay);
  const plannedMinutes = selectedPlaces.reduce((sum, p) => sum + p.duration, 0);
  const visited = selectedPlaces.filter((p) => p.visited).length;

  const renderPlace = (place: Place, index: number, group: Place[]) => {
    const parent = trips.find((t) => t.id === place.tripId)!;
    return (
      <PlaceCard
        key={place.id}
        place={place}
        index={index + 1}
        preferences={preferences}
        first={index === 0}
        last={index === group.length - 1}
        onEdit={() => setModal({ type: 'place', trip: parent, place, date: place.date })}
        onVisited={() => workspace.commit((current) => markVisited(current, place.id))}
        onMove={(direction) =>
          workspace.commit((current) => reorderPlace(current, place.id, direction))
        }
      />
    );
  };
  const overviewButton = (group: Place[], date: string) => {
    if (!group.length) return null;
    return (
      <button
        type="button"
        className="day-overview-button"
        onClick={() => setModal({ type: 'overview', places: group, date })}
      >
        <MapPinned size={15} />
        <span>Day overview</span>
        <ArrowUpRight size={14} />
      </button>
    );
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to itinerary
      </a>
      <aside className="sidebar">
        <button
          type="button"
          className="brand-button"
          onClick={() => setView('trips')}
          aria-label="Roam, my trips"
        >
          <Brand />
        </button>
        <p className="brand-caption">A little plan. A great trip.</p>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={view === 'itinerary' ? 'active' : ''}
            aria-current={view === 'itinerary' ? 'page' : undefined}
            onClick={() => setView(trip ? 'itinerary' : 'trips')}
          >
            <Route size={19} />
            My itinerary
          </button>
          <button
            className={view === 'trips' ? 'active' : ''}
            aria-current={view === 'trips' ? 'page' : undefined}
            onClick={() => setView('trips')}
          >
            <LayoutGrid size={19} />
            My trips<span className="nav-count">{trips.length}</span>
          </button>
          <button
            className={view === 'saved' ? 'active' : ''}
            aria-current={view === 'saved' ? 'page' : undefined}
            onClick={() => setView('saved')}
          >
            <Bookmark size={19} />
            Saved for later
            {savedPlaces.length > 0 && <span className="nav-count">{savedPlaces.length}</span>}
          </button>
        </nav>
        <div className="sidebar-trip-section">
          <div className="sidebar-divider" />
          <div className="sidebar-label">
            <span>YOUR TRIPS</span>
            <button
              className="icon-button"
              type="button"
              aria-label="Create a new trip"
              onClick={() => setModal({ type: 'trip' })}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="sidebar-trips">
            {trips.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`sidebar-trip ${view === 'itinerary' && trip?.id === t.id ? 'selected' : ''}`}
                aria-current={view === 'itinerary' && trip?.id === t.id ? 'page' : undefined}
                onClick={() => selectTrip(t)}
              >
                <span className={`trip-mini-icon cover-${t.cover}`}>
                  <Plane size={17} />
                </span>
                <span>
                  <strong title={t.title}>{t.title}</strong>
                  <small>
                    {formatDate(t.startDate)} – {formatDate(t.endDate)}
                  </small>
                </span>
                {view === 'itinerary' && trip?.id === t.id && <span className="selected-dot" />}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="new-trip-button"
            onClick={() => setModal({ type: 'trip' })}
          >
            <Plus size={16} />
            Plan a new trip
          </button>
        </div>
        <div className="sidebar-bottom">
          {!install.installed && (
            <div className="install-card">
              <span className="install-icon">
                <Compass size={24} strokeWidth={1.5} />
              </span>
              <h3>A pocket-sized plan.</h3>
              <p>Keep your next adventure just a tap away.</p>
              <button type="button" onClick={() => void openInstall()}>
                <Download size={15} />
                Install Roam
                <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          <button
            type="button"
            className="sidebar-settings"
            onClick={() => setModal({ type: 'settings' })}
          >
            <Settings2 size={18} />
            Settings & account
          </button>
          {workspace.user && (
            <button
              type="button"
              className="sidebar-signout"
              onClick={() => setModal({ type: 'signout' })}
            >
              <LogOut size={17} />
              Sign out
            </button>
          )}
          <span className="sidebar-footer">
            Less scrolling. More exploring.
            <Leaf size={12} />
          </span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="breadcrumbs">
            <button type="button" onClick={() => setView('trips')}>
              My trips
            </button>
            {view !== 'trips' && (
              <>
                <ChevronRight size={14} />
                <span>{view === 'itinerary' ? 'Itinerary' : 'Saved for later'}</span>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span
              className={`sync-indicator ${workspace.status === 'error' ? 'pending' : ''}`}
              role="status"
              aria-label={statusText}
            >
              <StatusIcon
                size={14}
                className={workspace.status === 'syncing' && workspace.online ? 'spin' : ''}
              />
              <span>{statusText}</span>
            </span>
            <span className="topbar-separator" />
            <button
              className={`account-button ${workspace.authenticated ? 'signed-in' : ''}`}
              type="button"
              aria-label={workspace.authenticated ? 'Settings and account' : 'Sign in'}
              onClick={() => setModal({ type: workspace.authenticated ? 'settings' : 'auth' })}
            >
              {workspace.authenticated && workspace.user ? (
                <>
                  <span className="avatar">{workspace.user.name.slice(0, 1).toUpperCase()}</span>
                  <span className="account-name">{workspace.user.name}</span>
                  <Settings2 size={15} />
                </>
              ) : (
                <>
                  <UserRound size={17} />
                  <span>Sign in</span>
                </>
              )}
            </button>
          </div>
        </header>
        {!workspace.online && (
          <div className="connection-banner">
            <WifiOff size={15} />
            You’re offline. Keep planning—your changes are saved on this device.
          </div>
        )}
        {workspace.error && (
          <div className="storage-error" role="alert">
            <p>{workspace.error}</p>
            <button
              type="button"
              onClick={() =>
                workspace.recoveryBackup
                  ? exportRawBackup(workspace.recoveryBackup)
                  : exportBackup(workspace.data)
              }
            >
              {workspace.recoveryBackup ? 'Download original data' : 'Export backup'}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss storage message"
              onClick={workspace.clearError}
            >
              <X size={16} />
            </button>
          </div>
        )}

        <main id="main-content" className="main-content">
          {view === 'itinerary' && trip ? (
            <>
              <section
                className={`trip-hero cover-${trip.cover} ${photo ? 'photo-hero' : ''}`}
                aria-label="Trip details"
              >
                {photo ? (
                  <img className="hero-photo" src={photo.src} alt={photo.alt} />
                ) : (
                  <div className="hero-illustration" aria-hidden="true">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <span className="hero-pin">
                      <MapPin size={55} strokeWidth={1.1} />
                    </span>
                    <Plane className="hero-plane" size={33} strokeWidth={1.2} />
                    <span className="hero-dotted-line" />
                  </div>
                )}
                <div className="hero-shade" />
                {photo && (
                  <a
                    className="hero-photo-credit"
                    href={photo.source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {photo.region} inspiration · Unsplash
                  </a>
                )}
                <div className="hero-actions">
                  {trip.isDemo && <span className="sample-badge">Sample trip</span>}
                  <button
                    type="button"
                    className="hero-edit"
                    aria-label="Edit trip details"
                    onClick={() => setModal({ type: 'trip', trip })}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <div className="hero-content">
                  <span className="hero-destination">
                    <MapPin size={14} />
                    {trip.destination}
                  </span>
                  <h1>{trip.title}</h1>
                  {trip.notes && <p>{trip.notes}</p>}
                  <div className="hero-meta">
                    <span>
                      <CalendarDays size={15} />
                      {formatRange(trip)}
                    </span>
                    <span className="hero-meta-dot">·</span>
                    <span>
                      {days.length} {days.length === 1 ? 'day' : 'days'}
                    </span>
                    <span className="hero-meta-dot">·</span>
                    <span>
                      {places.length} {places.length === 1 ? 'place' : 'places'}
                    </span>
                  </div>
                </div>
              </section>
              {trip.isDemo && (
                <p className="demo-caption">
                  <Sparkles size={13} />A little inspiration to get you started.
                  <button type="button" onClick={() => setModal({ type: 'trip' })}>
                    Create your own trip
                    <ArrowRight size={12} />
                  </button>
                </p>
              )}

              <div className="plan-title-row">
                <div>
                  <h2>The itinerary</h2>
                  <p>A plan for the day. Room for a little spontaneity.</p>
                </div>
                <button
                  type="button"
                  className="button primary add-place-top"
                  onClick={() => openNewPlace()}
                >
                  <Plus size={17} />
                  Add a place
                </button>
              </div>
              <div className="day-tabs" role="group" aria-label="Choose itinerary day">
                <button
                  type="button"
                  className={`day-tab all-days ${selectedDay === 'all' ? 'active' : ''}`}
                  aria-pressed={selectedDay === 'all'}
                  onClick={() => setSelectedDay('all')}
                >
                  <CalendarDays size={16} />
                  <span>All days</span>
                </button>
                {days.map((date, index) => (
                  <button
                    type="button"
                    key={date}
                    className={`day-tab ${selectedDay === date ? 'active' : ''}`}
                    aria-pressed={selectedDay === date}
                    onClick={() => setSelectedDay(date)}
                  >
                    <strong>Day {index + 1}</strong>
                    <span>{formatDate(date, { month: 'short', day: 'numeric' })}</span>
                    <span className="tab-place-count">
                      {places.filter((p) => p.date === date).length}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`day-tab later-tab ${selectedDay === 'later' ? 'active' : ''}`}
                  aria-pressed={selectedDay === 'later'}
                  onClick={() => setSelectedDay('later')}
                >
                  <Bookmark size={15} />
                  <span>For later</span>
                  {laterPlaces.length > 0 && (
                    <span className="tab-place-count">{laterPlaces.length}</span>
                  )}
                </button>
              </div>
              <div className="plan-layout">
                <div className="itinerary-column">
                  {selectedDay === 'later' ? (
                    <section className="day-group">
                      <div className="day-group-heading">
                        <div>
                          <span className="eyebrow">NO RUSH</span>
                          <h3>A few possibilities</h3>
                        </div>
                        <span className="muted-count">{laterPlaces.length} saved</span>
                      </div>
                      {laterPlaces.length ? (
                        <div className="timeline">
                          {laterPlaces.map((p, i) => renderPlace(p, i, laterPlaces))}
                        </div>
                      ) : (
                        <EmptyDay later onAdd={() => openNewPlace(null)} />
                      )}
                    </section>
                  ) : visibleDays.length ? (
                    visibleDays.map((date) => {
                      const group = places.filter((p) => p.date === date);
                      return (
                        <section className="day-group" key={date}>
                          <div className="day-group-heading">
                            <div>
                              <span className="eyebrow">
                                DAY {dayDifference(trip.startDate, date) + 1}
                              </span>
                              <h3>
                                {formatDate(date, {
                                  weekday: 'long',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </h3>
                            </div>
                            {overviewButton(group, date)}
                          </div>
                          {group.length ? (
                            <>
                              <div className="timeline">
                                {group.map((p, i) => renderPlace(p, i, group))}
                              </div>
                              <button
                                type="button"
                                className="add-stop-row"
                                onClick={() => openNewPlace(date)}
                              >
                                <span>
                                  <Plus size={15} />
                                </span>
                                Add another little stop
                              </button>
                            </>
                          ) : (
                            <EmptyDay onAdd={() => openNewPlace(date)} />
                          )}
                        </section>
                      );
                    })
                  ) : (
                    <EmptyDay onAdd={() => openNewPlace(trip.startDate)} />
                  )}
                </div>
                <aside className="trip-aside">
                  <section className="getting-around">
                    <span className="eyebrow">LESS SEARCHING, MORE GOING</span>
                    <div className="aside-heading">
                      <span className="navigation-art">
                        <Navigation size={24} strokeWidth={1.6} />
                      </span>
                      <h3>Getting there, made easy.</h3>
                    </div>
                    <p>
                      Tap a place or <strong>Directions</strong> to open your maps app. Your
                      destination is already set.
                    </p>
                    <label className="field compact-field" htmlFor="quick-map-provider">
                      Open directions in
                      <select
                        id="quick-map-provider"
                        value={preferences.mapProvider}
                        onChange={(e) =>
                          updatePreferences({
                            ...preferences,
                            mapProvider: e.target.value as Preferences['mapProvider'],
                          })
                        }
                      >
                        <option value="google">Google Maps</option>
                        <option value="apple">Apple Maps</option>
                      </select>
                    </label>
                    <TravelModes preferences={preferences} onChange={updatePreferences} />
                    <div className="day-overview-tip">
                      <MapPinned size={17} />
                      <p>
                        <strong>A bird’s-eye view</strong>Use Day overview to see that day’s stops
                        together in Google Maps.
                      </p>
                    </div>
                  </section>
                  <section className="day-summary">
                    <span className="eyebrow">
                      {selectedDay === 'all'
                        ? 'YOUR TRIP'
                        : selectedDay === 'later'
                          ? 'ON YOUR LIST'
                          : 'A DAY WELL SPENT'}
                    </span>
                    <div className="summary-numbers">
                      <div>
                        <strong>{selectedPlaces.length}</strong>
                        <span>places to explore</span>
                      </div>
                      <div>
                        <strong>
                          {plannedMinutes >= 60
                            ? `${Math.floor(plannedMinutes / 60)}h${plannedMinutes % 60 ? ` ${plannedMinutes % 60}m` : ''}`
                            : `${plannedMinutes}m`}
                        </strong>
                        <span>time planned</span>
                      </div>
                    </div>
                    <div className="progress-label">
                      <span>
                        {visited} of {selectedPlaces.length} visited
                      </span>
                      {visited === selectedPlaces.length && visited > 0 && <Check size={14} />}
                    </div>
                    <progress
                      value={visited}
                      max={selectedPlaces.length || 1}
                      aria-label="Places visited"
                    />
                    <p>
                      <Leaf size={13} />
                      Leave some time for the unexpected.
                    </p>
                  </section>
                </aside>
              </div>
              <div className="mobile-map-preference">
                <Navigation size={14} />
                <button type="button" onClick={() => setModal({ type: 'settings' })}>
                  {preferences.travelMode[0].toUpperCase() + preferences.travelMode.slice(1)}{' '}
                  directions in {provider}
                  <ChevronRight size={14} />
                </button>
              </div>
            </>
          ) : view === 'saved' ? (
            <section className="saved-view">
              <div className="view-heading">
                <div>
                  <span className="eyebrow">GOOD IDEAS LIVE HERE</span>
                  <h1>Saved for a someday.</h1>
                  <p>Places you’d love to go. Pick a day when you’re ready.</p>
                </div>
                <button className="button primary" type="button" onClick={() => openNewPlace(null)}>
                  <Plus size={17} />
                  Save a place
                </button>
              </div>
              {savedPlaces.length ? (
                trips.map((t) => {
                  const group = savedPlaces.filter((p) => p.tripId === t.id);
                  return group.length ? (
                    <section className="day-group" key={t.id}>
                      <div className="day-group-heading">
                        <div>
                          <span className="eyebrow">{t.destination}</span>
                          <h3>{t.title}</h3>
                        </div>
                        <button type="button" className="text-button" onClick={() => selectTrip(t)}>
                          View trip
                          <ArrowRight size={15} />
                        </button>
                      </div>
                      <div className="timeline">
                        {group.map((p, i) => renderPlace(p, i, group))}
                      </div>
                    </section>
                  ) : null;
                })
              ) : (
                <div className="large-empty">
                  <span className="empty-icon">
                    <Bookmark size={33} strokeWidth={1.4} />
                  </span>
                  <h2>A little room for inspiration.</h2>
                  <p>
                    Save that café, a quiet beach, or somewhere a friend mentioned. Add it to a day
                    whenever you’re ready.
                  </p>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => openNewPlace(null)}
                  >
                    <Plus size={17} />
                    Save your first place
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="trips-view">
              <div className="view-heading">
                <div>
                  <span className="eyebrow">YOUR NEXT CHAPTER</span>
                  <h1>
                    A little plan.
                    <br />A great trip.
                  </h1>
                  <p>Somewhere new, or somewhere you love. Let’s go.</p>
                </div>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => setModal({ type: 'trip' })}
                >
                  <Plus size={18} />
                  New trip
                </button>
              </div>
              {(trips.length > 4 || tripSearch !== '') && (
                <label className="field trip-search">
                  Find a trip
                  <input
                    value={tripSearch}
                    onChange={(e) => setTripSearch(e.target.value)}
                    placeholder="Search your trips"
                  />
                </label>
              )}
              <div className="trip-grid">
                {trips
                  .filter((t) =>
                    `${t.title} ${t.destination}`.toLowerCase().includes(tripSearch.toLowerCase()),
                  )
                  .map((t) => (
                    <button
                      type="button"
                      className="trip-card"
                      key={t.id}
                      onClick={() => selectTrip(t)}
                    >
                      <div className={`trip-card-art cover-${t.cover}`}>
                        {destinationPhoto(t.destination) ? (
                          <img
                            src={destinationPhoto(t.destination)!.src}
                            alt={destinationPhoto(t.destination)!.alt}
                            loading="lazy"
                          />
                        ) : (
                          <>
                            <Plane size={43} strokeWidth={1.2} />
                            <span className="trip-card-orbit" />
                          </>
                        )}
                        {t.isDemo && <span className="sample-badge">Sample trip</span>}
                        <span className="trip-card-destination">
                          <MapPin size={13} />
                          {t.destination}
                        </span>
                      </div>
                      <div className="trip-card-body">
                        <h2>{t.title}</h2>
                        <p>
                          <CalendarDays size={14} />
                          {formatRange(t)}
                        </p>
                        <div>
                          <span>
                            {tripPlaces(workspace.data, t.id).length} places ·{' '}
                            {dayDifference(t.startDate, t.endDate) + 1} days
                          </span>
                          <ArrowUpRight size={18} />
                        </div>
                      </div>
                    </button>
                  ))}
                <button
                  type="button"
                  className="create-trip-card"
                  onClick={() => setModal({ type: 'trip' })}
                >
                  <span>
                    <Plus size={28} strokeWidth={1.4} />
                  </span>
                  <h2>Where to next?</h2>
                  <p>Make space for a new adventure.</p>
                </button>
              </div>
            </section>
          )}
          <footer className="main-footer">
            <span>Made for the way you wander.</span>
            <span>
              <img src="/favicon.svg" width="13" height="13" alt="" />
              roam.
            </span>
          </footer>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={view === 'trips' ? 'active' : ''}
          aria-current={view === 'trips' ? 'page' : undefined}
          onClick={() => setView('trips')}
        >
          <LayoutGrid size={20} />
          <span>My trips</span>
        </button>
        <button
          type="button"
          className={view === 'itinerary' ? 'active' : ''}
          aria-current={view === 'itinerary' ? 'page' : undefined}
          onClick={() => setView(trip ? 'itinerary' : 'trips')}
        >
          <Route size={20} />
          <span>Itinerary</span>
        </button>
        <button
          type="button"
          className="mobile-add-button"
          aria-label="Add a place"
          onClick={() => openNewPlace()}
        >
          <span>
            <Plus size={25} />
          </span>
          <small>Add place</small>
        </button>
        <button
          type="button"
          className={view === 'saved' ? 'active' : ''}
          aria-current={view === 'saved' ? 'page' : undefined}
          onClick={() => setView('saved')}
        >
          <Bookmark size={20} />
          <span>For later</span>
        </button>
        <button type="button" onClick={() => setModal({ type: 'settings' })}>
          <Settings2 size={20} />
          <span>Settings</span>
        </button>
      </nav>

      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          <span>{toast}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {needRefresh && (
        <div className="update-banner" role="status">
          <RefreshCw size={17} />
          <span>A fresh version of Roam is ready.</span>
          <button type="button" onClick={() => void updateServiceWorker(true)}>
            Update
          </button>
          <button type="button" aria-label="Dismiss update" onClick={() => setNeedRefresh(false)}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal?.type === 'trip' && (
        <TripForm
          trip={modal.trip}
          onClose={() => setModal(null)}
          onSave={onSaveTrip}
          onDelete={
            modal.trip ? () => setModal({ type: 'delete-trip', trip: modal.trip! }) : undefined
          }
        />
      )}
      {modal?.type === 'place' && (
        <PlaceForm
          trip={modal.trip}
          place={modal.place}
          initialDate={modal.date}
          onClose={() => setModal(null)}
          onSave={onSavePlace}
          onDelete={
            modal.place ? () => setModal({ type: 'delete-place', place: modal.place! }) : undefined
          }
        />
      )}
      {modal?.type === 'auth' && (
        <AuthForm
          configured={workspace.configured}
          defaultEmail={workspace.user?.email}
          onClose={() => setModal(null)}
          onSubmit={async (input) => {
            await workspace.authenticate(input);
            setModal(null);
            setToast(
              input.action === 'signup'
                ? 'You’re all set. Your trips will sync automatically.'
                : 'Welcome back. Picking up your latest plans…',
            );
          }}
        />
      )}
      {(modal?.type === 'settings' || modal?.type === 'signout') && (
        <Settings
          onClose={() => setModal(null)}
          preferences={preferences}
          onPreferences={updatePreferences}
          user={workspace.user}
          authenticated={workspace.authenticated}
          status={workspace.status}
          lastSynced={workspace.lastSynced}
          data={workspace.data}
          onImport={(raw) => {
            const result = restoreBackup(workspace.data, raw);
            workspace.commit(result);
          }}
          onSignIn={() => setModal({ type: 'auth' })}
          onSignOut={workspace.signOut}
          initialConfirmSignOut={modal.type === 'signout'}
          onSync={workspace.synchronize}
          onInstall={() => void openInstall()}
          installed={install.installed}
        />
      )}
      {modal?.type === 'overview' && (
        <DayOverview
          places={modal.places}
          date={modal.date}
          mode={preferences.travelMode}
          onClose={() => setModal(null)}
          onEditPlace={(place) => {
            const parent = trips.find((t) => t.id === place.tripId);
            if (parent) setModal({ type: 'place', trip: parent, place, date: place.date });
          }}
        />
      )}
      {modal?.type === 'install' && (
        <Modal
          title="Your whole trip. In your pocket."
          subtitle="Install Roam for a little less friction on the go."
          onClose={() => setModal(null)}
        >
          <div className="form-content install-instructions">
            <span className="install-large-icon">
              <Brand />
            </span>
            <div>
              <h3>On iPhone or iPad</h3>
              <p>
                Open Roam in Safari, tap the Share button, then choose{' '}
                <strong>Add to Home Screen</strong>.
              </p>
            </div>
            <div>
              <h3>On Android</h3>
              <p>
                Open Roam in Chrome, tap the three-dot menu, then choose{' '}
                <strong>Add to Home screen</strong> or <strong>Install app</strong>.
              </p>
            </div>
            <div>
              <h3>On your computer</h3>
              <p>Use the install icon in the address bar in Chrome or Edge.</p>
            </div>
            <p className="notice">
              Visit Roam online once after installing. Your saved itinerary will then be available
              offline; maps and sync need a connection.
            </p>
            <button
              type="button"
              className="button primary full-width"
              onClick={() => setModal(null)}
            >
              Got it
              <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete-trip' && (
        <Modal
          title="Say goodbye to this trip?"
          subtitle={modal.trip.title}
          onClose={() => setModal(null)}
        >
          <div className="form-content">
            <p className="delete-message">
              This removes the trip and all its places from your devices after syncing. You can
              export a backup in Settings first.
            </p>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setModal(null)}>
                Keep trip
              </button>
              <button
                type="button"
                className="button danger-button"
                onClick={() => {
                  workspace.commit((current) => removeTrip(current, modal.trip.id));
                  setModal(null);
                  setView('trips');
                  setToast('Trip deleted.');
                }}
              >
                Delete trip
              </button>
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete-place' && (
        <Modal title="Remove this stop?" subtitle={modal.place.name} onClose={() => setModal(null)}>
          <div className="form-content">
            <p className="delete-message">
              This place will be removed from your itinerary and synced devices.
            </p>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setModal(null)}>
                Keep place
              </button>
              <button
                type="button"
                className="button danger-button"
                onClick={() => {
                  workspace.commit((current) => removePlace(current, modal.place.id));
                  setModal(null);
                  setToast('Place removed from your trip.');
                }}
              >
                Remove place
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EmptyDay({ onAdd, later = false }: { onAdd: () => void; later?: boolean }) {
  return (
    <div className="empty-day">
      <span className="empty-icon">
        {later ? <Bookmark size={27} strokeWidth={1.5} /> : <Compass size={30} strokeWidth={1.4} />}
      </span>
      <h3>{later ? 'Keep a good idea for later.' : 'A day full of possibilities.'}</h3>
      <p>
        {later
          ? 'Save a place now. Find the perfect day for it later.'
          : 'Add a place, a bite to eat, or something a little unexpected.'}
      </p>
      <button className="button secondary" type="button" onClick={onAdd}>
        <Plus size={16} />
        {later ? 'Save a place' : 'Add your first stop'}
      </button>
    </div>
  );
}
