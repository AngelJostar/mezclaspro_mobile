import { mapScript, mapStyle } from './trackingMapAssets';
type Point = { latitude: number; longitude: number };
export function trackingMapHtml(location?: Point, destination?: Point, path: Point[] = [], hospitalName = 'Hospital'): string {
  const valid = (p?: Point) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) ? [p.latitude, p.longitude] : null;
  const data = JSON.stringify({ location: valid(location), destination: valid(destination), path: path.map(p => valid(p)).filter(Boolean), hospitalName }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${mapStyle}html,body,#map{height:100%;margin:0}.marker{background:#008c3a;border:3px solid white;border-radius:50%;color:white;font-size:20px;text-align:center;line-height:34px;box-shadow:0 2px 7px #0004}</style></head><body><div id="map"></div><script>${mapScript}</script><script>
  const data=${data}; const map=L.map('map',{zoomControl:false}).setView(data.location || data.destination || [19.4326,-99.1332],13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const marker=(point,label,icon)=>{const text=document.createElement('div');text.textContent=label;return L.marker(point,{icon:L.divIcon({className:'marker',html:icon,iconSize:[36,36],iconAnchor:[18,18]})}).addTo(map).bindPopup(text)};
  const hospitalIcon='<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.6" style="vertical-align:middle"><path d="M6 21V5h12v16M3 21h18M9 3h6M12 7v4M10 9h4M9 14h1m4 0h1M10 21v-4h4v4"/></svg>';
  const truckIcon='<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.6" style="vertical-align:middle"><path d="M2 4h13v13H2zM15 9h4l3 4v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
  const bounds=[]; let hospitalMarker; if(data.destination){hospitalMarker=marker(data.destination,data.hospitalName,hospitalIcon);bounds.push(data.destination)} if(data.location){marker(data.location,'Última ubicación del mensajero',truckIcon);bounds.push(data.location)}
  if(data.path.length>1){L.polyline(data.path,{color:'#008c3a',weight:4}).addTo(map)}
  if(bounds.length>1)map.fitBounds(bounds,{padding:[35,35],maxZoom:15});
  if(hospitalMarker)hospitalMarker.openPopup();
  </script></body></html>`;
}
