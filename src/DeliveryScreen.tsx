import { DeliveryLiveMap } from './DeliveryLiveMap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from './BackButton';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { hospitalRequest, salesRequest } from './mobileApi';

export type Point = { latitude: number; longitude: number };
type Delivery = { id: number; folio: string; hospital: string; city?: string; date: string; route?: string; route_code?: string; state: string; status: string; mixtures_count: number; delivered_at?: string;
  courier?: { name: string; phone?: string }; destination?: Point; location?: Point & { recorded_at: string; stale: boolean }; path?: Point[];
  estimated_arrival?: string; notes?: string; timeline?: { label: string; at?: string; complete: boolean }[]; mixtures?: { id: string; request: string; name: string; status: string; medicines?: { name: string; dose?: number }[] }[] };
type Feed = { deliveries: { data: Delivery[]; current_page: number; last_page: number }; counts: { in_route: number; delivered: number; all: number } };
const displayDate = (date?: string) => date ? new Date(date).toLocaleString('es-MX') : 'Pendiente';
const deliveryDate = (date: string) => date.split('-').reverse().join('/');

export function DeliveryScreen({ token, module, name, onBack }: { token: string; module: 'sales' | 'hospital'; name: string; onBack: () => void }) {
  const [tab, setTab] = useState<'in_route' | 'delivered' | 'all'>('all');
  const [date, setDate] = useState('');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [detail, setDetail] = useState<Delivery | null>(null);
  const [view, setView] = useState<'list' | 'detail' | 'map' | 'timeline'>('list');
  const [mapReturn, setMapReturn] = useState<'list' | 'detail'>('list');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const active = useRef(true);
  const call = <T,>(path: string) => module === 'sales' ? salesRequest<T>(path, token) : hospitalRequest<T>(path, token);
  const listPath = module === 'sales' ? '/deliveries/tracking' : '/deliveries';
  const detailPath = (id: number) => module === 'sales' ? `/deliveries/${id}/tracking` : `/deliveries/${id}`;
  async function load(page = 1) {
    const revision = ++version.current; setBusy(true); setError('');
    try { const data = await call<Feed>(`${listPath}?state=${tab}&date=${encodeURIComponent(date)}&page=${page}`); if (revision === version.current) setFeed(data); }
    catch (e) { if (revision === version.current) setError(e instanceof Error ? e.message : 'Error de conexión.'); }
    finally { if (revision === version.current) setBusy(false); }
  }
  async function open(id: number, next: typeof view = 'detail') {
    if (next === 'map') setMapReturn(view === 'list' ? 'list' : 'detail');
    const revision = ++version.current; setBusy(true); setError('');
    try { const data = await call<Delivery>(detailPath(id)); if (revision === version.current) { setDetail(data); setView(next); } }
    catch (e) { if (revision === version.current) setError(e instanceof Error ? e.message : 'Error de conexión.'); }
    finally { if (revision === version.current) setBusy(false); }
  }
  useEffect(() => { if (view === 'list') void load(); return () => { version.current++; }; }, [tab, view]);
  useEffect(() => {
    let polling = false;
    let disposed = false;
    const refresh = async () => {
      if (polling || !active.current) return;
      if (view === 'list') { polling = true; try { await load(); } finally { polling = false; } return; }
      if (!detail) return;
      polling = true;
      try { const data = await call<Delivery>(detailPath(detail.id)); if (!disposed && active.current) { setDetail(data); setError(''); } }
      catch (e) { if (!disposed && active.current) setError(e instanceof Error ? e.message : 'No se pudo actualizar la ubicación.'); }
      finally { polling = false; }
    };
    active.current = true;
    const timer = setInterval(() => void refresh(), view === 'list' ? 30000 : 15000);
    const subscription = AppState.addEventListener('change', state => { active.current = state === 'active'; if (active.current) void refresh(); });
    return () => { disposed = true; active.current = false; if (timer) clearInterval(timer); subscription.remove(); };
  }, [view, detail?.id, tab, date]);
  const button = (label: string, press: () => void, icon: React.ComponentProps<typeof Feather>['name'] = 'arrow-right') => <Pressable disabled={busy} accessibilityRole="button" onPress={press} style={s.button}><Feather name={icon} color="#008C3A" size={20} /><Text style={s.green}>{label}</Text></Pressable>;
  async function contact(scheme: 'tel' | 'sms') {
    const phone = detail?.courier?.phone?.replace(/[^+\d]/g, '');
    if (!phone) return;
    try { await Linking.openURL(`${scheme}:${phone}`); } catch { setError('No se pudo abrir la aplicación de contacto.'); }
  }
  const back = () => { if (view === 'list') onBack(); else if (view === 'map') { setView(mapReturn); if (mapReturn === 'list') setDetail(null); } else if (view === 'detail') { setDetail(null); setView('list'); } else setView('detail'); };
  if (view === 'map' && detail) return <Modal visible animationType="slide" onRequestClose={back}><SafeAreaView style={{ flex: 1, backgroundColor: '#008C3A' }}><DeliveryLiveMap delivery={detail} onBack={back} /></SafeAreaView></Modal>;
  return <View style={s.root}>
    <View style={s.header}><BackButton onPress={back} /><View style={{ flex: 1 }}><Text style={s.title}>{view === 'map' ? 'Entrega en tiempo real' : view === 'timeline' ? 'Seguimiento' : view === 'detail' ? 'Detalle de entrega' : 'Entregas'}</Text><Text style={s.white}>{detail?.hospital || name}</Text></View></View>
    {view === 'list' && <><View style={s.tabs}>{([['in_route', 'En ruta'], ['delivered', 'Entregadas'], ['all', 'Todas']] as const).map(([key, label]) => <Pressable key={key} disabled={busy} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabActive]}><View style={s.tabContent}><Text style={[s.tabLabel, tab === key && s.green]}>{label}</Text><View style={[s.countPill, tab === key && s.activePill]}><Text style={[s.countText, tab === key && s.green]}>{feed?.counts[key] ?? 0}</Text></View></View></Pressable>)}</View><View style={s.filter}><View style={s.dateField}><Feather name="calendar" size={18} color="#667080" /><TextInput accessibilityLabel="Fecha de entrega" accessibilityHint="Ingresa la fecha en formato AAAA-MM-DD" placeholder="Fecha de entrega (opcional)" placeholderTextColor="#7a8390" style={s.dateInput} value={date} onChangeText={setDate} /></View><Pressable disabled={busy} accessibilityLabel="Filtrar por fecha" style={s.filterButton} onPress={() => void load()}><Feather name="filter" size={20} color="#557a68" /></Pressable></View></>}
    <ScrollView contentContainerStyle={s.content}>
      {busy && <ActivityIndicator color="#008C3A" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {view === 'list' && <>
        <View style={s.deliveryTable}>
          <View style={s.deliveryTableHeader}>
            <Text style={[s.tableLabel, s.hospitalCell]}>Hospital</Text>
            <Text style={[s.tableLabel, s.dateCell]}>Fecha</Text>
            <Text style={[s.tableLabel, s.routeCell]}>Ruta</Text>
            <Text style={[s.tableLabel, s.mixCell]}>Mezclas</Text>
            <Text style={[s.tableLabel, s.actionCell]}>Acciones</Text>
            <View style={s.arrowCell} />
          </View>
          {feed?.deliveries.data.map(item => <View key={item.id} style={s.deliveryRow}>
            <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Detalle ${item.folio}`} onPress={() => void open(item.id)} style={s.hospitalCell}>
              <Text style={s.hospitalName}>{item.hospital}</Text>
              {!!item.city && <Text style={s.hospitalCity}>{item.city}</Text>}
            </Pressable>
            <Text style={[s.tableValue, s.dateCell]}>{deliveryDate(item.date)}</Text>
            <Text style={[s.tableValue, s.routeCell]}>{item.route_code || '—'}</Text>
            <Text style={[s.tableValue, s.mixCell]}>{item.mixtures_count}</Text>
            <View style={s.actionCell}><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Ver en tiempo real ${item.folio}`} onPress={() => void open(item.id, 'map')} style={s.liveButton}>
              <Feather name="map-pin" size={19} color="#008C3A" /><Text style={s.liveLabel}>Ver en{'\n'}tiempo real</Text>
            </Pressable></View>
            <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Abrir detalle ${item.folio}`} onPress={() => void open(item.id)} style={s.arrowCell}><Feather name="chevron-right" size={14} color="#7b8780" /></Pressable>
          </View>)}
        </View>
        {!busy && feed?.deliveries.data.length === 0 && <Text>No hay entregas para este filtro.</Text>}
        {feed && feed.deliveries.last_page > 1 && <View style={s.tableRow}>{feed.deliveries.current_page > 1 && button('Anterior', () => void load(feed.deliveries.current_page - 1))}<Text>{feed.deliveries.current_page}/{feed.deliveries.last_page}</Text>{feed.deliveries.current_page < feed.deliveries.last_page && button('Siguiente', () => void load(feed.deliveries.current_page + 1))}</View>}
      </>}
      {detail && view !== 'list' && <>
        <View style={s.status}><Feather name={detail.state === 'delivered' ? 'check-circle' : 'truck'} size={26} color="#008C3A" /><View><Text style={s.green}>{detail.status}</Text><Text style={s.small}>{detail.estimated_arrival ? `Llegada estimada: ${detail.estimated_arrival}` : 'Sin hora estimada registrada'}</Text></View></View>
        <View style={s.card}><View style={s.tableRow}><View><Text style={s.small}>Entrega</Text><Text style={s.name}>{detail.folio}</Text></View><View><Text style={s.small}>Ruta</Text><Text style={s.name}>{detail.route_code || '—'}</Text></View><View><Text style={s.small}>Mezclas</Text><Text style={s.name}>{detail.mixtures_count}</Text></View></View><Text style={s.small}>Fecha de entrega: {detail.date}</Text></View>
        <View style={s.card}><Text style={s.small}>Hospital</Text><Text style={s.name}>{detail.hospital}</Text><Text style={s.small}>{detail.city}</Text></View>
        <View style={s.card}><Text style={s.small}>Mensajero</Text><Text style={s.name}>{detail.courier?.name || 'Pendiente de asignación'}</Text>{detail.courier?.phone && <View style={s.tableRow}>{button('Llamar', () => void contact('tel'), 'phone')}{button('Mensaje', () => void contact('sms'), 'message-square')}</View>}</View>
        {view === 'timeline' ? <View style={s.card}>{detail.timeline?.map((event, i) => <View key={i} style={s.timeline}><Feather name={event.complete ? 'check-circle' : 'circle'} size={22} color={event.complete ? '#008C3A' : '#a1aaa5'} /><View><Text style={s.name}>{event.label}</Text><Text style={s.small}>{displayDate(event.at)}</Text></View></View>)}</View> : <View style={s.card}><Text style={s.name}>Mezclas programadas para esta entrega</Text>{detail.mixtures?.map(m => <View key={m.id} style={s.line}><Text style={s.name}>{m.name}</Text><Text style={s.small}>{m.request} · {m.status}</Text>{m.medicines?.map((d, i) => <Text key={i} style={s.small}>{d.name}{d.dose != null ? ` · ${d.dose} mg` : ''}</Text>)}</View>)}{!detail.mixtures?.length && <Text style={s.small}>No hay mezclas registradas para este hospital y fecha.</Text>}</View>}
        {!!detail.notes && <View style={s.status}><Text>Observaciones: {detail.notes}</Text></View>}
        {view !== 'timeline' && button('Seguimiento', () => setView('timeline'), 'list')}{view !== 'map' && button('Ver en tiempo real', () => void open(detail.id, 'map'), 'map')}
      </>}
    </ScrollView>
  </View>;
}
const s = StyleSheet.create({ tabContent: { flexDirection: 'row', alignItems: 'center', gap: 7 }, tabLabel: { fontSize: 11, color: '#667080', fontWeight: '600' }, countPill: { borderRadius: 12, backgroundColor: '#f0f2f5', paddingHorizontal: 6, paddingVertical: 2 }, activePill: { backgroundColor: '#e0f4e9' }, countText: { fontSize: 10, fontWeight: '600', color: '#667080' }, dateField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#dce5df', borderRadius: 8, backgroundColor: 'white', paddingHorizontal: 10 }, dateInput: { flex: 1, paddingVertical: 10, fontSize: 11, color: '#334155' }, deliveryTable: { backgroundColor: '#FFFFFF' }, deliveryTableHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 40, backgroundColor: '#f5f7f9', paddingHorizontal: 4 }, deliveryRow: { flexDirection: 'row', alignItems: 'center', minHeight: 76, paddingHorizontal: 4, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#edf0f2' }, hospitalCell: { width: '28%', paddingRight: 7 }, dateCell: { width: '16%' }, routeCell: { width: '12%', paddingHorizontal: 3 }, mixCell: { width: '10%' }, actionCell: { width: '28%', paddingLeft: 3 }, arrowCell: { width: '6%', alignItems: 'center', justifyContent: 'center', minHeight: 36 }, tableLabel: { fontSize: 9, color: '#667080' }, tableValue: { fontSize: 9, color: '#667080' }, hospitalName: { fontSize: 11, fontWeight: '600', color: '#17202d', lineHeight: 15 }, hospitalCity: { fontSize: 10, color: '#7a8390', marginTop: 2 }, liveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#b5dfca', borderRadius: 7, backgroundColor: '#f3faf7', paddingVertical: 7, paddingHorizontal: 3, minHeight: 38 }, liveLabel: { fontSize: 9, lineHeight: 12, fontWeight: '600', color: '#008C3A' }, root: { flex: 1, backgroundColor: '#fafcfb' }, header: { backgroundColor: '#008C3A', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }, title: { color: 'white', fontWeight: '700', fontSize: 20 }, white: { color: 'white', marginTop: 4, fontSize: 12 }, tabs: { flexDirection: 'row', paddingHorizontal: 12, backgroundColor: 'white' }, tab: { flex: 1, alignItems: 'center', paddingVertical: 18, borderBottomWidth: 3, borderBottomColor: 'transparent' }, tabActive: { borderBottomColor: '#008C3A' }, filter: { flexDirection: 'row', padding: 14, gap: 8 }, input: { flex: 1, borderWidth: 1, borderColor: '#dce5df', borderRadius: 8, padding: 10, fontSize: 12, backgroundColor: 'white' }, filterButton: { borderWidth: 1, borderColor: '#dce5df', borderRadius: 8, padding: 10 }, content: { padding: 14, gap: 14 }, tableHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f4f5', padding: 10 }, column: { flex: 1, textAlign: 'center', fontSize: 10, color: '#65716b' }, tableRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 }, row: { paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: '#e5ece7' }, card: { borderWidth: 1, borderColor: '#e0e9e3', borderRadius: 12, backgroundColor: 'white', padding: 14, gap: 12 }, name: { fontSize: 13, fontWeight: '600', color: '#1c2922' }, small: { color: '#6b7870', fontSize: 11 }, green: { color: '#008C3A', fontWeight: '600', fontSize: 12 }, button: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#acd8bf', backgroundColor: '#f1faf5', borderRadius: 8, padding: 12, gap: 8 }, status: { padding: 14, backgroundColor: '#edf7f1', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, timeline: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 12 }, line: { borderTopWidth: 1, borderTopColor: '#e6ece8', paddingTop: 12, gap: 5 }, error: { padding: 12, color: '#a52a22', backgroundColor: '#fff0ec', borderRadius: 8 } });
