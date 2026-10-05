import { BackButton } from './BackButton';
import { quotationWorkflow, QuotationWorkflow } from './mobileApi';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DeliveryScreen } from './DeliveryScreen';
import { QuotationWizard } from './QuotationWizard';
import { hospitalRequest, markAllMobileNotificationsRead, mobileNotifications, MobileNotification, MobileUser, uploadHospitalRequest } from './mobileApi';

type Screen = 'home' | 'compose' | 'preview' | 'sent' | 'requests' | 'quotes' | 'orders' | 'detail' | 'deliveries' | 'notifications' | 'profile' | 'camera';
type Product = { id: number; name: string; presentation: string; unit: string; quantity?: string };
type RecordItem = { id: number; folio: string; status: string; category: string; items?: (Omit<Product, 'quantity'> & { quantity: number })[]; seller?: string; total?: string; created_at?: string; observations?: string; quotation_id?: number; quotation_folio?: string; has_attachment?: boolean; patient_name?: string; mixtures?: { name: string; status: string }[]; delivery_at?: string; pricing_snapshot?: { lines: { description: string; quantity: number; unit: string; total: number }[]; total: number } };
type Page = { data: RecordItem[]; current_page: number; last_page: number };
const categories = [['oncologicos', 'Oncológicos'], ['nutricionales', 'Nutricionales'], ['antibioticos', 'Antibióticos']] as const;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); });
const money = (n: number | string = 0) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

