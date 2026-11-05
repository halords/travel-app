import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { overviewPoints } from '../lib/overview-map';
import type { Place } from '../lib/model';

export default function DayOverviewMap({ places }: { places: Place[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const points = overviewPoints(places);
    if (!points.length) return;
    setTileError(false);
    const map = L.map(container.current, { scrollWheelZoom: false });
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    tiles.on('tileerror', () => setTileError(true));
    for (const point of points) {
      const label = document.createElement('span');
      label.textContent = `${point.number}. ${point.place.name}`;
      L.marker(point.coordinates, {
        title: `${point.number}. ${point.place.name}`,
        alt: `Stop ${point.number}: ${point.place.name}`,
        icon: L.divIcon({
          className: 'overview-marker-wrap',
          html: `<span class="overview-map-pin">${point.number}</span>`,
          iconSize: [34, 40],
          iconAnchor: [17, 38],
        }),
      })
        .addTo(map)
        .bindTooltip(label)
        .bindPopup(label.cloneNode(true) as HTMLElement);
    }
    const fit = () => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0].coordinates, 15);
      else
        map.fitBounds(L.latLngBounds(points.map((point) => point.coordinates)), {
          padding: [35, 45],
          maxZoom: 16,
        });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [places]);
  return (
    <>
      <div
        ref={container}
        className="overview-map"
        role="region"
        aria-label="Map of all pinned destinations for this day"
      />
      {tileError && (
        <p className="notice" role="status">
          Map tiles could not load. Your destinations are still listed below; you can open each in
          Google Maps.
        </p>
      )}
    </>
  );
}
