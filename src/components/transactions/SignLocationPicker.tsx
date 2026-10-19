'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { loadLeaflet } from '@/lib/client/leafletLoader';

type Props = {
  address: string;
  latitude: string;
  longitude: string;
  notes: string;
  onChange: (value: { address?: string; latitude?: string; longitude?: string; notes?: string }) => void;
};

type Coordinates = { latitude: number; longitude: number };

const LAFAYETTE = { latitude: 30.2241, longitude: -92.0198 };

function parseCoordinates(latitude: string, longitude: string): Coordinates | null {
  const parsedLatitude = Number(String(latitude || '').trim());
  const parsedLongitude = Number(String(longitude || '').trim());
  if (
    !Number.isFinite(parsedLatitude)
    || !Number.isFinite(parsedLongitude)
    || parsedLatitude < -90
    || parsedLatitude > 90
    || parsedLongitude < -180
    || parsedLongitude > 180
  ) {
    return null;
  }
  return { latitude: parsedLatitude, longitude: parsedLongitude };
}

function makePinIcon(L: any) {
  return L.divIcon({
    className: 'smartbroker-office-pin',
    html: '<span aria-hidden="true">●</span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function SignLocationPicker({ address, latitude, longitude, notes, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const coordinatesRef = useRef<Coordinates | null>(null);
  const onChangeRef = useRef(onChange);
  const syncMapRef = useRef<(() => void) | null>(null);
  const [search, setSearch] = useState(address);
  const [message, setMessage] = useState('');

  const coordinates = parseCoordinates(latitude, longitude);
  const hasCoordinates = Boolean(coordinates);
  coordinatesRef.current = coordinates;
  onChangeRef.current = onChange;

  useEffect(() => {
    setSearch(address);
  }, [address]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!mapRef.current || instanceRef.current) return;

      const L = await loadLeaflet();
      if (cancelled || !mapRef.current) return;

      leafletRef.current = L;
      const latestCoordinates = coordinatesRef.current;
      const center: [number, number] = latestCoordinates
        ? [latestCoordinates.latitude, latestCoordinates.longitude]
        : [LAFAYETTE.latitude, LAFAYETTE.longitude];
      const map = L.map(mapRef.current).setView(center, latestCoordinates ? 17 : 12);
      const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      }).addTo(map);
      tiles.on('tileerror', () => setMessage('Map tiles could not load. Enter coordinates manually or retry.'));
      instanceRef.current = map;

      const placeMarker = (point: any) => {
        if (markerRef.current) markerRef.current.remove();
        const marker = L.marker(point, { draggable: true, icon: makePinIcon(L) }).addTo(map);
        marker.on('dragend', () => {
          const moved = marker.getLatLng();
          onChangeRef.current({ latitude: moved.lat.toFixed(6), longitude: moved.lng.toFixed(6) });
        });
        markerRef.current = marker;
        return marker;
      };

      const syncMapToCurrentCoordinates = () => {
        const currentCoordinates = coordinatesRef.current;
        if (!currentCoordinates || !instanceRef.current) return;
        const point = L.latLng(currentCoordinates.latitude, currentCoordinates.longitude);
        map.setView(point, 17);
        if (markerRef.current) markerRef.current.setLatLng(point);
        else placeMarker(point);
      };

      syncMapRef.current = syncMapToCurrentCoordinates;
      syncMapToCurrentCoordinates();
      map.on('click', (event: any) => {
        placeMarker(event.latlng);
        onChangeRef.current({ latitude: event.latlng.lat.toFixed(6), longitude: event.latlng.lng.toFixed(6) });
      });
      window.setTimeout(() => map.invalidateSize(), 150);
      window.setTimeout(() => map.invalidateSize(), 500);
    };

    start().catch((error) => setMessage(error.message || 'Map could not load. Enter coordinates manually or retry.'));

    return () => {
      cancelled = true;
      syncMapRef.current = null;
      markerRef.current = null;
      leafletRef.current = null;
      if (instanceRef.current) instanceRef.current.remove();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    syncMapRef.current?.();
  }, [latitude, longitude]);

  const searchPlace = async () => {
    const query = search.trim();
    if (!query) {
      setMessage('Enter an address, nearby road, entrance, or landmark first.');
      return;
    }

    setMessage('Searching nearby roads and places…');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Location search is temporarily unavailable. You can still click the map or enter coordinates.');
      const matches = await response.json();
      if (!matches?.[0]) throw new Error('No location found. You can still click the map or enter coordinates.');

      const result = matches[0];
      const foundCoordinates = parseCoordinates(String(result.lat || ''), String(result.lon || ''));
      if (!foundCoordinates) throw new Error('The location search returned invalid coordinates. You can still click the map or enter coordinates.');

      onChange({
        address: query,
        latitude: foundCoordinates.latitude.toFixed(6),
        longitude: foundCoordinates.longitude.toFixed(6),
      });
      setMessage(`Pin placed near ${result.display_name}. Move it if needed.`);
    } catch (error: any) {
      setMessage(error.message || 'Location search failed.');
    }
  };

  const navigationUrl = hasCoordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}`
    : address.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : '';

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="space-y-1">
        <Label htmlFor="sign-placement-address">Sign placement address or nearby road</Label>
        <div className="flex gap-2">
          <Input
            id="sign-placement-address"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              onChange({ address: event.target.value });
            }}
            placeholder="Address, road, entrance, or nearby landmark"
          />
          <Button type="button" variant="outline" onClick={searchPlace}>Find on map</Button>
        </div>
        <p className="text-xs text-muted-foreground">Address is optional when exact coordinates are sufficient. Search first, then click or drag the pin to the actual sign location.</p>
      </div>
      <div ref={mapRef} className="h-72 w-full rounded-md border bg-background" aria-label="Sign placement map; click to set or move the pin" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sign-placement-lat">Latitude</Label>
          <Input id="sign-placement-lat" inputMode="decimal" value={latitude} onChange={(event) => onChange({ latitude: event.target.value })} placeholder="30.224100" />
        </div>
        <div>
          <Label htmlFor="sign-placement-lng">Longitude</Label>
          <Input id="sign-placement-lng" inputMode="decimal" value={longitude} onChange={(event) => onChange({ longitude: event.target.value })} placeholder="-92.019800" />
        </div>
      </div>
      <div>
        <Label htmlFor="sign-placement-notes">Sign Placement Notes</Label>
        <Textarea id="sign-placement-notes" value={notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Place sign near west entrance beside utility pole." />
      </div>
      {navigationUrl && <a className="inline-flex text-sm font-medium text-primary underline" href={navigationUrl} target="_blank" rel="noreferrer">Open Sign Location</a>}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
