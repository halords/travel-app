import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Check,
  Clock3,
  Coffee,
  Landmark,
  MapPin,
  MoreHorizontal,
  Navigation,
  ShoppingBag,
  TrainFront,
  Trees,
  Utensils,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  categoryLabels,
  directionsUrl,
  formatTime,
  GOOGLE_MAPS_URL_LIMIT,
  type Category,
  type Place,
  type Preferences,
} from '../lib/model';

export const categoryIcons = {
  sightseeing: Landmark,
  food: Utensils,
  cafe: Coffee,
  outdoors: Trees,
  shopping: ShoppingBag,
  stay: BedDouble,
  transport: TrainFront,
  other: MapPin,
};
export function CategoryIcon({ category, size = 22 }: { category: Category; size?: number }) {
  const Icon = categoryIcons[category];
  return <Icon size={size} strokeWidth={1.7} />;
}

export function PlaceCard({
  place,
  index,
  preferences,
  onVisited,
  onEdit,
  onMove,
  first,
  last,
}: {
  place: Place;
  index: number;
  preferences: Preferences;
  onVisited: () => void;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);
  const href = directionsUrl(place, preferences);
  const needsLocation = preferences.mapProvider === 'google' && href.length > GOOGLE_MAPS_URL_LIMIT;
  return (
    <article className={`place-card ${place.visited ? 'is-visited' : ''}`}>
      <div className="timeline-number" aria-label={`Stop ${index}`}>
        {place.visited ? <Check size={14} /> : index}
      </div>
      <div className={`place-art category-${place.category}`}>
        <CategoryIcon category={place.category} size={29} />
        <span className="art-circle" />
      </div>
      <div className="place-info">
        <div className="place-meta">
          <span className={`category-label category-text-${place.category}`}>
            {categoryLabels[place.category]}
          </span>
          {place.visited && (
            <span className="visited-label">
              <Check size={12} />
              Visited
            </span>
          )}
        </div>
        <h3>
          {needsLocation ? (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Set location for ${place.name}`}
              style={{ padding: 0, textAlign: 'left' }}
            >
              {place.name}
            </button>
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={`Get directions to ${place.name}`}
            >
              {place.name}
            </a>
          )}
        </h3>
        <p className="place-address">{place.address}</p>
        <div className="place-timing">
          <span>
            <Clock3 size={13} />
            {formatTime(place.time)}
          </span>
          {place.duration > 0 && (
            <>
              <span className="timing-dot">·</span>
              <span>
                {place.duration >= 60
                  ? `${Math.floor(place.duration / 60)}h${place.duration % 60 ? ` ${place.duration % 60}m` : ''}`
                  : `${place.duration} min`}
              </span>
            </>
          )}
        </div>
        {place.notes && <p className="place-note">{place.notes}</p>}
      </div>
      <div className="place-actions">
        <div className="place-menu" ref={menuRef}>
          <button
            type="button"
            className="icon-button more-button"
            aria-label={`Options for ${place.name}`}
            aria-expanded={menu}
            onClick={() => setMenu((value) => !value)}
          >
            <MoreHorizontal size={19} />
          </button>
          {menu && (
            <div className="dropdown">
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  onEdit();
                }}
              >
                Edit place
              </button>
              <button
                type="button"
                disabled={first}
                onClick={() => {
                  setMenu(false);
                  onMove(-1);
                }}
              >
                <ArrowUp size={15} />
                Move up
              </button>
              <button
                type="button"
                disabled={last}
                onClick={() => {
                  setMenu(false);
                  onMove(1);
                }}
              >
                <ArrowDown size={15} />
                Move down
              </button>
            </div>
          )}
        </div>
        {needsLocation ? (
          <button
            type="button"
            className="directions-button"
            onClick={onEdit}
            aria-label={`Set location for ${place.name}`}
          >
            <MapPin size={17} />
            <span>Set location</span>
          </button>
        ) : (
          <a
            className="directions-button"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Directions to ${place.name}`}
          >
            <Navigation size={17} />
            <span>Directions</span>
          </a>
        )}
        <button
          type="button"
          className={`visited-button ${place.visited ? 'checked' : ''}`}
          onClick={onVisited}
          aria-label={
            place.visited ? `Mark ${place.name} as not visited` : `Mark ${place.name} as visited`
          }
          aria-pressed={place.visited}
        >
          <Check size={14} />
          <span>{place.visited ? 'Visited' : 'Mark visited'}</span>
        </button>
      </div>
    </article>
  );
}