export function HospitalScreen({ token, user, onLogout }: { token: string; user: MobileUser; onLogout: () => Promise<void> }) {
  const [screen, setScreen] = useState<Screen>('home');
  const [category, setCategory] = useState('oncologicos');
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [patient, setPatient] = useState('');
  const [observations, setObservations] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [record, setRecord] = useState<RecordItem | null>(null);
  const [workflow, setWorkflow] = useState<QuotationWorkflow | null>(null);
  const [origin, setOrigin] = useState<Screen>('orders');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const submission = useRef(uuid());
  const pending = useRef(false);
  const revision = useRef(0);
  async function action(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function load(number = 1) {
    const version = ++revision.current; setBusy(true); setError('');
    try {
      const path = screen === 'requests' ? '/quotation-requests' : screen === 'quotes' ? '/quotations' : '/orders';
      const result = await hospitalRequest<Page>(`${path}?page=${number}`, token);
      if (version === revision.current) setPage(result);
    } catch (e) { if (version === revision.current) setError(e instanceof Error ? e.message : 'Error de conexión.'); }
    finally { if (version === revision.current) setBusy(false); }
  }
  async function loadNotifications() { const data = await mobileNotifications(token); setNotifications(data.notifications); setUnread(data.unread_count); }
  useEffect(() => {
    setError(''); setPage(null);
    if (['requests', 'quotes', 'orders'].includes(screen)) void load();
    if (screen === 'home' || screen === 'notifications') void action(loadNotifications);
    return () => { revision.current++; };
  }, [screen]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active' && ['requests', 'quotes', 'orders'].includes(screen)) void load(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active' && ['requests', 'quotes', 'orders'].includes(screen)) void load(page?.current_page || 1); }, 15000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [screen, page?.current_page]);
  async function catalog(next: string) {
    await action(async () => { const result = await hospitalRequest<{ products: Product[] }>(`/catalog?category=${next}`, token); setProducts(result.products); setCategory(next); setItems([]); setSearch(''); });
  }
  async function compose() {
    await action(async () => { const data = await hospitalRequest<{ products: Product[] }>('/catalog?category=oncologicos', token); setProducts(data.products); setItems([]); setPhoto(null); setPatient(''); setObservations(''); setCategory('oncologicos'); setSearch(''); submission.current = uuid(); setScreen('compose'); });
  }
  async function send() {
    await action(async () => {
      const data = { submission_key: submission.current, category, patient_name: patient, observations,
        items: items.map(i => ({ presentation_id: i.id, quantity: Number((i.quantity || '').replace(',', '.')) })) };
      let result: RecordItem;
      if (photo) {
        const form = new FormData();
        Object.entries(data).forEach(([key, value]) => form.append(key, typeof value === 'string' ? value : JSON.stringify(value)));
        if (Platform.OS === 'web') form.append('attachment', await (await fetch(photo)).blob(), 'receta.jpg');
        else form.append('attachment', { uri: photo, name: 'receta.jpg', type: 'image/jpeg' } as unknown as Blob);
        result = await uploadHospitalRequest<RecordItem>(token, form);
      } else result = await hospitalRequest<RecordItem>('/quotation-requests', token, 'POST', data);
      setRecord(result); setScreen('sent');
    });
  }
  async function open(item: RecordItem) {
    await action(async () => {
      setOrigin(screen);
      if (screen === 'quotes') setRecord(await hospitalRequest<RecordItem>(`/quotations/${item.id}`, token));
      else if (screen === 'orders') setRecord(await hospitalRequest<RecordItem>(`/orders/${item.category}/${item.id}`, token));
      else setRecord(item);
      setWorkflow(screen === 'quotes' ? await quotationWorkflow(token, item.id) : null);
      setScreen('detail');
    });
  }
  const button = (label: string, press: () => void, icon: React.ComponentProps<typeof Feather>['name'] = 'arrow-right') => <Pressable accessibilityRole="button" disabled={busy} style={[s.button, busy && { opacity: 0.5 }]} onPress={press}><Feather name={icon} size={20} color="#008C3A" /><Text style={s.green}>{label}</Text></Pressable>;
  const nav = <View style={s.nav}>{([
    ['home', 'Inicio', 'home'], ['requests', 'Solicitudes', 'file-text'], ['deliveries', 'Entregas', 'truck'], ['profile', 'Perfil', 'user'],
  ] as const).map(([target, label, icon]) => { const active = screen === target || (target === 'requests' && ['compose', 'preview', 'sent', 'quotes'].includes(screen)); return <Pressable key={target} accessibilityRole="button" disabled={busy} accessibilityState={{ selected: active }} style={s.navItem} onPress={() => setScreen(target)}><Feather name={icon} size={20} color={active ? '#008C3A' : '#76847B'} /><Text style={[s.navLabel, active && { color: '#008C3A' }]}>{label}</Text></Pressable>; })}</View>;
  if (screen === 'deliveries') return <SafeAreaView style={s.root}><DeliveryScreen module="hospital" token={token} name={user.hospital?.name || user.name} onBack={() => setScreen('home')} />{nav}</SafeAreaView>;
  if (screen === 'compose') return <QuotationWizard token={token} name={user.name} mode="hospital" ownHospital={user.hospital ? { id: user.hospital.id, name: user.hospital.name } : undefined} onClose={() => setScreen('home')} onDone={() => setScreen('requests')} />;
  if (screen === 'camera') return <SafeAreaView style={s.root}>
    {permission?.granted ? <CameraView ref={camera} style={{ flex: 1 }} onCameraReady={() => setCameraReady(true)} facing="back" /> : <View style={s.content}>{button('Permitir cámara', () => void requestPermission(), 'camera')}<Text>Se requiere permiso para fotografiar la receta.</Text></View>}
    <View style={s.content}>{button('Tomar fotografía', () => void action(async () => { if (!cameraReady) return; const capture = await camera.current?.takePictureAsync({ quality: 0.6 }); if (capture) { setPhoto(capture.uri); setScreen('compose'); } }), 'camera')}{button('Cancelar', () => setScreen('compose'), 'x')}</View>
  </SafeAreaView>;
  const back = () => setScreen(screen === 'preview' ? 'compose' : screen === 'detail' ? origin : 'home');
  return <SafeAreaView style={s.root}>
    <View style={s.header}><View style={s.inline}>{screen !== 'home' ? <BackButton disabled={busy} onPress={back} /> : <Feather name="home" size={24} color="white" />}<Text style={s.title}>Cliente · Hospital</Text><Pressable disabled={busy} accessibilityLabel="Notificaciones" onPress={() => setScreen('notifications')}><Feather name="bell" size={22} color="white" />{!!unread && <Text style={s.badge}>{unread}</Text>}</Pressable></View><Text style={s.white}>{user.hospital?.name}</Text><Text style={s.white}>{user.name}</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {busy && <ActivityIndicator color="#008C3A" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {screen === 'home' && <><Text style={s.hero}>¿Qué deseas consultar hoy?</Text>{button('Nueva solicitud de cotización', () => setScreen('compose'), 'plus-circle')}{button('Mis solicitudes de cotización', () => setScreen('requests'), 'file-text')}{button('Cotizaciones recibidas', () => setScreen('quotes'), 'inbox')}{button('Seguimiento a pedidos', () => setScreen('orders'), 'package')}{button('Entregas de mi hospital', () => setScreen('deliveries'), 'truck')}</>}
      {screen === 'preview' && <><Text style={s.hero}>Previo de solicitud</Text><Text>{user.hospital?.name}</Text><Text>{patient}</Text>{items.map(i => <View style={s.card} key={i.id}><Text style={s.name}>{i.name}</Text><Text>{i.quantity} {i.unit} · {i.presentation}</Text></View>)}{photo && <Image source={{ uri: photo }} style={s.photo} resizeMode="contain" />}<Text>{observations}</Text>{button('Enviar a Ventas', () => void send(), 'send')}</>}
      {screen === 'sent' && <View style={s.card}><Feather name="check-circle" size={44} color="#008C3A" /><Text style={s.hero}>Solicitud enviada</Text><Text>{record?.folio}</Text><Text>Vendedor: {record?.seller}</Text>{button('Ver mis solicitudes', () => setScreen('requests'), 'file-text')}</View>}
      {['requests', 'quotes', 'orders'].includes(screen) && <><Text style={s.hero}>{screen === 'requests' ? 'Mis solicitudes de cotización' : screen === 'quotes' ? 'Cotizaciones recibidas' : 'Seguimiento a pedidos'}</Text>{button('Actualizar', () => void load(), 'refresh-cw')}{screen === 'requests' && button('Cotizaciones recibidas', () => setScreen('quotes'), 'inbox')}{page?.data.map(item => <Pressable key={`${item.category}-${item.id}`} disabled={busy} onPress={() => void open(item)} style={s.card}><Text style={s.name}>{item.folio}</Text><Text>{item.category} · {item.status || 'pendiente'}</Text>{!!item.seller && <Text>Ventas: {item.seller}</Text>}{item.total != null && <Text>Total: {money(item.total)}</Text>}</Pressable>)}{!busy && page?.data.length === 0 && <Text>No hay registros.</Text>}{page && <View style={s.inline}>{page.current_page > 1 && button('Anterior', () => void load(page.current_page - 1))}<Text>{page.current_page}/{page.last_page}</Text>{page.current_page < page.last_page && button('Siguiente', () => void load(page.current_page + 1))}</View>}</>}
      {screen === 'detail' && workflow && <View style={s.card}><Text style={s.name}>Seguimiento de cotización</Text><Text>Institución: {workflow.institution}</Text><Text>Hospital: {workflow.hospital}</Text><Text>Vendedor: {workflow.seller}</Text><Text>Central: {workflow.central || 'Pendiente de asignación'}</Text><Text>Estado: {workflow.status_label}</Text>{workflow.events.map((event, i) => <Text key={i}>{event.status} · {new Date(event.created_at).toLocaleString('es-MX')}</Text>)}</View>}
      {screen === 'detail' && record && <><Text style={s.hero}>{record.folio}</Text><Text>{record.category} · {record.status}</Text>{!!record.seller && <Text>Ventas: {record.seller}</Text>}{record.items?.map(i => <View style={s.card} key={i.id}><Text style={s.name}>{i.name}</Text><Text>{i.quantity} {i.unit}</Text></View>)}{record.mixtures?.map((m, i) => <View key={i} style={s.card}><Text>{m.name}</Text><Text>{m.status}</Text></View>)}{record.pricing_snapshot?.lines.map((line, i) => <View key={i} style={s.card}><Text>{line.description}</Text><Text>{line.quantity} {line.unit} · {money(line.total)}</Text></View>)}{record.total != null && <Text style={s.hero}>Total: {money(record.total)}</Text>}{record.has_attachment && <Text>Fotografía adjunta enviada a Ventas.</Text>}<Text>{record.observations}</Text>{record.quotation_id && record.status === 'Cotización disponible' && button(`Ver ${record.quotation_folio}`, () => void action(async () => { setRecord(await hospitalRequest<RecordItem>(`/quotations/${record.quotation_id}`, token)); }), 'file-text')}{origin === 'orders' && button('Consultar entregas del hospital', () => setScreen('deliveries'), 'truck')}</>}
      {screen === 'notifications' && <><Text style={s.hero}>Notificaciones</Text>{button('Marcar como leídas', () => void action(async () => { await markAllMobileNotificationsRead(token); await loadNotifications(); }), 'check')}{notifications.map(n => <View key={n.id} style={s.card}><Text style={s.name}>{n.title}</Text><Text>{n.message}</Text><Text>{n.relative_time}</Text></View>)}{!notifications.length && <Text>No hay notificaciones.</Text>}</>}
      {screen === 'profile' && <View style={s.card}><Text style={s.hero}>Mi perfil</Text><Text>{user.name}</Text><Text>Usuario: {user.username}</Text><Text>Hospital: {user.hospital?.name}</Text><Text>Usa las mismas credenciales de Mezclas Pro.</Text>{button('Cerrar sesión', () => void onLogout().catch(() => Alert.alert('Sesión', 'No fue posible cerrar la sesión.')), 'log-out')}</View>}
    </ScrollView>{nav}
  </SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#f6faf7' }, header: { padding: 18, backgroundColor: '#008C3A', borderBottomLeftRadius: 22, borderBottomRightRadius: 22, gap: 8 }, inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, title: { color: 'white', fontWeight: '700', fontSize: 20 }, white: { color: 'white', fontSize: 13 }, badge: { position: 'absolute', right: -8, top: -9, color: 'white', backgroundColor: '#db3d31', borderRadius: 12, fontSize: 10, paddingHorizontal: 5 }, content: { padding: 16, gap: 14 }, hero: { fontSize: 20, fontWeight: '700', color: '#18261e' }, name: { fontSize: 16, fontWeight: '600' }, card: { padding: 16, backgroundColor: 'white', borderRadius: 12, borderColor: '#dce7df', borderWidth: 1, gap: 8 }, button: { padding: 16, backgroundColor: 'white', borderWidth: 1, borderColor: '#b8dac5', borderRadius: 10, flexDirection: 'row', gap: 10, alignItems: 'center' }, green: { color: '#008C3A', fontSize: 13, fontWeight: '600' }, category: { padding: 9, borderWidth: 1, borderColor: '#dce7df', borderRadius: 6 }, active: { borderColor: '#008C3A', backgroundColor: '#e9f6ef' }, input: { padding: 12, borderWidth: 1, borderColor: '#bcd4c5', borderRadius: 8, backgroundColor: 'white' }, error: { padding: 12, color: '#a72821', backgroundColor: '#fff0ee' }, photo: { height: 280, width: '100%', borderRadius: 10 }, nav: { backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#d8e4dc', flexDirection: 'row', height: 72, paddingTop: 11 }, navItem: { flex: 1, alignItems: 'center' }, navLabel: { color: '#59675E', fontSize: 10, fontWeight: '700', marginTop: 1 } });


