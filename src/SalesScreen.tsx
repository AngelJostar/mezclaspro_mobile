import React, { useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { salesRequest, mobileMe, MobileUser } from './mobileApi';
import { DeliveryScreen } from './DeliveryScreen';
import { QuotationHistoryScreen } from './QuotationHistoryScreen';
import { BackButton } from './BackButton';
import { QuotationWizard } from './QuotationWizard';

type Screen = 'home' | 'clients' | 'quote' | 'preview' | 'quotations' | 'detail' | 'deliveries' | 'profile' | 'wizard';
type Category = 'oncologicos' | 'nutricionales' | 'antibioticos';
type Item = { id: number; name?: string; institution?: string; folio?: string; hospital?: string; category?: Category; status?: string; total?: string; date?: string; route?: string; delivered_at?: string };
type Page = { data: Item[]; current_page: number; last_page: number };
type Row = { presentation_id: number; concentration?: number; bottle_count?: number; mixture_number?: number; quantityText?: string; mixtureText?: string };
type Product = { id: number; name: string; brand: string; presentation: string; unit: string; unit_price: number | null };
type Catalog = { products: Product[]; institutions: { id: number; nombre: string }[]; price_list: { name: string }; concentration_unit: string };
type Snapshot = { lines: { description: string; presentation: string; quantity: number; unit: string; total: number; mixture_number?: number }[]; total: number };
type Review = { pricing_token: string; pricing_snapshot: Snapshot; document: { total_in_words: string; date: string } };
type Detail = Item & { editable: boolean; clinical_data: Record<string, unknown> & { flow?: string; hospital_id: number; institution_id: number; mixture_count?: number; items?: Row[] }; pricing_snapshot: Snapshot; document: Review['document'] };
const categories: [Category, string][] = [['oncologicos', 'Oncológicos'], ['nutricionales', 'Nutricionales'], ['antibioticos', 'Antibióticos']];
const money = (value: number | string = 0) => `$${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); });

export function SalesScreen({ token, name, onLogout }: { token: string; name: string; onLogout: () => Promise<void> }) {
  const [screen, setScreen] = useState<Screen>('home');
  const [search, setSearch] = useState('');

  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hospital, setHospital] = useState<Item | null>(null);
  const [category, setCategory] = useState<Category>('oncologicos');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [institution, setInstitution] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [mixtures, setMixtures] = useState('1');
  const [patient, setPatient] = useState('');
  const [observations, setObservations] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState<Detail | null>(null);
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [profile, setProfile] = useState<MobileUser | null>(null);
  const submission = useRef(uuid());
  const pending = useRef(false);
  const version = useRef(0);
  async function request(path: string, method = 'GET', body?: unknown) {
    return salesRequest<any>(path, token, method, body);
  }
  async function action(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Error de conexión.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function load(number = 1) {
    const current = ++version.current;
    setError(''); setBusy(true);
    const path = screen === 'clients' ? `/clients?assigned=1&search=${encodeURIComponent(search)}`
      : screen === 'deliveries' ? `/deliveries?date=${encodeURIComponent(date)}` : '/quotations?';
    try { const data = await request(`${path}&page=${number}`); if (current === version.current) setPage(data); }
    catch (e) { if (current === version.current) { setPage(null); setError(e instanceof Error ? e.message : 'Error de conexión.'); } }
    finally { if (current === version.current) setBusy(false); }
  }
  useEffect(() => {
    setPage(null); setError('');
    if (screen === 'clients') void load();
    if (screen === 'profile') void action(async () => setProfile(await mobileMe(token)));
    return () => { version.current++; };
  }, [screen]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && screen === 'clients') void load();
    });
    return () => subscription.remove();
  }, [screen, search, date]);
  async function selectHospital(item: Item, nextCategory = category, draft: Detail | null = null) {
    await action(async () => {
      const data: Catalog = await request(`/catalog?flow=commercial&hospital_id=${item.id}&category=${nextCategory}`);
      setHospital(item); setCategory(nextCategory); setCatalog(data); setInstitution(draft?.clinical_data.institution_id || data.institutions[0]?.id || 0);
      setRows(draft?.clinical_data.items?.map(row => ({ presentation_id: row.presentation_id,
        ...(row.bottle_count !== undefined ? { bottle_count: row.bottle_count } : { concentration: row.concentration }),
        ...(draft.clinical_data.mixture_count ? { mixture_number: row.mixture_number } : {}) })) || []);
      setMixtures(String(draft?.clinical_data.mixture_count || 1));
      setPatient(String(draft?.clinical_data.patient_name || '')); setObservations(String(draft?.clinical_data.observations || ''));
      setEditing(draft); setReview(null); setSearch(''); submission.current = uuid(); setScreen('quote');
    });
  }
  async function changeCategory(value: Category) {
    if (value === category || !hospital) return;
    await action(async () => {
      const data: Catalog = await request(`/catalog?flow=commercial&hospital_id=${hospital.id}&category=${value}`);
      setCatalog(data); setCategory(value); setRows([]); setReview(null);
    });
  }
  function payload() {
    return { ...(editing?.clinical_data || {}), flow: 'commercial', category, hospital_id: hospital?.id, institution_id: institution,
      no_commercial_relationship: false, submission_key: submission.current, action: 'save', patient_name: patient,
      observations, ...(editing && !editing.clinical_data.mixture_count ? {} : { mixture_count: Number(mixtures) }),
      items: rows.map(row => ({ presentation_id: row.presentation_id,
        ...(row.bottle_count !== undefined ? { bottle_count: row.quantityText === undefined ? row.bottle_count : Number(row.quantityText.replace(',', '.')) }
          : { concentration: row.quantityText === undefined ? row.concentration : Number(row.quantityText.replace(',', '.')) }),
        ...(row.mixture_number === undefined ? {} : { mixture_number: row.mixtureText === undefined ? row.mixture_number : Number(row.mixtureText) }) })) };
  }
  async function generatePreview() {
    await action(async () => { setReview(await request('/quotations/preview', 'POST', payload())); setScreen('preview'); });
  }
  async function save(send: boolean) {
    if (!review) return;
    await action(async () => {
      const saved = await request(editing ? `/quotations/${editing.id}` : '/quotations', editing ? 'PUT' : 'POST',
        { ...payload(), pricing_token: review.pricing_token, action: send ? 'send' : 'save' });
      setDetail(await request(`/quotations/${saved.id}`)); setEditing(null); setScreen('detail');
    });
  }
  async function open(item: Item) {
    await action(async () => { setDetail(await request(`/quotations/${item.id}`)); setEmail(''); setScreen('detail'); });
  }
  function updateRow(index: number, changes: Partial<Row>) { setRows(old => old.map((row, i) => i === index ? { ...row, ...changes } : row)); setReview(null); }
  const button = (label: string, onPress: () => void, secondary = false, disabled = false) => <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress} style={[s.button, secondary && s.secondary, (busy || disabled) && s.disabled]}><Text style={[s.buttonText, secondary && s.green]}>{label}</Text></Pressable>;
  const summary = (data: { pricing_snapshot: Snapshot; document: Review['document'] }) => <View style={s.card}>{data.pricing_snapshot.lines.map((line, i) => <View key={i} style={s.line}><Text style={s.name}>{line.description}</Text><Text>{line.presentation}</Text><Text>{line.mixture_number ? `Mezcla ${line.mixture_number} · ` : ''}{line.quantity} {line.unit} · {money(line.total)}</Text></View>)}<Text style={s.titleDark}>Total: {money(data.pricing_snapshot.total)}</Text><Text>{data.document.total_in_words}</Text></View>;
  const back = () => { if (screen === 'preview') setScreen('quote'); else if (screen === 'quote') { setScreen(editing ? 'detail' : 'clients'); setSearch(''); } else if (screen === 'detail') setScreen('quotations'); else setScreen('home'); };
  const navigation =     <View style={s.footer}>
      {([
        { label: 'Inicio', icon: 'home', target: 'home', active: screen === 'home' },
        { label: 'Cotizaciones', icon: 'file-text', target: 'quotations', active: ['clients', 'quote', 'preview', 'quotations', 'detail'].includes(screen) },
        { label: 'Entregas', icon: 'truck', target: 'deliveries', active: screen === 'deliveries' },
        { label: 'Perfil', icon: 'user', target: 'profile', active: screen === 'profile' },
      ] as const).map(item => <Pressable key={item.target} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: item.active, disabled: busy }} disabled={busy} onPress={() => setScreen(item.target)} style={[s.navItem, busy && s.disabled]}>
        <Feather name={item.icon} size={20} color={item.active ? '#008C3A' : '#76847B'} />
        <Text style={[s.navLabel, item.active && s.navActive]}>{item.label}</Text>
      </Pressable>)}
    </View>;
  if (screen === 'deliveries') return <SafeAreaView style={s.root}><DeliveryScreen token={token} module="sales" name={name} onBack={() => setScreen('home')} />{navigation}</SafeAreaView>;
  if (screen === 'wizard') return <QuotationWizard token={token} name={name} initialDraft={editing} onClose={() => setScreen(editing ? 'detail' : 'home')} onDone={() => { setEditing(null); setScreen('quotations'); }} />;
  if (screen === 'quotations') return <SafeAreaView style={s.root}><QuotationHistoryScreen token={token} name={name} onBack={() => setScreen('home')} onOpen={item => void open({ id: item.id })} />{navigation}</SafeAreaView>;
  return <SafeAreaView style={s.root}>
    <View style={s.header}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>{screen !== 'home' && <BackButton disabled={busy} onPress={back} />}<View><Text style={s.title}>Ventas</Text><Text style={s.white}>{name}</Text></View></View></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {busy && <ActivityIndicator color="#00832c" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {screen === 'home' && <View style={s.card}><View style={{ alignSelf: 'center', padding: 24, borderRadius: 50, backgroundColor: '#e7f5ec' }}><Feather name="file-text" size={34} color="#00832c" /></View><Text style={s.hero}>Crea una nueva cotización</Text><Text style={s.center}>Selecciona un hospital, agrega insumos y genera tu cotización.</Text>{button('Nueva cotización', () => { setEditing(null); setScreen('wizard'); })}{button('Historial de cotizaciones', () => setScreen('quotations'), true)}{button('Entregas', () => setScreen('deliveries'), true)}</View>}
      {screen === 'profile' && <View style={s.card}><Text style={s.titleDark}>Mi perfil</Text><Text>{profile?.name || name}</Text><Text>{profile?.username}</Text><Text>{profile?.profile?.phone}</Text><Text>{profile?.profile?.email}</Text>{button('Cerrar sesión', () => void onLogout(), true)}</View>}
      {screen === 'clients' && <><Text style={s.titleDark}>Seleccionar hospital</Text><TextInput accessibilityLabel="Buscar hospital" style={s.input} placeholder="Buscar hospital…" value={search} onChangeText={setSearch} />{button('Buscar', () => void load(), true)}</>}
      {['clients', 'quotations'].includes(screen) && <>
        {!busy && page?.data.length === 0 && <Text>{screen === 'clients' ? 'No tienes hospitales asignados que coincidan con la búsqueda.' : 'No hay registros.'}</Text>}
        {page?.data.map(item => <Pressable disabled={busy} key={item.id} style={s.card} onPress={() => screen === 'clients' ? void selectHospital(item) : void open(item)}><Text style={s.name}>{item.name || item.folio || item.hospital}</Text><Text>{item.institution || (item.folio ? item.hospital : item.route)}</Text>{item.total != null && <Text>{item.category} · {item.status} · {money(item.total)}</Text>}{item.date && <><Text>{item.date} · {item.status}</Text>{item.delivered_at && <Text>Entregada: {new Date(item.delivered_at).toLocaleString('es-MX')}</Text>}</>}</Pressable>)}
        {page && <View style={s.inline}>{button('Anterior', () => void load(page.current_page - 1), true, page.current_page <= 1)}<Text>{page.current_page}/{page.last_page}</Text>{button('Siguiente', () => void load(page.current_page + 1), true, page.current_page >= page.last_page)}</View>}
      </>}
      {screen === 'quote' && hospital && catalog && <>
        <Text style={s.titleDark}>{editing ? 'Editar borrador' : 'Nueva cotización'}</Text><View style={s.card}><Text style={s.name}>{hospital.name}</Text><Text>Lista de precios: {catalog.price_list.name}</Text></View>
        <Text style={s.name}>Tipo de catálogo</Text><View style={s.inline}>{categories.map(([value, label]) => <Pressable disabled={busy || !!editing} key={value} onPress={() => void changeCategory(value)} style={[s.category, category === value && s.selected]}><Text style={s.green}>{label}</Text></Pressable>)}</View>
        {catalog.institutions.length > 1 && <><Text style={s.name}>Institución</Text>{catalog.institutions.map(item => <View key={item.id}>{button(item.nombre, () => setInstitution(item.id), item.id !== institution)}</View>)}</>}
        <TextInput accessibilityLabel="Paciente" style={s.input} placeholder="Paciente (opcional)" value={patient} onChangeText={setPatient} />
        {(!editing || !!editing.clinical_data.mixture_count) && <><Text>Número de mezclas (1 a 50)</Text><TextInput accessibilityLabel="Número de mezclas" keyboardType="number-pad" style={s.input} value={mixtures} onChangeText={setMixtures} /></>}
        <Text style={s.name}>Insumo o medicamento</Text><TextInput accessibilityLabel="Buscar insumo o medicamento" style={s.input} placeholder="Buscar insumo o medicamento…" value={search} onChangeText={setSearch} />
        {!!search.trim() && catalog.products.filter(product => `${product.name} ${product.brand} ${product.presentation}`.toLowerCase().includes(search.toLowerCase())).map(product => <View style={s.card} key={product.id}><Text style={s.name}>{product.name}</Text><Text>{product.brand} · {product.presentation}</Text><Text>{product.unit_price === null ? 'Precio no disponible' : `${money(product.unit_price)} / ${product.unit}`}</Text>{button('+ Agregar', () => { setRows(old => [...old, { presentation_id: product.id, ...(product.unit === 'frasco' ? { bottle_count: 1 } : { concentration: 1 }), ...(!editing || editing.clinical_data.mixture_count ? { mixture_number: 1 } : {}) }]); setSearch(''); }, true, product.unit_price === null)}</View>)}
        <Text style={s.titleDark}>Selección</Text>{rows.length === 0 && <Text>Busca un producto y selecciónalo con el botón + para configurar la cotización.</Text>}
        {rows.map((row, index) => { const product = catalog.products.find(p => p.id === row.presentation_id); return <View key={index} style={s.card}><Text style={s.name}>{product?.name || `Presentación ${row.presentation_id}`}</Text><Text>{product?.presentation}</Text><Text>{row.bottle_count !== undefined ? 'Cantidad de frascos' : `Concentración (${catalog.concentration_unit})`}</Text><TextInput accessibilityLabel={`Cantidad del producto ${index + 1}`} keyboardType="decimal-pad" style={s.input} value={row.quantityText ?? String(row.bottle_count ?? row.concentration ?? '')} onChangeText={value => updateRow(index, { quantityText: value })} />{row.mixture_number !== undefined && <><Text>Mezcla</Text><TextInput accessibilityLabel={`Mezcla del producto ${index + 1}`} keyboardType="number-pad" style={s.input} value={row.mixtureText ?? String(row.mixture_number)} onChangeText={value => updateRow(index, { mixtureText: value })} /></>}{button('Quitar', () => setRows(old => old.filter((_, i) => i !== index)), true)}</View>; })}
        <TextInput accessibilityLabel="Observaciones" multiline style={s.input} placeholder="Observaciones" value={observations} onChangeText={setObservations} />{button('Generar previo', () => void generatePreview(), false, rows.length === 0)}
      </>}
      {screen === 'preview' && review && <><Text style={s.titleDark}>Previo de cotización</Text><Text>{hospital?.name} · {catalog?.price_list.name}</Text>{summary(review)}{button('Guardar borrador', () => void save(false), true)}{button('Enviar cotización', () => void save(true))}</>}
      {screen === 'detail' && detail && <><Text style={s.titleDark}>{detail.folio}</Text><Text>{detail.hospital} · {detail.category} · {detail.status}</Text><Text>{detail.document.date}</Text>{summary(detail)}
        {detail.editable && detail.clinical_data.flow === 'commercial' && button('Editar borrador', () => { setEditing(detail); setScreen('wizard'); }, true)}
        {button('Compartir resumen', () => void Share.share({ message: `${detail.folio}\n${detail.hospital}\n${detail.pricing_snapshot.lines.map(line => `${line.description}: ${line.quantity} ${line.unit} · ${money(line.total)}`).join('\n')}\nTotal: ${money(detail.total)}\n${detail.document.total_in_words}` }).catch(() => Alert.alert('Cotización', 'No fue posible compartir el resumen.')), true)}
        <TextInput accessibilityLabel="Correo del cliente" autoCapitalize="none" keyboardType="email-address" style={s.input} placeholder="Correo del cliente" value={email} onChangeText={setEmail} />
        {button('Enviar PDF por correo', () => void action(async () => { const data = await request(`/quotations/${detail.id}/email`, 'POST', { email: email.trim() }); Alert.alert('Cotización', data.message); }), false, !email.trim())}
      </>}
    </ScrollView>
    {navigation}
  </SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#f5faf7' }, header: { padding: 20, gap: 8, backgroundColor: '#00832c', borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }, title: { color: 'white', fontSize: 22, fontWeight: '700' }, titleDark: { fontSize: 20, fontWeight: '700', color: '#14231b' }, white: { color: 'white' }, content: { padding: 16, gap: 12 }, card: { padding: 18, borderRadius: 14, backgroundColor: 'white', borderWidth: 1, borderColor: '#dbe6df', gap: 10 }, name: { fontWeight: '700', fontSize: 16 }, hero: { fontWeight: '700', fontSize: 22, textAlign: 'center', marginTop: 20 }, center: { textAlign: 'center', marginBottom: 10, color: '#53675c' }, inline: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }, button: { paddingVertical: 13, paddingHorizontal: 14, backgroundColor: '#00832c', borderRadius: 8, borderWidth: 1, borderColor: '#00832c' }, secondary: { backgroundColor: 'white', borderColor: '#a7d7b7' }, buttonText: { color: 'white', fontWeight: '700', textAlign: 'center' }, green: { color: '#007b2b', fontWeight: '600' }, disabled: { opacity: 0.5 }, input: { padding: 12, backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#bcd3c4' }, error: { color: '#b42318', padding: 12, backgroundColor: '#fff0ed', borderRadius: 8 }, category: { paddingVertical: 12, paddingHorizontal: 7, borderWidth: 1, borderColor: '#dbe6df', borderRadius: 6, backgroundColor: 'white' }, selected: { borderColor: '#00832c', backgroundColor: '#eaf7ee' }, line: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e5eee8', gap: 4 }, footer: { backgroundColor: '#FFFFFF', borderTopColor: '#D8E4DC', borderTopWidth: 1, flexDirection: 'row', height: 72, justifyContent: 'space-around', paddingTop: 8 }, navItem: { alignItems: 'center', flex: 1, paddingTop: 3 }, navLabel: { color: '#59675E', fontSize: 10, fontWeight: '700', marginTop: 1 }, navActive: { color: '#008C3A' } });



