import { lazy, Suspense } from 'react';
import { ArrowUpRight, MapPin, MapPinned, Navigation } from 'lucide-react';
import { dayRoutes } from '../lib/day-overview';
import {
  formatDate,
  formatTime,
  GOOGLE_MAPS_URL_LIMIT,
  mapDestination,
  mapLinkError,
  type Place,
  type TravelMode,
} from '../lib/model';
import { overviewPoints } from '../lib/overview-map';
import { Modal } from './Modal';

const DayOverviewMap = lazy(() => import('./DayOverviewMap'));

export function DayOverview({
  places,
  date,
  mode,
  onClose,
  onEditPlace,
}: {
  places: Place[];
  date: string;
  mode: TravelMode;
  onClose: () => void;
  onEditPlace: (place: Place) => void;
}) {
  const routes = dayRoutes(places, mode);
  const pinned = overviewPoints(places).length;
  const connected = routes.every(
    (route, index) => index === 0 || route.from === routes[index - 1].to,
  );
  return (
    <Modal
      title="Your day, at a glance"
      subtitle={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
      onClose={onClose}
      wide
    >
      <div className="form-content">
        <div className="overview-intro">
          <MapPinned size={26} />
          <p>
            <strong>
              {places.length} {places.length === 1 ? 'destination' : 'destinations'} for this day.
            </strong>{' '}
            See every stop here, then open directions in Google Maps.
          </p>
        </div>
        {pinned > 0 && (
          <Suspense fallback={<p className="picker-loading">Loading your destinations…</p>}>
            <DayOverviewMap places={places} />
          </Suspense>
        )}
        {pinned < places.length && (
          <p className="notice">
            {pinned} of {places.length} destinations have exact map pins. Address-only stops are
            listed below; set their location to show them on this map.
          </p>
        )}
        <ol className="overview-destinations" aria-label="Every destination for this day">
          {places.map((place, index) => {
            const url = `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: mapDestination(place) })}`;
            return (
              <li key={place.id}>
                <span className="overview-stop-number">{index + 1}</span>
                <div>
                  <strong>{place.name}</strong>
                  <p>{place.address}</p>
                  <small>
                    {formatTime(place.time)}
                    {place.visited ? ' · Visited' : ''}
                  </small>
                  {place.latitude === null && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => onEditPlace(place)}
                      aria-label={`Set map pin for ${place.name}`}
                    >
                      Set map pin
                    </button>
                  )}
                </div>
                {url.length <= GOOGLE_MAPS_URL_LIMIT && (
                  <a
                    className="day-overview-button"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${place.name} in Google Maps`}
                  >
                    <MapPin size={15} />
                    <span>View place</span>
                  </a>
                )}
              </li>
            );
          })}
        </ol>
        <h3 className="overview-routes-title">Directions for the day</h3>
        <p className="overview-map-help">
          Some Google Maps apps skip intermediate stops. Check the stops before starting; use the
          individual place links above if needed.
        </p>
        {routes.length > 1 && (
          <p className="notice">
            Google Maps links fit up to 5 places on phones. Long addresses may need smaller sections
            or individual places.{' '}
            {connected
              ? 'Neighboring sections share a stop to keep the route connected.'
              : 'Some sections open separately. Set exact map pins to connect more stops.'}
          </p>
        )}
        {mode === 'transit' && routes.some((route) => route.places.length > 2) && (
          <p className="notice">
            Google Maps doesn’t support multiple stops on a transit route. Sections with more than
            two places use driving; each place’s Directions button still uses transit.
          </p>
        )}
        <div className="overview-sections">
          {routes.map((route, index) => (
            <section key={index} className="overview-section">
              <div className="overview-section-heading">
                <strong>
                  {routes.length > 1
                    ? `Part ${index + 1} · ${route.from === route.to ? `stop ${route.from}` : `stops ${route.from}–${route.to}`}`
                    : `${route.places.length} ${route.places.length === 1 ? 'place' : 'places'} to explore`}
                </strong>
                <Navigation size={17} />
              </div>
              <ol start={route.from}>
                {route.places.map((place) => (
                  <li key={place.id}>{place.name}</li>
                ))}
              </ol>
              {route.url ? (
                <a
                  className="button primary full-width"
                  href={route.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={
                    routes.length > 1 ? `Open part ${index + 1} in Google Maps` : undefined
                  }
                >
                  Open in Google Maps
                  <ArrowUpRight size={17} />
                </a>
              ) : (
                <>
                  <p className="notice">{mapLinkError(route.places[0])}</p>
                  <button
                    type="button"
                    className="button primary full-width"
                    onClick={() => onEditPlace(route.places[0])}
                  >
                    Set location
                    <MapPin size={17} />
                  </button>
                </>
              )}
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
