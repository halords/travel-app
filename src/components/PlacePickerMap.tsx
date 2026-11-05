import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, WifiOff } from 'lucide-react';

// The embedded map is only a destination picker. All travel navigation opens the user's maps app.
export default function PlacePickerMap({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick: (latitude: number, longitude: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [error, setError] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const coordinates = useRef({ latitude, longitude });
  coordinates.current = { latitude, longitude };
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!container.current || !online) return;
    const initial = coordinates.current;
    const hasPoint = initial.latitude !== null && initial.longitude !== null;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView(
      hasPoint ? [initial.latitude!, initial.longitude!] : [20, 0],
      hasPoint ? 15 : 2,
    );
    map.current = instance;
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(instance);
    tiles.on('tileerror', () => setError(true));
    instance.on('click', (event: L.LeafletMouseEvent) =>
      pickRef.current(
        Number(event.latlng.lat.toFixed(6)),
        Number(event.latlng.wrap().lng.toFixed(6)),
      ),
    );
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      marker.current = null;
    };
  }, [online]);
  useEffect(() => {
    if (!map.current) return;
    marker.current?.remove();
    marker.current = null;
    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return;
    marker.current = L.marker([latitude, longitude], {
      draggable: true,
      icon: L.divIcon({
        className: 'roam-marker-wrap',
        html: '<span class="destination-pin"><span></span></span>',
        iconSize: [34, 42],
        iconAnchor: [17, 38],
      }),
      title: 'Destination pin. Drag to adjust.',
    }).addTo(map.current);
    marker.current.on('dragend', () => {
      const point = marker.current!.getLatLng().wrap();
      pickRef.current(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)));
    });
    map.current.setView([latitude, longitude], Math.max(14, map.current.getZoom()));
  }, [latitude, longitude, online]);
  return (
    <div className="destination-picker">
      <div className="picker-label">
        <span>
          <Crosshair size={15} />
          Check your destination
        </span>
        <small>Tap or drag to adjust the pin</small>
      </div>
      {online ? (
        <div
          ref={container}
          className="picker-map"
          aria-label="Choose your destination on the map"
        />
      ) : (
        <div className="picker-offline">
          <WifiOff size={22} />
          <p>Reconnect to choose a pin. You can still save an address below.</p>
        </div>
      )}
      {online && error && (
        <p className="field-hint">
          The map couldn’t load. You can still save this place and open directions.
        </p>
      )}
    </div>
  );
}
