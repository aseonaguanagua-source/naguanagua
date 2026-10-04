'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in React-Leaflet
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapPickerProps {
  position?: { lat: number; lng: number };
  onLocationSelect?: (loc: { lat: number; lng: number }) => void;
  readOnly?: boolean;
}

function LocationMarker({ position, onLocationSelect, readOnly }: MapPickerProps) {
  useMapEvents({
    click(e) {
      if (!readOnly && onLocationSelect) {
        onLocationSelect(e.latlng);
      }
    },
  });

  return position ? <Marker position={position} /> : null;
}

export default function MapPicker({ position, onLocationSelect, readOnly }: MapPickerProps) {
  // Coordenadas oficiales de Naguanagua, Estado Carabobo, Venezuela (Casco Central / Av. Universidad)
  const defaultCenter = { lat: 10.2544, lng: -68.0116 };

  
  return (
    <div className="h-[300px] w-full rounded border border-slate-300 overflow-hidden relative z-0 mt-2 mb-4">
      <MapContainer 
        center={position || defaultCenter} 
        zoom={14} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker position={position} onLocationSelect={onLocationSelect} readOnly={readOnly} />
      </MapContainer>
    </div>
  );
}
