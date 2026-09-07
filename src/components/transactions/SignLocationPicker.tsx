'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { loadLeaflet } from '@/lib/client/leafletLoader';

type Props = { address: string; latitude: string; longitude: string; notes: string; onChange: (value: { address?: string; latitude?: string; longitude?: string; notes?: string }) => void; };
const LAFAYETTE = { lat: 30.2241, lng: -92.0198 };
export function SignLocationPicker({ address, latitude, longitude, notes, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null); const instanceRef = useRef<any>(null); const markerRef = useRef<any>(null); const leafletRef = useRef<any>(null); const [search, setSearch] = useState(address); const [message, setMessage] = useState('');
  const lat = Number(latitude); const lng = Number(longitude); const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && latitude !== '' && longitude !== '';
  const applyPin = (nextLat: number, nextLng: number) => onChange({ latitude: nextLat.toFixed(6), longitude: nextLng.toFixed(6) });
  useEffect(() => {
    let cancelled = false; const start = async () => {
      if (!mapRef.current || instanceRef.current) return;
      const L = await loadLeaflet();
      if (cancelled || !mapRef.current) return; leafletRef.current = L;
      const center: [number, number] = hasCoordinates ? [lat, lng] : [LAFAYETTE.lat, LAFAYETTE.lng]; const map = L.map(mapRef.current).setView(center, hasCoordinates ? 17 : 12); const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }).addTo(map); tiles.on('tileerror', () => setMessage('Map tiles could not load. Enter coordinates manually.')); instanceRef.current = map;
      const pinIcon = L.divIcon({ className: 'smartbroker-office-pin', html: '<span aria-hidden="true">●</span>', iconSize: [28, 28], iconAnchor: [14, 14] }); const setMarker = (point: any) => { if (markerRef.current) markerRef.current.remove(); markerRef.current = L.marker(point, { draggable: true, icon: pinIcon }).addTo(map); markerRef.current.on('dragend', () => { const next = markerRef.current.getLatLng(); applyPin(next.lat, next.lng); }); };
      if (hasCoordinates) setMarker(center); map.on('click', (event: any) => { setMarker(event.latlng); applyPin(event.latlng.lat, event.latlng.lng); });
      window.setTimeout(() => map.invalidateSize(), 150); window.setTimeout(() => map.invalidateSize(), 500);
    }; start().catch((error) => setMessage(error.message || 'Map could not load. Enter coordinates manually.')); return () => { cancelled = true; };
  }, []);
  useEffect(() => { const L = leafletRef.current; if (!instanceRef.current || !hasCoordinates || !L) return; const point = L.latLng(lat, lng); instanceRef.current.setView(point, 17); if (markerRef.current) markerRef.current.setLatLng(point); else markerRef.current = L.marker(point, { draggable: true, icon: L.divIcon({ className: 'smartbroker-office-pin', html: '<span aria-hidden="true">●</span>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(instanceRef.current); }, [latitude, longitude]);
  const searchPlace = async () => { const query = search.trim(); if (!query) return; setMessage('Searching nearby roads and places…'); try { const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`); const matches = await response.json(); if (!matches?.[0]) throw new Error('No location found. You can still click the map or enter coordinates.'); const result = matches[0]; const nextLat = Number(result.lat); const nextLng = Number(result.lon); onChange({ address: query, latitude: nextLat.toFixed(6), longitude: nextLng.toFixed(6) }); setMessage(`Pin placed near ${result.display_name}. Move it if needed.`); } catch (error: any) { setMessage(error.message || 'Location search failed.'); } };
  const navigationUrl = hasCoordinates ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}` : address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
  return <div className="space-y-3 rounded-md border bg-muted/20 p-3"><div className="space-y-1"><Label htmlFor="sign-placement-address">Sign placement address or nearby road</Label><div className="flex gap-2"><Input id="sign-placement-address" value={search} onChange={(event) => { setSearch(event.target.value); onChange({ address: event.target.value }); }} placeholder="Address, road, entrance, or nearby landmark" /><Button type="button" variant="outline" onClick={searchPlace}>Find on map</Button></div><p className="text-xs text-muted-foreground">Address is optional when exact coordinates are sufficient. Search first, then click or drag the pin to the actual sign location.</p></div><div ref={mapRef} className="h-72 w-full rounded-md border bg-background" aria-label="Sign placement map; click to set or move the pin" /><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="sign-placement-lat">Latitude</Label><Input id="sign-placement-lat" inputMode="decimal" value={latitude} onChange={(event) => onChange({ latitude: event.target.value })} placeholder="30.224100" /></div><div><Label htmlFor="sign-placement-lng">Longitude</Label><Input id="sign-placement-lng" inputMode="decimal" value={longitude} onChange={(event) => onChange({ longitude: event.target.value })} placeholder="-92.019800" /></div></div><div><Label htmlFor="sign-placement-notes">Sign Placement Notes</Label><Textarea id="sign-placement-notes" value={notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Place sign near west entrance beside utility pole." /></div>{navigationUrl && <a className="inline-flex text-sm font-medium text-primary underline" href={navigationUrl} target="_blank" rel="noreferrer">Open Sign Location</a>}{message && <p className="text-xs text-muted-foreground">{message}</p>}</div>;
}
