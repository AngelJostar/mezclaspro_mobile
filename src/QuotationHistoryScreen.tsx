import { BackButton } from './BackButton';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { salesRequest } from './mobileApi';

type Quote = { id: number; folio: string; hospital: string; institution?: string; patient?: string; seller?: string; category: string; status: string; status_label: string; total: string; date?: string; can_send: boolean };
type Option = { id: number; name: string };
type Feed = { data: Quote[]; total: number; current_page: number; last_page: number; filters: { hospitals: Option[]; institutions: Option[] } };
type Filter = 'institution' | 'hospital' | 'date' | 'status';
const states = [{ id: 'borrador', name: 'Borrador' }, { id: 'enviada', name: 'Enviada' }, { id: 'autorizada', name: 'Autorizada' }, { id: 'preparacion', name: 'En preparación' }];
const dateLabel = (date?: string) => date ? date.split('-').reverse().join('/') : '—';
const categoryLabel: Record<string, string> = { oncologicos: 'Oncológica', nutricionales: 'Nutricional', antibioticos: 'Antibióticos' };
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function QuotationHistoryScreen({ token, name, onBack, onOpen }: { token: string; name: string; onBack: () => void; onOpen: (quote: Quote) => void }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [search, setSearch] = useState('');
  const [institution, setInstitution] = useState('');
  const [hospital, setHospital] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState('all');
  const [picker, setPicker] = useState<Filter | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<Quote | null>(null);
  const [sendChannel, setSendChannel] = useState<'choose' | 'email'>('choose');
  const [email, setEmail] = useState('');
  const [mailBusy, setMailBusy] = useState(false);
  const [mailMessage, setMailMessage] = useState('');
  const version = useRef(0);
  async function load(page = 1) {
    const revision = ++version.current; setBusy(true); setError('');
    const params = new URLSearchParams({ search, institution_id: institution, hospital_id: hospital, status, from, to, tab, page: String(page) });
    try { const data = await salesRequest<Feed>(`/quotations?${params}`, token); if (revision === version.current) setFeed(data); }
    catch (e) { if (revision === version.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.'); }
    finally { if (revision === version.current) setBusy(false); }
  }
  useEffect(() => { const timer = setTimeout(() => void load(), 300); return () => { clearTimeout(timer); version.current++; }; }, [search, institution, hospital, status, from, to, tab]);
  useEffect(() => { let active = true; const timer = setInterval(() => { if (active) void load(feed?.current_page || 1); }, 15000); const subscription = AppState.addEventListener('change', state => { active = state === 'active'; if (active) void load(feed?.current_page || 1); }); return () => { clearInterval(timer); subscription.remove(); }; }, [search, institution, hospital, status, from, to, tab, feed?.current_page]);
  const selectedLabel = (key: Filter) => key === 'institution' ? feed?.filters.institutions.find(i => String(i.id) === institution)?.name || 'Todas'
    : key === 'hospital' ? feed?.filters.hospitals.find(i => String(i.id) === hospital)?.name || 'Todos'
    : key === 'status' ? states.find(i => i.id === status)?.name || 'Todas'
    : from || to ? `${from ? dateLabel(from) : 'Inicio'} – ${to ? dateLabel(to) : 'Hoy'}` : 'Todas';
  const options = picker === 'institution' ? feed?.filters.institutions || [] : picker === 'hospital' ? feed?.filters.hospitals || [] : states;
  function choose(value: string) { if (picker === 'institution') setInstitution(value); if (picker === 'hospital') setHospital(value); if (picker === 'status') setStatus(value); setPicker(null); }
  async function send() {
    if (!sending || mailBusy || !email.trim()) return;
    setMailBusy(true); setMailMessage('');
    try { const result = await salesRequest<{ message: string }>(`/quotations/${sending.id}/email`, token, 'POST', { email: email.trim() }); setMailMessage(result.message); }
    catch (e) { setMailMessage(e instanceof Error ? e.message : 'No se pudo enviar la cotización.'); }
    finally { setMailBusy(false); }
  }
  async function whatsapp() {
    if (!sending || mailBusy) return;
    setMailBusy(true); setMailMessage('');
    try {
      const quote = await salesRequest<{ folio: string; hospital: string; total: string; pricing_snapshot: { lines: { description: string; quantity: number; unit: string; total: number }[] } }>(`/quotations/${sending.id}`, token);
      const money = (value: string | number) => `$${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
      const text = `${quote.folio}\n${quote.hospital}\n${quote.pricing_snapshot.lines.map(line => `${line.description}: ${line.quantity} ${line.unit} · ${money(line.total)}`).join('\n')}\nTotal: ${money(quote.total)}`;
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
    } catch (e) { setMailMessage(e instanceof Error ? e.message : 'No se pudo abrir WhatsApp.'); }
    finally { setMailBusy(false); }
  }
  return <View style={s.root}>
    <View style={s.header}><BackButton onPress={onBack} /><View style={{ flex: 1 }}><Text style={s.heading}>Historial de cotizaciones</Text><Text style={s.white}>{name}</Text></View></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.search}><Feather name="search" size={20} color="#6f7d83" /><TextInput style={s.searchInput} accessibilityLabel="Buscar cotizaciones" placeholder="Buscar folio, paciente o vendedor…" placeholderTextColor="#89929d" value={search} onChangeText={setSearch} /></View>
      <View style={s.filters}>{([
        ['institution', 'Institución', 'grid'], ['hospital', 'Hospital', 'plus-square'], ['date', 'Fecha', 'calendar'], ['status', 'Estado', 'list'],
      ] as const).map(([key, label, icon]) => <View key={key} style={s.filterGroup}><Text style={s.filterLabel}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Filtrar por ${label}`} style={s.select} onPress={() => { setDateFrom(from); setDateTo(to); setPicker(key); }}><Feather name={icon} size={19} color="#6f7d83" /><Text numberOfLines={1} style={s.selectText}>{selectedLabel(key)}</Text><Feather name="chevron-down" size={18} color="#6f7d83" /></Pressable></View>)}</View>
      <View style={s.tabs}>{([['all', 'Todas'], ['new', 'Nuevas'], ['history', 'Historial']] as const).map(([key, label]) => <Pressable accessibilityRole="button" accessibilityState={{ selected: tab === key }} key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabActive]}><Text style={[s.tabText, tab === key && s.green]}>{label}</Text></Pressable>)}</View>
      <View style={s.countRow}><Text style={s.count}>{feed?.total ?? 0} cotizaciones</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void load()} style={s.refresh}><Feather name="refresh-cw" size={19} color="#008C3A" /><Text style={s.refreshLabel}>Actualizar</Text></Pressable></View>
      {busy && <ActivityIndicator color="#008C3A" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {feed?.data.map(quote => <View key={quote.id} style={s.card}>
        <View style={s.cardTop}><View style={[s.category, quote.category === 'nutricionales' && s.nutrition]}><Text style={[s.categoryText, quote.category === 'nutricionales' && { color: '#247956' }]}>{categoryLabel[quote.category] || quote.category}</Text></View><Text style={s.date}>{dateLabel(quote.date)}</Text></View>
        <View style={s.cardBody}><View style={s.identity}><Text style={s.folio}>{quote.folio}</Text><Text style={s.institution}>{quote.institution || 'Sin institución'}</Text>{([['grid', quote.hospital], ['user', quote.patient || 'Sin paciente'], ['users', quote.seller || 'Sin asignar']] as const).map(([icon, label], i) => <View key={i} style={s.info}><Feather name={icon} size={17} color="#65717e" /><Text style={s.infoText}>{label}</Text></View>)}</View><View style={s.amountColumn}><Text style={s.amount}>${Number(quote.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</Text><View style={[s.status, !['autorizada', 'preparacion'].includes(quote.status) && s.pending]}><Text style={s.statusText}>{quote.status_label || quote.status}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${quote.folio}`} onPress={() => onOpen(quote)}><Feather name="chevron-right" size={24} color="#21465c" /></Pressable></View></View>
        <View style={s.actions}>{([
          ['eye', 'Ver'], ['send', 'Enviar'], ['file-text', 'Detalle'],
        ] as const).map(([icon, label]) => <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${quote.folio}`} disabled={label === 'Enviar' && !quote.can_send} key={label} style={[s.action, label === 'Enviar' && s.send, label === 'Enviar' && !quote.can_send && { opacity: 0.45 }]} onPress={() => { if (label === 'Enviar' && quote.status === 'borrador') { onOpen(quote); } else if (label === 'Enviar') { setSending(quote); setEmail(''); setMailMessage(''); } else onOpen(quote); }}><Feather name={icon} size={18} color={label === 'Enviar' ? 'white' : '#274b65'} /><Text style={[s.actionLabel, label === 'Enviar' && { color: 'white' }]}>{label}</Text></Pressable>)}</View>
      </View>)}
      {!busy && feed?.data.length === 0 && <View style={s.empty}><Feather name="file-text" size={30} color="#87968e" /><Text style={s.infoText}>No hay cotizaciones para estos filtros.</Text></View>}
      {feed && feed.last_page > 1 && <View style={s.countRow}><Pressable disabled={busy || feed.current_page <= 1} onPress={() => void load(feed.current_page - 1)}><Text style={s.green}>Anterior</Text></Pressable><Text>{feed.current_page}/{feed.last_page}</Text><Pressable disabled={busy || feed.current_page >= feed.last_page} onPress={() => void load(feed.current_page + 1)}><Text style={s.green}>Siguiente</Text></Pressable></View>}
    </ScrollView>
    <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}><View style={s.overlay}><View style={s.modal}><Text style={s.folio}>{picker === 'date' ? 'Fecha de cotización' : 'Seleccionar filtro'}</Text><ScrollView>
      {picker === 'date' ? <><Text style={s.infoText}>Desde (AAAA-MM-DD)</Text><TextInput accessibilityLabel="Fecha desde" style={s.modalInput} value={dateFrom} onChangeText={setDateFrom} placeholder="AAAA-MM-DD" /><Text style={s.infoText}>Hasta (AAAA-MM-DD)</Text><TextInput accessibilityLabel="Fecha hasta" style={s.modalInput} value={dateTo} onChangeText={setDateTo} placeholder="AAAA-MM-DD" /><Pressable style={s.choice} onPress={() => { const today = localDate(new Date()); setFrom(today); setTo(today); setPicker(null); }}><Text style={s.green}>Hoy</Text></Pressable><Pressable style={s.choice} onPress={() => { setFrom(''); setTo(''); setPicker(null); }}><Text>Todas las fechas</Text></Pressable><Pressable style={s.choice} onPress={() => { setFrom(dateFrom.trim()); setTo(dateTo.trim()); setPicker(null); }}><Text style={s.green}>Aplicar fechas</Text></Pressable></> : <><Pressable style={s.choice} onPress={() => choose('')}><Text>Todas / Todos</Text></Pressable>{options.map(option => <Pressable key={option.id} style={s.choice} onPress={() => choose(String(option.id))}><Text>{option.name}</Text></Pressable>)}</>}
      </ScrollView><Pressable style={s.choice} onPress={() => setPicker(null)}><Text style={s.green}>Cerrar</Text></Pressable></View></View></Modal>
    <Modal visible={!!sending} transparent animationType="fade" onRequestClose={() => { if (!mailBusy) { setSending(null); setSendChannel('choose'); } }}><View style={s.overlay}><View style={[s.modal, { borderRadius: 20, padding: 22 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><Text style={s.folio}>Enviar {sending?.folio}</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar opciones de envío" disabled={mailBusy} hitSlop={8} onPress={() => { setSending(null); setSendChannel('choose'); }}><Feather name="x" size={23} color="#53616e" /></Pressable></View>
      {sendChannel === 'choose' ? <><Text style={{ color: '#25354b', fontSize: 13, marginTop: 6 }}>Selecciona el medio para enviar la cotización</Text><View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Enviar por WhatsApp" disabled={mailBusy} style={{ flex: 1, borderWidth: 1, borderColor: '#a5e8be', borderRadius: 12, backgroundColor: '#e9f7ef', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 8 }} onPress={() => void whatsapp()}><FontAwesome name="whatsapp" size={40} color="#008C3A" /><Text style={{ color: '#008C3A', fontSize: 13, textAlign: 'center', lineHeight: 19 }}>Enviar por{'\n'}WhatsApp</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Enviar por Correo electrónico" disabled={mailBusy} style={{ flex: 1, borderWidth: 1, borderColor: '#e1e7ee', borderRadius: 12, backgroundColor: '#f6f8fa', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 8 }} onPress={() => { setSendChannel('email'); setMailMessage(''); }}><Feather name="mail" size={36} color="#182a3e" /><Text style={{ color: '#0f1930', fontSize: 13, textAlign: 'center', lineHeight: 19 }}>Enviar por{'\n'}Correo electrónico</Text></Pressable>
      </View></> : <><Text style={s.infoText}>Correo del cliente</Text><TextInput accessibilityLabel="Correo del cliente" style={s.modalInput} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} editable={!mailBusy} /><Pressable disabled={mailBusy || !email.trim()} style={[s.action, s.send]} onPress={() => void send()}><Text style={s.white}>Enviar PDF por correo</Text></Pressable><Pressable disabled={mailBusy} onPress={() => { setSendChannel('choose'); setMailMessage(''); }}><Text style={s.green}>Cambiar medio de envío</Text></Pressable></>}
      {!!mailMessage && <Text accessibilityRole="alert">{mailMessage}</Text>}{mailBusy && <ActivityIndicator color="#008C3A" />}
      <Pressable accessibilityRole="button" disabled={mailBusy} style={{ borderTopWidth: 1, borderTopColor: '#e8edf1', paddingTop: 16, marginTop: 2, alignItems: 'center' }} onPress={() => { setSending(null); setSendChannel('choose'); }}><Text style={{ color: '#68778c', fontSize: 13, fontWeight: '600' }}>Cancelar</Text></Pressable>
    </View></View></Modal>
  </View>;
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#fbfdfc' }, header: { backgroundColor: '#008C3A', borderBottomLeftRadius: 23, borderBottomRightRadius: 23, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 15 }, back: { width: 44, height: 44, borderRadius: 24, borderWidth: 1, borderColor: '#77bb92', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff0d' }, heading: { color: 'white', fontSize: 20, fontWeight: '700' }, white: { color: 'white', fontSize: 13, marginTop: 4 }, content: { padding: 14, gap: 14 }, search: { borderWidth: 1, borderColor: '#e0e6ea', borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 9, backgroundColor: 'white' }, searchInput: { flex: 1, paddingVertical: 12, fontSize: 12 }, filters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }, filterGroup: { width: '48.5%', gap: 5 }, filterLabel: { color: '#616c79', fontSize: 13 }, select: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#dfe6ea', borderRadius: 9, padding: 10, gap: 8, backgroundColor: 'white' }, selectText: { flex: 1, color: '#6b7680', fontSize: 12 }, tabs: { flexDirection: 'row', gap: 5 }, tab: { flex: 1, backgroundColor: '#eef2f4', paddingVertical: 12, borderRadius: 13, alignItems: 'center' }, tabActive: { backgroundColor: '#dcf0e2' }, tabText: { color: '#818a96', fontSize: 13, fontWeight: '700' }, green: { color: '#008C3A', fontWeight: '700' }, countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 }, count: { color: '#68727e', fontSize: 13 }, refresh: { flexDirection: 'row', alignItems: 'center', gap: 7 }, refreshLabel: { color: '#008C3A', fontSize: 13, fontWeight: '700' }, card: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e0e7eb', borderRadius: 13, padding: 12, gap: 10 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, category: { backgroundColor: '#f0ecff', borderWidth: 1, borderColor: '#dbceff', borderRadius: 14, paddingHorizontal: 7, paddingVertical: 2 }, nutrition: { backgroundColor: '#e6f5ed', borderColor: '#bfe4cf' }, categoryText: { fontSize: 10, fontWeight: '700', color: '#6d41ce' }, date: { fontSize: 11, color: '#8a96a3' }, cardBody: { flexDirection: 'row', gap: 8 }, identity: { flex: 1, gap: 5 }, folio: { fontSize: 16, fontWeight: '700', color: '#0f1930' }, institution: { fontSize: 11, color: '#65717e', lineHeight: 15 }, info: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' }, infoText: { flex: 1, fontSize: 11, color: '#65717e', lineHeight: 16 }, amountColumn: { width: '40%', alignItems: 'flex-end', gap: 10 }, amount: { fontSize: 13, fontWeight: '700', color: '#0f1930', textAlign: 'right' }, status: { backgroundColor: '#ccebd4', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 5 }, pending: { backgroundColor: '#edf2f6' }, statusText: { fontSize: 10, color: '#008C3A', fontWeight: '700' }, actions: { flexDirection: 'row', gap: 7, marginTop: 3 }, action: { flex: 1, backgroundColor: '#eef2f5', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 }, send: { backgroundColor: '#008C3A' }, actionLabel: { fontSize: 11, fontWeight: '700', color: '#38546c' }, empty: { padding: 25, alignItems: 'center', gap: 10 }, error: { color: '#b42318', padding: 12, backgroundColor: '#fff0ed', borderRadius: 8 }, overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: 24 }, modal: { backgroundColor: 'white', borderRadius: 16, padding: 20, gap: 12, maxHeight: '75%' }, choice: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e6ece9' }, modalInput: { borderWidth: 1, borderColor: '#dce5e0', borderRadius: 8, padding: 12 } });
