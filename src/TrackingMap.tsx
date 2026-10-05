import React from 'react';
import { trackingMapHtml } from './trackingMapHtml';
type Point = { latitude: number; longitude: number };
export function TrackingMap({ location, destination, path, fill = false, hospitalName }: { location?: Point; destination?: Point; path: Point[]; fill?: boolean; hospitalName?: string }) {
  return <iframe title="Mapa de seguimiento de entrega" srcDoc={trackingMapHtml(location, destination, path, hospitalName)} sandbox="allow-scripts" style={{ width: '100%', height: fill ? '100%' : 350, border: 0, borderRadius: fill ? 0 : 14 }} />;
}
