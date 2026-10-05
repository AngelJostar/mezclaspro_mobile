import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { trackingMapHtml } from './trackingMapHtml';
type Point = { latitude: number; longitude: number };
export function TrackingMap({ location, destination, path, fill = false, hospitalName }: { location?: Point; destination?: Point; path: Point[]; fill?: boolean; hospitalName?: string }) {
  return <View style={{ ...(fill ? { flex: 1 } : { height: 350 }), borderRadius: fill ? 0 : 14, overflow: 'hidden' }}><WebView source={{ html: trackingMapHtml(location, destination, path, hospitalName) }} originWhitelist={['about:blank']} javaScriptEnabled mixedContentMode="never" onShouldStartLoadWithRequest={request => request.url === 'about:blank'} style={{ flex: 1, backgroundColor: '#eaf2ed' }} /></View>;
}
