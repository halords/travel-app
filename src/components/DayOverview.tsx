import { ArrowUpRight, MapPin, MapPinned, Navigation } from 'lucide-react';
import { dayRoutes } from '../lib/day-overview';
import { formatDate, mapLinkError, type Place, type TravelMode } from '../lib/model';
import { Modal } from './Modal';

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
  const connected = routes.every(
    (route, index) => index === 0 || route.from === routes[index - 1].to,
  );
  return (
    <Modal
      title="Your day, at a glance"
      subtitle={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
      onClose={onClose}
    >
      <div className="form-content">
        <div className="overview-intro">
          <MapPinned size={26} />
          <p>Open your destinations in Google Maps, in the order you’ve planned them.</p>
        </div>
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
