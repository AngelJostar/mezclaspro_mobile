import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { acceptRoute, assignedRoutes, availableRoutes, confirmDelivery, Coordinates, hospitalDashboard, HospitalDashboard, login, markAllMobileNotificationsRead, mobileMe, MobileNotification, mobileNotifications, MobileRoute, MobileStop, MobileUser, releaseRoute, routeCatalog as loadRouteCatalog, RouteCatalogItem, routeHistory as loadRouteHistory, sendLocation, startRoute } from './src/mobileApi';

type Screen = 'login' | 'routes' | 'catalog' | 'routeCatalog' | 'scanner' | 'history' | 'route' | 'delivery' | 'profile' | 'hospital';
const TOKEN_KEY = 'prodifem.mobile.token';
const DEMO_USERS = [
  { label: 'Juan Aviles - Mensajero', username: 'Juan Aviles', password: 'demo' },
  { label: 'Hospital demo', username: 'hospital.demo', password: '' },
];

async function storedToken(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;

  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function saveToken(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(TOKEN_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, value);
}

async function removeStoredToken(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(TOKEN_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

function MobileApp() {
  const [screen, setScreen] = useState<Screen>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(false);
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [mobileUser, setMobileUser] = useState<MobileUser | null>(null);
  const [hospitalData, setHospitalData] = useState<HospitalDashboard | null>(null);
  const [routes, setRoutes] = useState<MobileRoute[]>([]);
  const [publishedRoutes, setPublishedRoutes] = useState<MobileRoute[]>([]);
  const [catalogRoutes, setCatalogRoutes] = useState<RouteCatalogItem[]>([]);
  const [historyRoutes, setHistoryRoutes] = useState<MobileRoute[]>([]);
  const [routeId, setRouteId] = useState<number | null>(null);
  const [stopId, setStopId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [scannerTab, setScannerTab] = useState<'scan' | 'manual'>('scan');
  const [scannedRoute, setScannedRoute] = useState<MobileRoute | null>(null);
  const [routeSearch, setRouteSearch] = useState('');
  const [expandedCatalogRouteId, setExpandedCatalogRouteId] = useState<number | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationMessage, setLocationMessage] = useState('Ubicación pendiente de activar');
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const loginScrollRef = useRef<ScrollView | null>(null);

  const route = useMemo(() => routes.find((item) => item.id === routeId) ?? null, [routes, routeId]);
  const stop = useMemo(() => route?.stops.find((item) => item.schedule_id === stopId) ?? null, [route, stopId]);

  useEffect(() => {
    storedToken().then((tokenValue) => {
      if (tokenValue) loadApp(tokenValue);
    });
  }, []);

  useEffect(() => () => locationSubscription.current?.remove(), []);

  useEffect(() => {
    const activeRoute = routes.find((item) => item.status === 'in_route');

    if (!token || !activeRoute) {
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      return;
    }

    if (locationSubscription.current) {
      void syncCurrentLocation(token, activeRoute.id);
      return;
    }

    void Location.getForegroundPermissionsAsync().then((permission) => {
      if (permission.status !== 'granted') {
        setLocationMessage('Ubicación pendiente de autorizar');
        return;
      }

      void syncCurrentLocation(token, activeRoute.id);
      return startLocationTracking(token, activeRoute.id);
    }).catch(() => setLocationMessage('No fue posible reanudar la ubicación'));
  }, [token, routes]);

  const loadApp = async (sessionToken: string) => {
    setLoading(true);
    try {
      const user = await mobileMe(sessionToken);
      setToken(sessionToken);
      setMobileUser(user);

      if (user.module === 'hospital') {
        const dashboard = await hospitalDashboard(sessionToken);
        setHospitalData(dashboard);
        setRoutes([]);
        setScreen('hospital');
        return;
      }

      const [assigned, available, catalog, history, notificationFeed] = await Promise.all([assignedRoutes(sessionToken), availableRoutes(sessionToken), loadRouteCatalog(sessionToken), loadRouteHistory(sessionToken), mobileNotifications(sessionToken)]);
      setHospitalData(null);
      setRoutes(assigned);
      setPublishedRoutes(available);
      setCatalogRoutes(catalog);
      setHistoryRoutes(history);
      setNotifications(notificationFeed.notifications);
      setScreen('routes');
    } catch (error) {
      await removeStoredToken();
      setToken(null);
      setAuthMessage(message(error));
      Alert.alert('Sesión no disponible', message(error));
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    if (!username.trim() || !password.trim()) {
      setAuthMessage('Captura tu usuario y contraseña.');
      return Alert.alert('Faltan datos', 'Captura tu usuario y contraseña.');
    }

    setAuthMessage(null);
    setLoading(true);
    try {
      const session = await login(username.trim(), password);
      if (rememberSession) await saveToken(session.token);
      else await removeStoredToken();
      await loadApp(session.token);
    } catch (error) {
      const errorMessage = message(error);
      setAuthMessage(errorMessage);
      Alert.alert('No fue posible iniciar sesión', errorMessage);
      setLoading(false);
    }
  };

  const signOut = async () => {
    locationSubscription.current?.remove();
    locationSubscription.current = null;
    await removeStoredToken();
    setToken(null);
    setMobileUser(null);
    setHospitalData(null);
    setRoutes([]);
    setPublishedRoutes([]);
    setCatalogRoutes([]);
    setHistoryRoutes([]);
    setNotifications([]);
    setRouteId(null);
    setScreen('login');
  };

  const refreshRouteCatalog = async () => {
    if (!token) return;
    setLoading(true);
    try {
      setCatalogRoutes(await loadRouteCatalog(token));
    } catch (error) {
      Alert.alert('No fue posible actualizar las rutas', message(error));
    } finally {
      setLoading(false);
    }
  };

  const openRouteCatalog = () => {
    setRouteSearch('');
    setExpandedCatalogRouteId(null);
    setScreen('routeCatalog');
    void refreshRouteCatalog();
  };

  const refreshSelectableRoutes = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [assigned, available] = await Promise.all([assignedRoutes(token), availableRoutes(token)]);
      setRoutes(assigned);
      setPublishedRoutes(available);
    } catch (error) {
      Alert.alert('No fue posible actualizar las rutas', message(error));
    } finally {
      setLoading(false);
    }
  };

  const openSelectableRoutes = () => {
    setRouteSearch('');
    setScreen('catalog');
    void refreshSelectableRoutes();
  };

  const openNotifications = async () => {
    setNotificationsOpen(true);
    if (!token) return;
    try {
      const result = await mobileNotifications(token);
      setNotifications(result.notifications);
    } catch (error) {
      Alert.alert('No fue posible cargar las notificaciones', message(error));
    }
  };

  const readAllNotifications = async () => {
    if (!token) return;
    try {
      await markAllMobileNotificationsRead(token);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
    } catch (error) {
      Alert.alert('No fue posible actualizar las notificaciones', message(error));
    }
  };

  const currentCoordinates = async (): Promise<Coordinates | undefined> => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setLocationMessage('Ubicación no autorizada');
      return undefined;
    }
    try {
      let position: Location.LocationObject;
      try {
        position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        const lastKnownPosition = await Location.getLastKnownPositionAsync();
        if (!lastKnownPosition) throw new Error('No hay una ubicación disponible todavía.');
        position = lastKnownPosition;
      }
      const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
      setLocationMessage(`Ubicación activa · ${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`);
      return coordinates;
    } catch {
      setLocationMessage('Ubicación autorizada · Esperando señal GPS');
      return undefined;
    }
  };

  const syncCurrentLocation = async (sessionToken: string, selectedRouteId: number) => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationMessage('Ubicación no autorizada');
        return;
      }
      let position: Location.LocationObject;
      try {
        position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        const lastKnownPosition = await Location.getLastKnownPositionAsync();
        if (!lastKnownPosition) throw new Error('No hay una ubicación disponible todavía.');
        position = lastKnownPosition;
      }
      const coordinates: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      setLocationMessage(`Ubicación activa · ${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`);
      await sendLocation(sessionToken, selectedRouteId, coordinates);
    } catch {
      setLocationMessage('Ubicación autorizada · Esperando señal GPS');
    }
  };

  const startLocationTracking = async (sessionToken: string, selectedRouteId: number) => {
    locationSubscription.current?.remove();
    locationSubscription.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 25 },
      (position) => {
        const coordinates: Coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setLocationMessage(`Ubicación activa · ${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`);
        void sendLocation(sessionToken, selectedRouteId, coordinates).catch(() => {
          setLocationMessage('Ubicación activa · pendiente de sincronizar');
        });
      }
    );
  };

  const beginRoute = async () => {
    if (!route || !token) return;
    setLoading(true);
    try {
      const coordinates = await currentCoordinates();
      await startRoute(token, route.id, coordinates);
      if (coordinates) await sendLocation(token, route.id, coordinates);
      await startLocationTracking(token, route.id);
      const updated = await assignedRoutes(token);
      setRoutes(updated);
      setRouteId(route.id);
      setScreen('route');
    } catch (error) {
      Alert.alert('No fue posible iniciar la ruta', message(error));
    } finally {
      setLoading(false);
    }
  };

  const acceptPublishedRoute = async (selectedRoute: MobileRoute) => {
    if (!token) return;
    setLoading(true);
    try {
      await acceptRoute(token, selectedRoute.id);
      await loadApp(token);
      setRouteId(selectedRoute.id);
      setScreen('route');
      Alert.alert('Ruta aceptada', 'La ruta quedó reservada para ti. Iníciala cuando estés listo.');
    } catch (error) {
      Alert.alert('No fue posible aceptar la ruta', message(error));
    } finally {
      setLoading(false);
    }
  };

  const selectScannedRoute = async (selectedRoute: MobileRoute) => {
    const alreadyAssigned = routes.some((item) => item.id === selectedRoute.id);
    if (!alreadyAssigned) return acceptPublishedRoute(selectedRoute);
    setRouteId(selectedRoute.id);
    setScreen('route');
  };

  const handleQrScanned = ({ data }: BarcodeScanningResult) => {
    const normalized = data.trim().toLowerCase();
    const routeIdMatch = normalized.match(/(?:route|ruta)[/:#=-]?(\d+)/i);
    const numericId = routeIdMatch ? Number(routeIdMatch[1]) : Number(normalized);
    const candidates = [...routes, ...publishedRoutes];
    const match = candidates.find((item) =>
      item.id === numericId || item.code.toLowerCase() === normalized || normalized.includes(item.code.toLowerCase())
    );

    if (match) setScannedRoute(match);
    else Alert.alert('Ruta no encontrada', 'El código QR no corresponde a una ruta disponible para este mensajero.');
  };

  const releaseAcceptedRoute = async () => {
    if (!route || !token) return;
    setLoading(true);
    try {
      await releaseRoute(token, route.id);
      await loadApp(token);
      setRouteId(null);
      setScreen('routes');
      Alert.alert('Ruta liberada', 'La ruta volvió a estar disponible para otros mensajeros.');
    } catch (error) {
      Alert.alert('No fue posible liberar la ruta', message(error));
    } finally {
      setLoading(false);
    }
  };

  const deliver = async () => {
    if (!route || !stop || !token) return;
    setLoading(true);
    try {
      const coordinates = await currentCoordinates();
      await confirmDelivery(token, route.id, stop.schedule_id, coordinates);
      const updated = await assignedRoutes(token);
      setRoutes(updated);
      const routeStillActive = updated.some((item) => item.id === route.id);
      if (!routeStillActive) locationSubscription.current?.remove();
      setScreen(routeStillActive ? 'route' : 'routes');
      Alert.alert(
        routeStillActive ? 'Entrega registrada' : 'Ruta finalizada',
        routeStillActive ? 'La confirmación quedó guardada en CBTA.' : 'Todas las paradas fueron entregadas y CBTA marcó la ruta como finalizada.'
      );
    } catch (error) {
      Alert.alert('No fue posible confirmar la entrega', message(error));
    } finally {
      setLoading(false);
    }
  };

  const Header = ({ title, back, subtitle = 'Prodifem · Mensajería' }: { title: string; back?: Screen; subtitle?: string }) => <View style={styles.header}>
    {back ? <Pressable style={styles.back} onPress={() => setScreen(back)}><Text style={styles.backText}>‹</Text></Pressable> : <View style={styles.brand}><Text style={styles.brandText}>P</Text></View>}
    <View><Text style={styles.headerTitle}>{title}</Text><Text style={styles.headerSubtitle}>{subtitle}</Text></View>
  </View>;

  if (screen === 'login') return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark" />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.loginKeyboard}>
      <ScrollView
        ref={loginScrollRef}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.loginScroll}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.loginForm}>
          <Text style={[styles.label, styles.firstLabel]}>Usuario demo</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: demoMenuOpen }} onPress={() => setDemoMenuOpen((open) => !open)} style={styles.select}>
            <Text style={styles.selectText}>{DEMO_USERS.find((user) => user.username === username)?.label ?? 'Selecciona un usuario demo'}</Text>
            <Text style={styles.selectIcon}>⌄</Text>
          </Pressable>
          {demoMenuOpen ? <View style={styles.demoMenu}>
            {DEMO_USERS.map((user) => <Pressable key={user.username} onPress={() => { setUsername(user.username); setPassword(user.password); setDemoMenuOpen(false); }} style={styles.demoOption}>
              <Text style={styles.demoOptionText}>{user.label}</Text>
              <Text style={styles.demoUsername}>{user.username}</Text>
            </Pressable>)}
          </View> : null}

          <Text style={styles.label}>Usuario</Text>
          <View style={styles.inputRow}>
            <TextInput autoCapitalize="none" autoComplete="username" onChangeText={setUsername} placeholder="Ingresa tu usuario" placeholderTextColor="#7F8792" returnKeyType="next" style={styles.input} value={username} />
            <Text style={styles.fieldIcon}>♙</Text>
          </View>

          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.inputRow}>
            <TextInput autoComplete="current-password" onChangeText={setPassword} onFocus={() => setTimeout(() => loginScrollRef.current?.scrollToEnd({ animated: true }), 250)} onSubmitEditing={() => void signIn()} placeholder="Ingresa tu contraseña" placeholderTextColor="#7F8792" returnKeyType="done" secureTextEntry={!showPassword} style={styles.input} value={password} />
            <Pressable accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} hitSlop={10} onPress={() => setShowPassword((visible) => !visible)} style={styles.fieldIconButton}>
              <Text style={styles.fieldIcon}>{showPassword ? '◉' : '◎'}</Text>
            </Pressable>
          </View>

          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: rememberSession }} onPress={() => setRememberSession((remember) => !remember)} style={styles.rememberRow}>
            <View style={[styles.checkbox, rememberSession && styles.checkboxChecked]}>{rememberSession ? <Text style={styles.checkmark}>✓</Text> : null}</View>
            <Text style={styles.rememberText}>Mantener sesión iniciada</Text>
          </Pressable>

          <Pressable disabled={loading} style={[styles.primary, styles.loginButton, loading && styles.disabled]} onPress={() => void signIn()}><Text style={styles.primaryText}>{loading ? 'Conectando…' : 'Iniciar sesión'}</Text></Pressable>
          <Pressable onPress={() => Alert.alert('Recuperar contraseña', 'Solicita al administrador de CBTA que restablezca tu contraseña.')} style={styles.forgotButton}>
            <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
          </Pressable>
          {authMessage ? <View style={styles.authMessage}><Text style={styles.authMessageText}>{authMessage}</Text></View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;

  if (screen === 'routes') {
    const activeRoute = routes.find((item) => item.status === 'in_route') ?? null;
    const acceptedRoutes = routes.filter((item) => item.status !== 'in_route');

    return <SafeAreaView style={styles.courierHomeSafe}>
      <StatusBar style="light" />
      <View style={styles.courierHeader}>
        <View style={styles.courierToolbar}>
          <Pressable accessibilityLabel="Abrir menú" style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>☰</Text></Pressable>
          <View style={styles.courierToolbarActions}>
            <Pressable accessibilityLabel="Notificaciones" onPress={() => void openNotifications()} style={styles.courierToolbarButton}><Feather name="bell" size={21} color="#FFFFFF" />{notifications.some((item) => !item.read_at) ? <View style={styles.notificationDot} /> : null}</Pressable>
            <Pressable accessibilityLabel="Perfil" onPress={() => setScreen('profile')} style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>♙</Text></Pressable>
          </View>
        </View>
        <Text style={styles.courierGreeting}>Buenos días,</Text>
        <Text style={styles.courierName}>{mobileUser?.name || 'Juan Aviles'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.courierHomeContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => token && loadApp(token)} />}>
        <View style={styles.activeRouteCard}>
          <View style={styles.packageIconCircle}><Text style={styles.packageIcon}>◇</Text></View>
          <Text style={styles.activeRouteTitle}>{activeRoute ? 'Tu ruta está en curso' : acceptedRoutes.length === 1 ? 'Tienes una ruta tomada' : acceptedRoutes.length > 1 ? `Tienes ${acceptedRoutes.length} rutas tomadas` : 'No tienes rutas tomadas'}</Text>
          <Text style={styles.activeRouteSubtitle}>{activeRoute ? `${activeRoute.code} · ${activeRoute.name}` : acceptedRoutes.length ? 'Abre una de tus rutas para revisar las entregas e iniciar el recorrido.' : 'Selecciona o escanea una ruta para comenzar.'}</Text>

          {activeRoute ? <Pressable style={styles.homePrimaryButton} onPress={() => { setRouteId(activeRoute.id); setScreen('route'); }}>
            <Text style={styles.homePrimaryButtonText}>Continuar ruta</Text>
          </Pressable> : <>
            <Pressable style={styles.homePrimaryButton} onPress={() => { setScannerTab('scan'); setScannedRoute(null); setScreen('scanner'); }}>
              <Text style={styles.homeButtonIcon}>⌗</Text><Text style={styles.homePrimaryButtonText}>Escanear QR de ruta</Text>
            </Pressable>
            <Pressable style={styles.homeOutlineButton} onPress={openSelectableRoutes}>
              <Text style={styles.homeOutlineIcon}>☷</Text><Text style={styles.homeOutlineButtonText}>Seleccionar ruta</Text>
            </Pressable>
            <Pressable style={styles.homeOutlineButton} onPress={openRouteCatalog}>
              <Text style={styles.homeOutlineIcon}>♧</Text><Text style={styles.homeOutlineButtonText}>Ver catálogo de rutas</Text>
            </Pressable>
          </>}
        </View>
        {acceptedRoutes.length ? <View style={styles.takenRoutesSection}>
          <Text style={styles.takenRoutesTitle}>Mis rutas tomadas</Text>
          <Text style={styles.takenRoutesSubtitle}>Selecciona una ruta para revisar sus entregas e iniciar el recorrido.</Text>
          {acceptedRoutes.map((item) => <Pressable key={item.id} onPress={() => { setRouteId(item.id); setScreen('route'); }} style={styles.takenRouteCard}>
            <View style={styles.takenRouteTop}><View style={styles.takenRouteCopy}><Text style={styles.takenRouteCode}>{item.code}</Text><Text style={styles.takenRouteName}>{item.name}</Text></View><View style={styles.takenRouteBadge}><Text style={styles.takenRouteBadgeText}>Tomada</Text></View></View>
            <View style={styles.takenRouteMeta}><Text style={styles.takenRouteMetaText}><Feather name="map-pin" size={14} color="#607068" />  {item.stops_count} hospitales</Text><Text style={styles.takenRouteMetaText}><Feather name="clock" size={14} color="#607068" />  Salida: {item.schedule_start || '—'}</Text></View>
            <View style={styles.takenRouteButton}><Text style={styles.takenRouteButtonText}>Ver e iniciar ruta</Text><Feather name="chevron-right" size={18} color="#FFFFFF" /></View>
          </Pressable>)}
        </View> : null}
      </ScrollView>

      <View style={styles.courierBottomNav}>
        <Pressable style={styles.courierNavItem}><Text style={[styles.courierNavIcon, styles.courierNavActive]}>⌂</Text><Text style={[styles.courierNavLabel, styles.courierNavActive]}>Inicio</Text></Pressable>
        <Pressable style={styles.courierNavItem} onPress={openSelectableRoutes}><Text style={styles.courierNavIcon}>⌘</Text><Text style={styles.courierNavLabel}>Rutas</Text></Pressable>
        <Pressable style={styles.courierNavItem} onPress={() => setScreen('history')}><Text style={styles.courierNavIcon}>◴</Text><Text style={styles.courierNavLabel}>Historial</Text></Pressable>
      </View>
      <NotificationsModal visible={notificationsOpen} tab={notificationTab} notifications={notifications} onTab={setNotificationTab} onClose={() => setNotificationsOpen(false)} onReadAll={() => void readAllNotifications()} />
    </SafeAreaView>;
  }

  if (screen === 'catalog') {
    const catalogRoutes = [...publishedRoutes, ...routes.filter((assigned) => !publishedRoutes.some((published) => published.id === assigned.id))]
      .filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(routeSearch.trim().toLowerCase()));

    return <SafeAreaView style={styles.catalogSafe}>
      <StatusBar style="light" />
      <View style={styles.scannerHeader}>
        <View style={styles.courierToolbar}>
          <Pressable accessibilityLabel="Abrir menú" style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>☰</Text></Pressable>
          <View style={styles.courierToolbarActions}>
            <Pressable accessibilityLabel="Notificaciones" style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>♟</Text><View style={styles.notificationDot} /></Pressable>
            <Pressable accessibilityLabel="Perfil" onPress={() => setScreen('profile')} style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>♙</Text></Pressable>
          </View>
        </View>
        <View style={styles.scannerTitleRow}>
          <Pressable accessibilityLabel="Volver" onPress={() => setScreen('routes')} style={styles.scannerBack}><Text style={styles.scannerBackText}>‹</Text></Pressable>
          <Text style={styles.scannerTitle}>Rutas programadas de hoy</Text><View style={styles.scannerBack} />
        </View>
      </View>

      <View style={styles.catalogSearchRow}>
        <TextInput autoCapitalize="none" onChangeText={setRouteSearch} placeholder="Buscar ruta programada..." placeholderTextColor="#8A918D" style={styles.catalogSearchInput} value={routeSearch} />
        <Text style={styles.catalogSearchIcon}>⌕</Text>
      </View>

      <ScrollView contentContainerStyle={styles.catalogContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refreshSelectableRoutes()} />}>
        {catalogRoutes.map((item) => {
          const available = item.status === 'available';
          const assignedToCurrentUser = routes.some((routeItem) => routeItem.id === item.id);
          return <View key={item.id} style={[styles.catalogRouteCard, !available && styles.catalogRouteTaken]}>
            <View style={styles.scannedRouteHeading}>
              <View style={styles.catalogRouteHeadingCopy}><Text style={[styles.scannedRouteCode, !available && styles.catalogMuted]}>{item.code}</Text><Text style={[styles.scannedRouteName, !available && styles.catalogMuted]}>{item.name}</Text></View>
              <Text style={available ? styles.availableBadge : styles.takenBadge}>{available ? 'Disponible' : 'Tomada'}</Text>
            </View>
            <View style={styles.scannedRouteMeta}>
              <Text style={[styles.routeMetaItem, !available && styles.catalogMuted]}>⌖  {item.stops_count} hospitales</Text><Text style={[styles.routeMetaItem, !available && styles.catalogMuted]}>▣  {item.stops_count} entregas</Text>
              <Text style={[styles.routeMetaItem, !available && styles.catalogMuted]}>◷  Salida: {item.schedule_start || '—'}</Text><Text style={[styles.routeMetaItem, !available && styles.catalogMuted]}>◇  Ruta programada</Text>
            </View>
            {!available && assignedToCurrentUser ? <Text style={styles.routeTakenBy}>♙  Tomada por {mobileUser?.name || 'este mensajero'}</Text> : null}
            <Pressable disabled={!available || loading} onPress={() => void acceptPublishedRoute(item)} style={[styles.catalogSelectButton, !available && styles.catalogSelectDisabled]}><Text style={[styles.catalogSelectText, !available && styles.catalogSelectTextDisabled]}>{available ? (loading ? 'Seleccionando…' : 'Seleccionar') : 'Tomada'}</Text></Pressable>
          </View>;
        })}
        {!catalogRoutes.length ? <View style={styles.catalogEmpty}><Text style={styles.catalogEmptyTitle}>{routeSearch ? 'No encontramos esa ruta' : 'No hay rutas programadas'}</Text><Text style={styles.catalogEmptyText}>{routeSearch ? 'Prueba con otro código o nombre.' : 'Actualiza la pantalla cuando CBTA publique rutas para hoy.'}</Text></View> : null}
      </ScrollView>

      <View style={styles.courierBottomNav}>
        <Pressable style={styles.courierNavItem} onPress={() => setScreen('routes')}><Text style={styles.courierNavIcon}>⌂</Text><Text style={styles.courierNavLabel}>Inicio</Text></Pressable>
        <Pressable style={styles.courierNavItem}><Text style={[styles.courierNavIcon, styles.courierNavActive]}>⌘</Text><Text style={[styles.courierNavLabel, styles.courierNavActive]}>Rutas</Text></Pressable>
        <Pressable style={styles.courierNavItem} onPress={() => setScreen('history')}><Text style={styles.courierNavIcon}>◴</Text><Text style={styles.courierNavLabel}>Historial</Text></Pressable>
      </View>
    </SafeAreaView>;
  }

  if (screen === 'routeCatalog') {
    const filteredCatalog = catalogRoutes.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(routeSearch.trim().toLowerCase()));

    return <SafeAreaView style={styles.catalogSafe}>
      <StatusBar style="light" />
      <View style={styles.scannerHeader}>
        <View style={styles.courierToolbar}>
          <Pressable accessibilityLabel="Abrir menú" style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>☰</Text></Pressable>
          <View style={styles.courierToolbarActions}>
            <Pressable accessibilityLabel="Notificaciones" style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>♟</Text><View style={styles.notificationDot} /></Pressable>
            <Pressable accessibilityLabel="Perfil" onPress={() => setScreen('profile')} style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>♙</Text></Pressable>
          </View>
        </View>
        <View style={styles.scannerTitleRow}>
          <Pressable accessibilityLabel="Volver" onPress={() => setScreen('routes')} style={styles.scannerBack}><Text style={styles.scannerBackText}>‹</Text></Pressable>
          <Text style={styles.scannerTitle}>Catálogo de rutas</Text><View style={styles.scannerBack} />
        </View>
      </View>

      <View style={styles.catalogSearchRow}><TextInput autoCapitalize="none" onChangeText={setRouteSearch} placeholder="Buscar ruta..." placeholderTextColor="#8A918D" style={styles.catalogSearchInput} value={routeSearch} /><Text style={styles.catalogSearchIcon}>⌕</Text></View>

      <ScrollView contentContainerStyle={styles.catalogContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refreshRouteCatalog()} />}>
        {filteredCatalog.map((item) => {
          const active = item.status === 'active';
          const expanded = expandedCatalogRouteId === item.id;
          return <Pressable key={item.id} onPress={() => setExpandedCatalogRouteId(expanded ? null : item.id)} style={styles.routeCatalogCard}>
            <View style={styles.scannedRouteHeading}>
              <View style={styles.catalogRouteHeadingCopy}><Text style={styles.scannedRouteCode}>{item.code}</Text><Text style={styles.scannedRouteName}>{item.name}</Text></View>
              <Text style={active ? styles.availableBadge : styles.inactiveBadge}>{active ? 'Activa' : 'Inactiva'}</Text><Text style={styles.catalogChevron}>{expanded ? '⌃' : '⌄'}</Text>
            </View>
            <View style={styles.scannedRouteMeta}><Text style={styles.routeMetaItem}>⌖  {item.hospitals_count} hospitales</Text><Text style={styles.routeMetaItem}>▣  {item.deliveries_count} entregas</Text><Text style={styles.routeMetaItem}>◷  Salida: {item.schedule_start || '—'}</Text><Text style={styles.routeMetaItem}>◇  {item.schedule_end ? `Hasta ${item.schedule_end}` : 'Horario abierto'}</Text></View>
            {expanded ? <View style={styles.catalogExpanded}><Text style={styles.catalogExpandedText}>Estado: {active ? 'Ruta activa' : 'Ruta inactiva'}</Text><Text style={styles.catalogExpandedText}>Asignación: {item.is_taken ? 'Actualmente tomada' : 'Sin mensajero asignado'}</Text></View> : null}
          </Pressable>;
        })}
        {!filteredCatalog.length ? <View style={styles.catalogEmpty}><Text style={styles.catalogEmptyTitle}>{routeSearch ? 'No encontramos esa ruta' : 'El catálogo está vacío'}</Text><Text style={styles.catalogEmptyText}>{routeSearch ? 'Prueba con otro código o nombre.' : 'Las rutas configuradas en CBTA aparecerán aquí.'}</Text></View> : null}
      </ScrollView>

      <View style={styles.courierBottomNav}>
        <Pressable style={styles.courierNavItem} onPress={() => setScreen('routes')}><Text style={styles.courierNavIcon}>⌂</Text><Text style={styles.courierNavLabel}>Inicio</Text></Pressable>
        <Pressable style={styles.courierNavItem}><Text style={[styles.courierNavIcon, styles.courierNavActive]}>⌘</Text><Text style={[styles.courierNavLabel, styles.courierNavActive]}>Rutas</Text></Pressable>
        <Pressable style={styles.courierNavItem} onPress={() => setScreen('history')}><Text style={styles.courierNavIcon}>◴</Text><Text style={styles.courierNavLabel}>Historial</Text></Pressable>
      </View>
    </SafeAreaView>;
  }

  if (screen === 'scanner') {
    const manualRoutes = [...routes.filter((item) => item.status !== 'in_route'), ...publishedRoutes.filter((published) => !routes.some((assigned) => assigned.id === published.id))];
    const candidateRoute = scannedRoute ?? manualRoutes[0] ?? null;

    return <SafeAreaView style={styles.scannerSafe}>
      <StatusBar style="light" />
      <View style={styles.scannerHeader}>
        <View style={styles.courierToolbar}>
          <Pressable accessibilityLabel="Abrir menú" style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>☰</Text></Pressable>
          <View style={styles.courierToolbarActions}>
            <Pressable accessibilityLabel="Notificaciones" style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>♟</Text><View style={styles.notificationDot} /></Pressable>
            <Pressable accessibilityLabel="Perfil" onPress={() => setScreen('profile')} style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>♙</Text></Pressable>
          </View>
        </View>
        <View style={styles.scannerTitleRow}>
          <Pressable accessibilityLabel="Volver" onPress={() => setScreen('routes')} style={styles.scannerBack}><Text style={styles.scannerBackText}>‹</Text></Pressable>
          <Text style={styles.scannerTitle}>Escanear QR de ruta</Text><View style={styles.scannerBack} />
        </View>
      </View>

      <View style={styles.scannerTabs}>
        <Pressable onPress={() => setScannerTab('scan')} style={[styles.scannerTab, scannerTab === 'scan' && styles.scannerTabActive]}><Text style={[styles.scannerTabText, scannerTab === 'scan' && styles.scannerTabTextActive]}>Escanear QR</Text></Pressable>
        <Pressable onPress={() => setScannerTab('manual')} style={[styles.scannerTab, scannerTab === 'manual' && styles.scannerTabActive]}><Text style={[styles.scannerTabText, scannerTab === 'manual' && styles.scannerTabTextActive]}>Seleccionar manualmente</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scannerContent}>
        {scannerTab === 'scan' ? <View style={styles.scannerPanel}>
          <Text style={styles.scannerInstruction}>Escanea el código QR de la ruta</Text>
          <View style={styles.cameraFrame}>
            {cameraPermission?.granted ? <CameraView active={screen === 'scanner' && scannerTab === 'scan' && !scannedRoute} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} facing="back" onBarcodeScanned={scannedRoute ? undefined : handleQrScanned} style={styles.cameraPreview} /> : <Pressable onPress={() => void requestCameraPermission()} style={styles.cameraPermission}>
              <Text style={styles.qrPlaceholder}>▦</Text><Text style={styles.cameraPermissionText}>{cameraPermission ? 'Permitir acceso a la cámara' : 'Preparando cámara…'}</Text>
            </Pressable>}
            <View pointerEvents="none" style={styles.scanCornerTopLeft} /><View pointerEvents="none" style={styles.scanCornerTopRight} />
            <View pointerEvents="none" style={styles.scanCornerBottomLeft} /><View pointerEvents="none" style={styles.scanCornerBottomRight} />
          </View>
          {scannedRoute ? <Pressable onPress={() => setScannedRoute(null)}><Text style={styles.scanAgain}>Escanear otro código</Text></Pressable> : null}
        </View> : <View style={styles.manualPanel}>
          <Text style={styles.scannerInstruction}>Selecciona una ruta disponible</Text>
          {manualRoutes.length ? manualRoutes.map((item) => <Pressable key={item.id} onPress={() => setScannedRoute(item)} style={[styles.manualRoute, scannedRoute?.id === item.id && styles.manualRouteSelected]}><Text style={styles.manualRouteCode}>{item.code}</Text><Text style={styles.manualRouteName}>{item.name}</Text></Pressable>) : <Text style={styles.noRoutesText}>No hay rutas disponibles por el momento.</Text>}
        </View>}

        {candidateRoute ? <View style={styles.scannedRouteCard}>
          <View style={styles.scannedRouteHeading}><View><Text style={styles.scannedRouteCode}>{candidateRoute.code}</Text><Text style={styles.scannedRouteName}>{candidateRoute.name}</Text></View><Text style={styles.availableBadge}>Disponible</Text></View>
          <View style={styles.scannedRouteMeta}><Text style={styles.routeMetaItem}>⌖  {candidateRoute.stops_count} hospitales</Text><Text style={styles.routeMetaItem}>▣  {candidateRoute.stops_count} entregas</Text><Text style={styles.routeMetaItem}>◷  Salida: {candidateRoute.schedule_start || '—'}</Text><Text style={styles.routeMetaItem}>◇  Ruta programada</Text></View>
          <Pressable disabled={loading} onPress={() => void selectScannedRoute(candidateRoute)} style={[styles.selectRouteButton, loading && styles.disabled]}><Text style={styles.selectRouteButtonText}>{loading ? 'Seleccionando…' : 'Seleccionar esta ruta'}</Text></Pressable>
        </View> : null}
      </ScrollView>

      <View style={styles.courierBottomNav}>
        <Pressable style={styles.courierNavItem} onPress={() => setScreen('routes')}><Text style={styles.courierNavIcon}>⌂</Text><Text style={styles.courierNavLabel}>Inicio</Text></Pressable>
        <Pressable style={styles.courierNavItem}><Text style={[styles.courierNavIcon, styles.courierNavActive]}>⌘</Text><Text style={[styles.courierNavLabel, styles.courierNavActive]}>Rutas</Text></Pressable>
        <Pressable style={styles.courierNavItem} onPress={() => setScreen('history')}><Text style={styles.courierNavIcon}>◴</Text><Text style={styles.courierNavLabel}>Historial</Text></Pressable>
      </View>
    </SafeAreaView>;
  }

  if (screen === 'history') {
    const summaryRoute = historyRoutes[0] ?? routes[0] ?? null;
    const completed = summaryRoute?.completed_stops_count ?? 0;
    const total = summaryRoute?.stops_count ?? 0;
    const pendingStops = summaryRoute?.stops.filter((item) => item.status !== 'delivered') ?? [];
    const hospitalPercent = total ? Math.round(completed / total * 100) : 0;

    return <SafeAreaView style={styles.historySafe}>
      <StatusBar style="light" />
      <View style={styles.scannerHeader}>
        <View style={styles.courierToolbar}>
          <Pressable accessibilityLabel="Abrir menú" style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>☰</Text></Pressable>
          <View style={styles.courierToolbarActions}><Pressable accessibilityLabel="Notificaciones" style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>♟</Text><View style={styles.notificationDot} /></Pressable><Pressable accessibilityLabel="Perfil" onPress={() => setScreen('profile')} style={styles.courierToolbarButton}><Text style={styles.courierToolbarIcon}>♙</Text></Pressable></View>
        </View>
        <View style={styles.scannerTitleRow}><Pressable accessibilityLabel="Volver" onPress={() => setScreen('routes')} style={styles.scannerBack}><Text style={styles.scannerBackText}>‹</Text></Pressable><Text style={styles.scannerTitle}>Resumen de ruta</Text><View style={styles.scannerBack} /></View>
      </View>

      <ScrollView contentContainerStyle={styles.historyContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => token && loadApp(token)} />}>
        {summaryRoute ? <>
          <View style={styles.historyCard}>
            <Text style={styles.historyRouteCode}>{summaryRoute.code}</Text><Text style={styles.historyRouteName}>{summaryRoute.name}</Text>
            <View style={styles.historyProgressHeading}><Text style={styles.historyProgressValue}>{completed} / {total}</Text><Text style={styles.historyProgressLabel}>Hospitales visitados</Text></View>
            <View style={styles.historyTrack}><View style={[styles.historyFill, { width: `${hospitalPercent}%` }]} /></View>
            <View style={styles.historyProgressHeading}><Text style={styles.historyProgressValue}>{completed} / {total}</Text><Text style={styles.historyProgressLabel}>Entregas completadas</Text></View>
            <View style={styles.historyTrack}><View style={[styles.historyFill, { width: `${hospitalPercent}%` }]} /></View>
            <View style={styles.deliveryStats}><View style={styles.deliveryStat}><Text style={styles.deliveryStatComplete}>{completed}</Text><Text style={styles.deliveryStatLabel}>Entregas{`\n`}completas</Text></View><View style={styles.deliveryStat}><Text style={styles.deliveryStatPartial}>0</Text><Text style={styles.deliveryStatLabel}>Entregas{`\n`}parciales</Text></View><View style={styles.deliveryStat}><Text style={styles.deliveryStatMissing}>{pendingStops.length}</Text><Text style={styles.deliveryStatLabel}>No entregadas</Text></View></View>
          </View>

          <View style={styles.historyCard}><Text style={styles.historySectionTitle}>Hospitales</Text>{summaryRoute.stops.slice(0, 4).map((item) => <View key={item.schedule_id} style={styles.hospitalHistoryRow}><Text style={styles.hospitalHistoryCheck}>{item.status === 'delivered' ? '✓' : '○'}</Text><Text style={styles.hospitalHistoryName}>{item.hospital}</Text><Text style={item.status === 'delivered' ? styles.hospitalCompleted : styles.hospitalPending}>{item.status === 'delivered' ? 'Completado' : 'Pendiente'}</Text></View>)}{summaryRoute.stops.length > 4 ? <Text style={styles.moreHospitals}>y {summaryRoute.stops.length - 4} más...</Text> : null}</View>

          {pendingStops.length ? <View style={styles.historyCard}><Text style={styles.historySectionTitle}>Pendientes</Text>{pendingStops.slice(0, 2).map((item) => <View key={item.schedule_id} style={styles.pendingDelivery}><Text style={styles.pendingDeliveryTitle}>Entrega #{item.schedule_id}</Text><Text style={styles.pendingDeliveryText}>{item.hospital} · Entrega pendiente</Text></View>)}<View style={styles.pendingWarning}><Text style={styles.pendingWarningText}>Esta ruta contiene entregas pendientes o parciales.</Text></View><Pressable onPress={() => { setRouteId(summaryRoute.id); setScreen('route'); }} style={styles.reviewPendingButton}><Text style={styles.reviewPendingText}>Revisar pendientes</Text></Pressable><Pressable onPress={() => Alert.alert('Finalizar con incidencias', 'La finalización con incidencias requerirá confirmación y motivo en el siguiente paso.')} style={styles.finishIncidentButton}><Text style={styles.finishIncidentText}>Finalizar ruta con incidencias</Text></Pressable></View> : null}
        </> : <View style={styles.catalogEmpty}><Text style={styles.catalogEmptyTitle}>Aún no hay historial</Text><Text style={styles.catalogEmptyText}>Cuando tengas una ruta asignada, su resumen aparecerá aquí.</Text></View>}
      </ScrollView>

      <View style={styles.courierBottomNav}><Pressable style={styles.courierNavItem} onPress={() => setScreen('routes')}><Text style={styles.courierNavIcon}>⌂</Text><Text style={styles.courierNavLabel}>Inicio</Text></Pressable><Pressable style={styles.courierNavItem} onPress={() => setScreen('catalog')}><Text style={styles.courierNavIcon}>⌘</Text><Text style={styles.courierNavLabel}>Rutas</Text></Pressable><Pressable style={styles.courierNavItem}><Text style={[styles.courierNavIcon, styles.courierNavActive]}>◴</Text><Text style={[styles.courierNavLabel, styles.courierNavActive]}>Historial</Text></Pressable></View>
    </SafeAreaView>;
  }

  if (screen === 'hospital') {
    const hospitalName = hospitalData?.hospital.name ?? mobileUser?.hospital?.name ?? 'Hospital';
    const pending = hospitalData?.requests.pending_total ?? 0;
    return <SafeAreaView style={styles.safe}><StatusBar style="light" /><Header title="Inicio" subtitle="Prodifem · Hospital" /><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => token && loadApp(token)} />}>
      <View style={styles.hospitalHeading}><Text style={styles.hospitalName}>{hospitalName}</Text><Text style={styles.greeting}>Portal hospitalario</Text></View>
      <Text style={styles.hospitalGreeting}>Hola, {mobileUser?.name || 'Coordinación'}</Text><Text style={styles.hospitalQuestion}>¿Qué deseas consultar hoy?</Text>
      <View style={styles.hospitalAction}><View style={styles.actionIcon}><Text style={styles.actionIconText}>+</Text></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Nueva solicitud</Text><Text style={styles.actionText}>La captura clínica se habilitará en el siguiente avance del módulo.</Text></View></View>
      <View style={styles.hospitalAction}><View style={styles.actionIcon}><Text style={styles.actionIconText}>▤</Text></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Solicitudes pendientes</Text><Text style={styles.actionText}>Oncología y antibióticos: {hospitalData?.requests.oncology_pending ?? 0}</Text><Text style={styles.actionText}>Nutrición: {hospitalData?.requests.nutrition_pending ?? 0}</Text></View><View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{pending}</Text></View></View>
      <View style={styles.hospitalAction}><View style={styles.actionIcon}><Text style={styles.actionIconText}>□</Text></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Seguimiento a pedidos</Text><Text style={styles.actionText}>Se conectará al seguimiento de distribución en el próximo avance.</Text></View></View>
    </ScrollView><BottomNav active="hospital" home="hospital" onNavigate={setScreen} /></SafeAreaView>;
  }

  if (screen === 'profile') {
    const completedRoutes = historyRoutes.filter((item) => item.status === 'completed').length;
    const completedDeliveries = historyRoutes.reduce((sum, item) => sum + item.completed_stops_count, 0);
    const totalDeliveries = historyRoutes.reduce((sum, item) => sum + item.stops_count, 0);
    const completionRate = totalDeliveries ? Math.round(completedDeliveries / totalDeliveries * 100) : 0;
    const profile = mobileUser?.profile;

    return <SafeAreaView style={styles.profileSafe}>
      <StatusBar style="light" />
      <View style={styles.profileHeader}>
        <View style={styles.courierToolbar}><Pressable accessibilityLabel="Abrir menú" style={styles.courierToolbarButton}><Feather name="menu" size={22} color="#FFFFFF" /></Pressable><View style={styles.courierToolbarActions}><Pressable accessibilityLabel="Notificaciones" style={styles.courierToolbarButton}><Feather name="bell" size={21} color="#FFFFFF" /><View style={styles.notificationDot} /></Pressable><Pressable accessibilityLabel="Perfil" style={styles.courierToolbarButton}><Feather name="user" size={22} color="#FFFFFF" /></Pressable></View></View>
        <Text style={styles.profilePageTitle}>Mi perfil</Text>
      </View>
      <ScrollView contentContainerStyle={styles.profileContent}>
        <View style={styles.profileMainCard}>
          <View style={styles.profileIdentity}><View style={styles.profileAvatar}><Feather name="user" size={55} color="#217E47" /><View style={styles.profileCameraBadge}><Feather name="camera" size={14} color="#FFFFFF" /></View></View><View style={styles.profileIdentityCopy}><Text style={styles.profileFullName}>{mobileUser?.name || 'Usuario Prodifem'}</Text><Text style={styles.profilePosition}>{profile?.position || 'Mensajero'}</Text><Text style={styles.profileContact}>{profile?.email || 'Correo no registrado'}</Text><Text style={styles.profileContact}>{profile?.phone || 'Teléfono no registrado'}</Text></View></View>
          <View style={styles.profileDivider} />
          <View style={styles.profileInfoGrid}><View style={styles.profileInfoItem}><View style={styles.profileInfoIcon}><Feather name="home" size={21} color="#008C3A" /></View><Text style={styles.profileInfoLabel}>Central asignada</Text><Text style={styles.profileInfoValue}>{profile?.department || 'Sin asignar'}</Text></View><View style={styles.profileInfoDivider} /><View style={styles.profileInfoItem}><View style={styles.profileInfoIcon}><Feather name="calendar" size={21} color="#008C3A" /></View><Text style={styles.profileInfoLabel}>Fecha de ingreso</Text><Text style={styles.profileInfoValue}>{profile?.hire_date ? new Date(`${profile.hire_date}T00:00:00`).toLocaleDateString('es-MX') : 'No registrada'}</Text></View></View>
        </View>

        <Text style={styles.profileSectionLabel}>ACCIONES RÁPIDAS</Text><View style={styles.quickActions}><ProfileQuickAction icon="headphones" label={'Contacto de\nsoporte'} onPress={() => Alert.alert('Contacto de soporte', 'Solicita ayuda al administrador de CBTA.')} /><ProfileQuickAction icon="book-open" label="Manual de uso" onPress={() => Alert.alert('Manual de uso', 'El manual estará disponible próximamente.')} /><ProfileQuickAction icon="video" label="Tutoriales" onPress={() => Alert.alert('Tutoriales', 'Los tutoriales estarán disponibles próximamente.')} /><ProfileQuickAction icon="message-square" label={'Enviar\nsugerencia'} onPress={() => Alert.alert('Enviar sugerencia', 'El canal de sugerencias estará disponible próximamente.')} /></View>

        <Text style={styles.profileSectionLabel}>MI CUENTA</Text><View style={styles.accountCard}><Pressable onPress={() => Alert.alert('Información personal', `${mobileUser?.name || ''}\n${profile?.email || 'Correo no registrado'}\n${profile?.phone || 'Teléfono no registrado'}`)} style={styles.accountRow}><View style={styles.accountIcon}><Feather name="user" size={21} color="#008C3A" /></View><Text style={styles.accountLabel}>Información personal</Text><Feather name="chevron-right" size={22} color="#18231C" /></Pressable><View style={styles.accountDivider} /><Pressable onPress={() => Alert.alert('Acerca de la app', 'Prodifem Rutas · versión 1.0.1')} style={styles.accountRow}><View style={styles.accountIcon}><Feather name="info" size={21} color="#008C3A" /></View><Text style={styles.accountLabel}>Acerca de la app</Text><Feather name="chevron-right" size={22} color="#18231C" /></Pressable></View>

        <Text style={styles.profileSectionLabel}>MIS ESTADÍSTICAS</Text><View style={styles.profileStats}><ProfileStat icon="calendar" value={`${completedRoutes}`} label={'Rutas\ncompletadas'} /><ProfileStat icon="package" value={`${completedDeliveries}`} label={'Entregas\nrealizadas'} /><ProfileStat icon="check" value={`${completionRate}%`} label={'Entregas\ncompletas'} /><ProfileStat icon="clock" value="—" label={'Tiempo en\nruta'} /></View>
        <Pressable style={styles.profileLogout} onPress={() => void signOut()}><Feather name="log-out" size={20} color="#F0353F" /><Text style={styles.profileLogoutText}>Cerrar sesión</Text></Pressable>
      </ScrollView>
      <View style={styles.courierBottomNav}><Pressable style={styles.courierNavItem} onPress={() => setScreen('routes')}><Feather name="home" size={20} color="#718079" /><Text style={styles.courierNavLabel}>Inicio</Text></Pressable><Pressable style={styles.courierNavItem} onPress={() => setScreen('catalog')}><Feather name="grid" size={20} color="#718079" /><Text style={styles.courierNavLabel}>Rutas</Text></Pressable><Pressable style={styles.courierNavItem} onPress={() => setScreen('history')}><Feather name="clock" size={20} color="#718079" /><Text style={styles.courierNavLabel}>Historial</Text></Pressable></View>
    </SafeAreaView>;
  }

  if (screen === 'delivery' && route && stop) return <SafeAreaView style={styles.safe}><StatusBar style="light" /><Header title="Confirmar entrega" back="route" /><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.deliveryHero}><Text style={styles.deliveryId}>PROGRAMACIÓN #{stop.schedule_id}</Text><Text style={styles.deliveryHospital}>{stop.hospital}</Text><Text style={styles.deliveryAddress}>{stop.address || 'Dirección no registrada'}</Text></View>
    <View style={styles.card}><Detail label="Ruta" value={`${route.code} · ${route.name}`} /><Detail label="Estado" value="Pendiente de confirmar" /><Detail label="Evidencia" value="Hora y ubicación GPS" /></View>
    <View style={styles.warning}><Text style={styles.warningTitle}>Confirmación manual</Text><Text style={styles.warningText}>Se registrará hora y ubicación. Foto y firma se agregarán en el siguiente módulo.</Text></View>
    <Pressable disabled={loading} style={[styles.primary, loading && styles.disabled]} onPress={deliver}><Text style={styles.primaryText}>{loading ? 'Guardando…' : 'Confirmar entrega'}</Text></Pressable>
  </ScrollView></SafeAreaView>;

  if (!route) return <SafeAreaView style={styles.safe}><StatusBar style="light" /><Header title="Mis rutas" /><View style={styles.empty}><Text style={styles.emptyTitle}>La ruta ya no está disponible</Text><Pressable style={styles.primary} onPress={() => setScreen('routes')}><Text style={styles.primaryText}>Volver a mis rutas</Text></Pressable></View></SafeAreaView>;
  const done = route.completed_stops_count;
  const percent = route.stops_count ? Math.round(done / route.stops_count * 100) : 0;
  const active = route.status === 'in_route';
  return <SafeAreaView style={styles.safe}><StatusBar style="light" /><Header title={route.code} back="routes" /><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.card}><Text style={styles.eyebrow}>PROGRESO DE RUTA</Text><Text style={styles.routeName}>{done} de {route.stops_count} hospitales completados</Text><Text style={styles.percent}>{percent}%</Text><View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]} /></View></View>
    {!active ? <View style={styles.card}><Text style={styles.routeName}>Todo listo para iniciar</Text><Text style={styles.detail}>Confirma el inicio para registrar el seguimiento de tu ruta.</Text><Pressable disabled={loading} style={[styles.primary, loading && styles.disabled]} onPress={beginRoute}><Text style={styles.primaryText}>{loading ? 'Iniciando…' : 'Iniciar ruta'}</Text></Pressable></View> : <View style={styles.tracking}><View style={styles.trackingCopy}><View style={styles.dot} /><Text style={styles.trackingText}>{locationMessage}</Text></View><Pressable disabled={loading} onPress={() => token && syncCurrentLocation(token, route.id)} style={styles.locationRefresh}><Text style={styles.locationRefreshText}>Actualizar ubicación</Text></Pressable></View>}
    {!active ? <Pressable disabled={loading} style={styles.releaseButton} onPress={() => void releaseAcceptedRoute()}><Text style={styles.releaseButtonText}>Liberar ruta</Text></Pressable> : null}
    <Text style={styles.sectionTitle}>Hospitales de la ruta</Text>
    {route.stops.map((item, index) => <Pressable key={item.schedule_id} disabled={!active || item.status === 'delivered'} onPress={() => { setStopId(item.schedule_id); setScreen('delivery'); }} style={[styles.stop, (!active || item.status === 'delivered') && styles.stopDisabled]}>
      <View style={[styles.number, item.status === 'delivered' && styles.numberDone]}><Text style={styles.numberText}>{item.status === 'delivered' ? '✓' : index + 1}</Text></View><View style={styles.stopCopy}><Text style={styles.stopHospital}>{item.hospital}</Text><Text style={styles.stopAddress}>{item.address || 'Dirección no registrada'}</Text><Text style={styles.stopMeta}>Programación #{item.schedule_id}</Text></View><Text style={[styles.stopStatus, item.status === 'delivered' && styles.done]}>{item.status === 'delivered' ? 'Entregada' : 'Pendiente'}</Text>
    </Pressable>)}
  </ScrollView><BottomNav active="routes" home="routes" onNavigate={setScreen} /></SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><MobileApp /></SafeAreaProvider>;
}

function message(error: unknown) { return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'; }
function Stat({ value, label }: { value: string; label: string }) { return <View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }
function notificationAppearance(kind: MobileNotification['kind']): { icon: keyof typeof Feather.glyphMap; color: string; background: string } {
  if (kind === 'route_assigned') return { icon: 'map', color: '#009447', background: '#E8F7EF' };
  if (kind === 'reminder') return { icon: 'bell', color: '#1682E5', background: '#EAF3FE' };
  if (kind === 'delivery_completed') return { icon: 'check', color: '#009447', background: '#E8F7EF' };
  return { icon: 'info', color: '#8048E8', background: '#F2EAFE' };
}
function NotificationsModal({ visible, tab, notifications, onTab, onClose, onReadAll }: { visible: boolean; tab: 'all' | 'unread'; notifications: MobileNotification[]; onTab: (tab: 'all' | 'unread') => void; onClose: () => void; onReadAll: () => void }) {
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const items = tab === 'unread' ? notifications.filter((item) => !item.read_at) : notifications;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.notificationsOverlay}><Pressable style={styles.notificationsBackdrop} onPress={onClose} />
      <SafeAreaView style={styles.notificationsSheet} edges={['bottom']}>
        <View style={styles.notificationsHandle} />
        <View style={styles.notificationsTitleRow}><Feather name="bell" size={25} color="#009447" /><Text style={styles.notificationsTitle}>Notificaciones</Text><Pressable accessibilityLabel="Cerrar notificaciones" onPress={onClose} style={styles.notificationsClose}><Feather name="x" size={27} color="#27332C" /></Pressable></View>
        <View style={styles.notificationsTabs}><Pressable onPress={() => onTab('all')} style={[styles.notificationsTab, tab === 'all' && styles.notificationsTabActive]}><Text style={[styles.notificationsTabText, tab === 'all' && styles.notificationsTabTextActive]}>Todas</Text></Pressable><Pressable onPress={() => onTab('unread')} style={[styles.notificationsTab, tab === 'unread' && styles.notificationsTabActive]}><Text style={[styles.notificationsTabText, tab === 'unread' && styles.notificationsTabTextActive]}>No leídas</Text>{unreadCount > 0 ? <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{unreadCount}</Text></View> : null}</Pressable></View>
        <ScrollView contentContainerStyle={styles.notificationsList}>{items.length ? items.map((item) => { const appearance = notificationAppearance(item.kind); return <View key={item.id} style={styles.notificationCard}><View style={[styles.notificationIconCircle, { backgroundColor: appearance.background }]}><Feather name={appearance.icon} size={24} color={appearance.color} /></View><View style={styles.notificationCopy}><View style={styles.notificationCardHeader}><Text style={styles.notificationCardTitle}>{item.title}</Text><Text style={styles.notificationTime}>{item.relative_time}</Text></View><Text style={styles.notificationBody}>{item.message}</Text></View>{!item.read_at ? <View style={styles.notificationUnreadDot} /> : null}</View>; }) : <View style={styles.notificationsEmpty}><Feather name="check-circle" size={34} color="#009447" /><Text style={styles.notificationsEmptyText}>{tab === 'unread' ? 'No tienes notificaciones sin leer' : 'Todavía no tienes notificaciones'}</Text></View>}</ScrollView>
        <Pressable onPress={onReadAll} style={styles.readAllButton}><Feather name="check" size={19} color="#009447" /><Text style={styles.readAllText}>Marcar todas como leídas</Text></Pressable>
      </SafeAreaView>
    </View>
  </Modal>;
}
function ProfileQuickAction({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.quickAction}><Feather name={icon} size={22} color="#008C3A" style={styles.quickActionIcon} /><Text style={styles.quickActionLabel}>{label}</Text></Pressable>; }
function ProfileStat({ icon, value, label }: { icon: keyof typeof Feather.glyphMap; value: string; label: string }) { return <View style={styles.profileStat}><View style={styles.profileStatIcon}><Feather name={icon} size={18} color="#008C3A" /></View><Text style={styles.profileStatValue}>{value}</Text><Text style={styles.profileStatLabel}>{label}</Text><Text style={styles.profileStatPeriod}>Este mes</Text></View>; }
function BottomNav({ active, home, onNavigate }: { active: 'routes' | 'hospital' | 'profile'; home: 'routes' | 'hospital'; onNavigate: (screen: Screen) => void }) {
  return <View style={styles.bottomNav}>
    <Pressable style={styles.navItem} onPress={() => onNavigate(home)}><Text style={[styles.navIcon, active === home && styles.navActive]}>⌂</Text><Text style={[styles.navLabel, active === home && styles.navActive]}>Inicio</Text></Pressable>
    <Pressable style={styles.navItem} onPress={() => onNavigate(home)}><Text style={[styles.navIcon, active === home && styles.navActive]}>▤</Text><Text style={[styles.navLabel, active === home && styles.navActive]}>{home === 'hospital' ? 'Solicitudes' : 'Rutas'}</Text></Pressable>
    <Pressable style={styles.navItem} onPress={() => onNavigate('profile')}><Text style={[styles.navIcon, active === 'profile' && styles.navActive]}>◉</Text><Text style={[styles.navLabel, active === 'profile' && styles.navActive]}>Perfil</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7FAF8' },
  loginKeyboard: { flex: 1 },
  loginScroll: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 88, paddingBottom: 36, backgroundColor: '#FFFFFF' },
  loginForm: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  hero: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#008C3A', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoText: { color: '#fff', fontSize: 42, fontWeight: '800' },
  appName: { color: '#006B2D', fontSize: 25, fontWeight: '800', letterSpacing: 1.2 },
  muted: { color: '#66768A', fontSize: 14, marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#D7E6DB', marginBottom: 16 },
  loginTitle: { color: '#143B24', fontSize: 23, fontWeight: '700', marginBottom: 1 },
  label: { color: '#245238', fontWeight: '600', fontSize: 13, marginBottom: 7, marginTop: 15 },
  firstLabel: { marginTop: 0 },
  select: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#C8D5CC', borderRadius: 8, borderWidth: 1, flexDirection: 'row', height: 48, justifyContent: 'space-between', paddingHorizontal: 13 },
  selectText: { color: '#29312C', fontSize: 16 },
  selectIcon: { color: '#7B847E', fontSize: 24, lineHeight: 25 },
  demoMenu: { backgroundColor: '#FFFFFF', borderColor: '#D4DED7', borderRadius: 8, borderWidth: 1, marginTop: 5, overflow: 'hidden' },
  demoOption: { paddingHorizontal: 13, paddingVertical: 10 },
  demoOptionText: { color: '#1D2A22', fontSize: 14, fontWeight: '600' },
  demoUsername: { color: '#718078', fontSize: 11, marginTop: 2 },
  inputRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#C8D5CC', borderRadius: 8, borderWidth: 1, flexDirection: 'row', height: 48 },
  input: { color: '#18251D', flex: 1, fontSize: 16, height: '100%', paddingHorizontal: 13, paddingVertical: 0 },
  fieldIconButton: { alignItems: 'center', height: '100%', justifyContent: 'center', paddingHorizontal: 12 },
  fieldIcon: { color: '#7B847E', fontSize: 22 },
  rememberRow: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', marginTop: 16 },
  checkbox: { alignItems: 'center', borderColor: '#7C827E', borderWidth: 2, height: 18, justifyContent: 'center', marginHorizontal: 4, marginRight: 11, width: 18 },
  checkboxChecked: { backgroundColor: '#008C3A', borderColor: '#008C3A' },
  checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 14 },
  rememberText: { color: '#313A34', fontSize: 13 },
  primary: { backgroundColor: '#008C3A', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  disabled: { opacity: 0.55 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  loginButton: { borderRadius: 8, height: 46, marginTop: 16 },
  forgotButton: { alignSelf: 'center', marginTop: 8, padding: 5 },
  forgotText: { color: '#008C3A', fontSize: 13, fontWeight: '700' },
  authMessage: { backgroundColor: '#FFF3F3', borderColor: '#F1B9B9', borderRadius: 10, borderWidth: 1, marginTop: 12, padding: 11 },
  authMessageText: { color: '#A22929', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  note: { color: '#8795A5', fontSize: 10, textAlign: 'center', marginTop: 16 },
  header: { height: 80, backgroundColor: '#008C3A', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  brand: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  brandText: { color: '#008C3A', fontWeight: '800', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: '#D7F1E0', fontSize: 12, marginTop: 2 },
  back: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#007631', marginRight: 11 },
  backText: { color: '#fff', fontSize: 32, lineHeight: 35, fontWeight: '300' },
  content: { padding: 20, paddingBottom: 36 },
  eyebrow: { color: '#438058', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#143B24', fontSize: 25, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#66768A', fontSize: 14, marginTop: 5, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  refreshButton: { backgroundColor: '#E7F5EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 3 },
  refreshText: { color: '#008C3A', fontWeight: '800', fontSize: 12 },
  routeId: { color: '#008C3A', fontSize: 12, fontWeight: '800', letterSpacing: 0.7 },
  routeName: { color: '#143B24', fontSize: 18, fontWeight: '700', marginTop: 3 },
  pill: { backgroundColor: '#E7F5EB', paddingVertical: 6, paddingHorizontal: 9, borderRadius: 20 },
  pillText: { color: '#008C3A', fontSize: 10, fontWeight: '800' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderColor: '#E8EEF5' },
  statValue: { color: '#143B24', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#718096', fontSize: 12, marginTop: 2 },
  detail: { color: '#627D98', fontSize: 13, marginTop: 18, lineHeight: 19 },
  empty: { padding: 20, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D7E6DB' },
  emptyTitle: { color: '#143B24', fontWeight: '700', fontSize: 17, marginBottom: 7 },
  infoText: { color: '#486581', fontSize: 13, lineHeight: 19 },
  percent: { color: '#008C3A', fontSize: 25, fontWeight: '800', position: 'absolute', right: 17, top: 22 },
  track: { height: 8, backgroundColor: '#E6F0E8', borderRadius: 8, marginTop: 16, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#008C3A', borderRadius: 8 },
  tracking: { backgroundColor: '#E7F8EF', borderRadius: 13, padding: 14, borderWidth: 1, borderColor: '#BDE8CF', marginBottom: 8 },
  trackingCopy: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#13A363', marginRight: 9 },
  trackingText: { color: '#187047', fontWeight: '700', fontSize: 12, flex: 1 },
  locationRefresh: { alignSelf: 'flex-start', marginTop: 10, borderRadius: 8, backgroundColor: '#C9EFD9', paddingHorizontal: 10, paddingVertical: 7 },
  locationRefreshText: { color: '#126B46', fontSize: 11, fontWeight: '800' },
  sectionTitle: { color: '#102A43', fontSize: 18, fontWeight: '800', marginTop: 17, marginBottom: 12 },
  stop: { backgroundColor: '#fff', borderRadius: 15, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: '#DDE6F0' },
  stopDisabled: { opacity: 0.6 },
  number: { width: 29, height: 29, borderRadius: 15, backgroundColor: '#E7F5EB', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  numberDone: { backgroundColor: '#D8F5E5' },
  numberText: { color: '#008C3A', fontWeight: '800', fontSize: 13 },
  stopCopy: { flex: 1, paddingRight: 6 },
  stopHospital: { color: '#143B24', fontWeight: '700', fontSize: 14 },
  stopAddress: { color: '#66768A', fontSize: 12, lineHeight: 17, marginTop: 3 },
  stopMeta: { color: '#52708F', fontSize: 11, marginTop: 7, fontWeight: '600' },
  stopStatus: { color: '#B7791F', fontSize: 10, fontWeight: '800', marginTop: 3 },
  done: { color: '#15803D' },
  deliveryHero: { backgroundColor: '#008C3A', borderRadius: 17, padding: 20 },
  deliveryId: { color: '#D7F1E0', fontWeight: '800', fontSize: 12, letterSpacing: 0.8 },
  deliveryHospital: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 7 },
  deliveryAddress: { color: '#D7E7F6', fontSize: 13, lineHeight: 19, marginTop: 7 },
  detailRow: { paddingVertical: 15, borderBottomWidth: 1, borderColor: '#E8EEF5' },
  detailLabel: { color: '#718096', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailValue: { color: '#143B24', fontSize: 15, marginTop: 4, fontWeight: '600' },
  greetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  greeting: { color: '#5C7865', fontSize: 14, fontWeight: '600' },
  greetingName: { color: '#143B24', fontSize: 24, fontWeight: '800', marginTop: 2 },
  todayCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#CBE7D3', borderRadius: 20, borderWidth: 1, elevation: 2, marginBottom: 24, padding: 20, shadowColor: '#143B24', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16 },
  todayIcon: { alignItems: 'center', backgroundColor: '#E4F5EA', borderRadius: 28, height: 56, justifyContent: 'center', marginBottom: 13, width: 56 },
  todayIconText: { color: '#008C3A', fontSize: 22, fontWeight: '800' },
  todayTitle: { color: '#143B24', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  todayCopy: { color: '#28623D', fontSize: 14, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  todayMeta: { color: '#6F8777', fontSize: 12, marginTop: 5, textAlign: 'center' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  sectionHeading: { color: '#143B24', fontSize: 18, fontWeight: '800', marginTop: 3 },
  sectionCount: { backgroundColor: '#E4F5EA', borderRadius: 14, color: '#008C3A', fontSize: 12, fontWeight: '800', minWidth: 28, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, textAlign: 'center' },
  historyHint: { backgroundColor: '#F1F8F3', borderColor: '#D6EBDD', borderRadius: 15, borderWidth: 1, marginTop: 8, padding: 16 },
  historyHintTitle: { color: '#24613A', fontSize: 15, fontWeight: '800' },
  historyHintText: { color: '#5D7866', fontSize: 12, lineHeight: 18, marginTop: 5 },
  courierHomeSafe: { flex: 1, backgroundColor: '#F5FAF7' },
  courierHeader: { backgroundColor: '#008C3A', borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingBottom: 27, paddingHorizontal: 17 },
  courierToolbar: { alignItems: 'center', flexDirection: 'row', height: 49, justifyContent: 'space-between' },
  courierToolbarActions: { flexDirection: 'row', gap: 5 },
  courierToolbarButton: { alignItems: 'center', height: 38, justifyContent: 'center', position: 'relative', width: 38 },
  courierToolbarIcon: { color: '#FFFFFF', fontSize: 23, lineHeight: 26 },
  notificationDot: { backgroundColor: '#E43B3B', borderColor: '#FFFFFF', borderRadius: 4, borderWidth: 1, height: 7, position: 'absolute', right: 7, top: 6, width: 7 },
  notificationsOverlay: { backgroundColor: 'rgba(13, 29, 19, 0.42)', flex: 1, justifyContent: 'flex-end' },
  notificationsBackdrop: { flex: 1 },
  notificationsSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '91%', overflow: 'hidden', paddingHorizontal: 18 },
  notificationsHandle: { alignSelf: 'center', backgroundColor: '#C7CECA', borderRadius: 2, height: 4, marginBottom: 17, marginTop: 14, width: 46 },
  notificationsTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 15 },
  notificationsTitle: { color: '#101A14', flex: 1, fontSize: 25, fontWeight: '800' },
  notificationsClose: { alignItems: 'center', height: 38, justifyContent: 'center', width: 38 },
  notificationsTabs: { borderBottomColor: '#D6DDD8', borderBottomWidth: 1, flexDirection: 'row', height: 51 },
  notificationsTab: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center' },
  notificationsTabActive: { borderBottomColor: '#009447', borderBottomWidth: 3 },
  notificationsTabText: { color: '#6D756F', fontSize: 15, fontWeight: '800' },
  notificationsTabTextActive: { color: '#008D3D' },
  unreadBadge: { alignItems: 'center', backgroundColor: '#ED3439', borderRadius: 13, height: 25, justifyContent: 'center', minWidth: 25 },
  unreadBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  notificationsList: { gap: 10, paddingBottom: 14, paddingTop: 15 },
  notificationCard: { alignItems: 'center', borderColor: '#D9E0DC', borderRadius: 9, borderWidth: 1, flexDirection: 'row', minHeight: 86, padding: 12 },
  notificationIconCircle: { alignItems: 'center', borderRadius: 25, height: 50, justifyContent: 'center', marginRight: 12, width: 50 },
  notificationCopy: { flex: 1 },
  notificationCardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 7 },
  notificationCardTitle: { color: '#101A14', flex: 1, fontSize: 14, fontWeight: '800' },
  notificationTime: { color: '#6E7C73', fontSize: 10, paddingTop: 2 },
  notificationBody: { color: '#26342C', fontSize: 13, lineHeight: 18, marginTop: 3 },
  notificationUnreadDot: { backgroundColor: '#008C3A', borderRadius: 5, height: 10, marginLeft: 7, width: 10 },
  notificationsEmpty: { alignItems: 'center', gap: 10, paddingTop: 70 },
  notificationsEmptyText: { color: '#53645A', fontSize: 14, fontWeight: '700' },
  readAllButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderTopColor: '#DDE3DF', borderTopWidth: 1, flexDirection: 'row', gap: 10, height: 60, justifyContent: 'center' },
  readAllText: { color: '#008C3A', fontSize: 13, fontWeight: '800' },
  courierGreeting: { color: '#DDF4E6', fontSize: 14, fontWeight: '600', marginTop: 4 },
  courierName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 1 },
  courierHomeContent: { flexGrow: 1, paddingBottom: 36, paddingHorizontal: 16 },
  activeRouteCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, elevation: 4, marginTop: -22, paddingBottom: 20, paddingHorizontal: 18, paddingTop: 28, shadowColor: '#173D27', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 18 },
  takenRoutesSection: { marginTop: 20 },
  takenRoutesTitle: { color: '#101A14', fontSize: 18, fontWeight: '800' },
  takenRoutesSubtitle: { color: '#647369', fontSize: 12, lineHeight: 17, marginBottom: 12, marginTop: 3 },
  takenRouteCard: { backgroundColor: '#FFFFFF', borderColor: '#D4DFD7', borderRadius: 14, borderWidth: 1, marginBottom: 12, padding: 15 },
  takenRouteTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  takenRouteCopy: { flex: 1 },
  takenRouteCode: { color: '#111A15', fontSize: 17, fontWeight: '800' },
  takenRouteName: { color: '#66756C', fontSize: 12, fontWeight: '700', marginTop: 2 },
  takenRouteBadge: { backgroundColor: '#E8F7EF', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  takenRouteBadgeText: { color: '#008C3A', fontSize: 10, fontWeight: '800' },
  takenRouteMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  takenRouteMetaText: { color: '#607068', fontSize: 11 },
  takenRouteButton: { alignItems: 'center', backgroundColor: '#008C3A', borderRadius: 9, flexDirection: 'row', height: 42, justifyContent: 'center', marginTop: 14 },
  takenRouteButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginRight: 5 },
  packageIconCircle: { alignItems: 'center', backgroundColor: '#E0F2E7', borderRadius: 42, height: 84, justifyContent: 'center', marginBottom: 18, width: 84 },
  packageIcon: { color: '#008C3A', fontSize: 44, fontWeight: '700', lineHeight: 48 },
  activeRouteTitle: { color: '#111914', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  activeRouteSubtitle: { color: '#68786D', fontSize: 14, lineHeight: 20, marginBottom: 18, marginTop: 7, textAlign: 'center' },
  homePrimaryButton: { alignItems: 'center', backgroundColor: '#008C3A', borderRadius: 8, flexDirection: 'row', height: 47, justifyContent: 'center', marginBottom: 9, width: '100%' },
  homePrimaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  homeButtonIcon: { color: '#FFFFFF', fontSize: 21, marginRight: 10 },
  homeOutlineButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#8FCCA7', borderRadius: 8, borderWidth: 1, flexDirection: 'row', height: 47, justifyContent: 'center', marginBottom: 9, width: '100%' },
  homeOutlineButtonText: { color: '#008C3A', fontSize: 14, fontWeight: '800' },
  homeOutlineIcon: { color: '#008C3A', fontSize: 20, marginRight: 10 },
  courierBottomNav: { backgroundColor: '#FFFFFF', borderTopColor: '#D8E4DC', borderTopWidth: 1, flexDirection: 'row', height: 72, justifyContent: 'space-around', paddingTop: 8 },
  courierNavItem: { alignItems: 'center', flex: 1 },
  courierNavIcon: { color: '#76847B', fontSize: 20, fontWeight: '700', lineHeight: 26 },
  courierNavLabel: { color: '#59675E', fontSize: 10, fontWeight: '700', marginTop: 1 },
  courierNavActive: { color: '#008C3A' },
  scannerSafe: { flex: 1, backgroundColor: '#F5FAF7' },
  scannerHeader: { backgroundColor: '#008C3A', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  scannerTitleRow: { alignItems: 'center', flexDirection: 'row', height: 55, justifyContent: 'space-between', paddingHorizontal: 15 },
  scannerBack: { alignItems: 'center', height: 38, justifyContent: 'center', width: 38 },
  scannerBackText: { color: '#FFFFFF', fontSize: 32, fontWeight: '300', lineHeight: 34 },
  scannerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  scannerTabs: { backgroundColor: '#FFFFFF', borderBottomColor: '#D9E3DC', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 16 },
  scannerTab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 3, flex: 1, height: 51, justifyContent: 'center' },
  scannerTabActive: { borderBottomColor: '#008C3A' },
  scannerTabText: { color: '#18251D', fontSize: 13, fontWeight: '700' },
  scannerTabTextActive: { color: '#008C3A' },
  scannerContent: { flexGrow: 1, padding: 16, paddingBottom: 30 },
  scannerPanel: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#D7E1DA', borderRadius: 9, borderWidth: 1, paddingBottom: 18, paddingHorizontal: 14, paddingTop: 18 },
  scannerInstruction: { color: '#243129', fontSize: 13, fontWeight: '800', marginBottom: 14, textAlign: 'center' },
  cameraFrame: { height: 184, overflow: 'hidden', position: 'relative', width: 184 },
  cameraPreview: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  cameraPermission: { alignItems: 'center', backgroundColor: '#F8FAF8', flex: 1, justifyContent: 'center' },
  cameraPermissionText: { color: '#526159', fontSize: 11, marginTop: 8, textAlign: 'center' },
  qrPlaceholder: { color: '#121212', fontSize: 70, fontWeight: '800' },
  scanCornerTopLeft: { borderLeftColor: '#008C3A', borderLeftWidth: 3, borderTopColor: '#008C3A', borderTopLeftRadius: 9, borderTopWidth: 3, height: 62, left: 0, position: 'absolute', top: 0, width: 62 },
  scanCornerTopRight: { borderRightColor: '#008C3A', borderRightWidth: 3, borderTopColor: '#008C3A', borderTopRightRadius: 9, borderTopWidth: 3, height: 62, position: 'absolute', right: 0, top: 0, width: 62 },
  scanCornerBottomLeft: { borderBottomColor: '#008C3A', borderBottomLeftRadius: 9, borderBottomWidth: 3, borderLeftColor: '#008C3A', borderLeftWidth: 3, bottom: 0, height: 62, left: 0, position: 'absolute', width: 62 },
  scanCornerBottomRight: { borderBottomColor: '#008C3A', borderBottomRightRadius: 9, borderBottomWidth: 3, borderRightColor: '#008C3A', borderRightWidth: 3, bottom: 0, height: 62, position: 'absolute', right: 0, width: 62 },
  scanAgain: { color: '#008C3A', fontSize: 12, fontWeight: '700', marginTop: 10 },
  manualPanel: { backgroundColor: '#FFFFFF', borderColor: '#D7E1DA', borderRadius: 9, borderWidth: 1, padding: 14 },
  manualRoute: { borderColor: '#D5E1D8', borderRadius: 8, borderWidth: 1, marginBottom: 9, padding: 12 },
  manualRouteSelected: { backgroundColor: '#E8F7ED', borderColor: '#008C3A' },
  manualRouteCode: { color: '#102118', fontSize: 14, fontWeight: '800' },
  manualRouteName: { color: '#627169', fontSize: 12, marginTop: 3 },
  noRoutesText: { color: '#6B786F', fontSize: 13, paddingVertical: 20, textAlign: 'center' },
  scannedRouteCard: { backgroundColor: '#FFFFFF', borderColor: '#D7E1DA', borderRadius: 9, borderWidth: 1, marginTop: 12, padding: 14 },
  scannedRouteHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  scannedRouteCode: { color: '#101A14', fontSize: 17, fontWeight: '800' },
  scannedRouteName: { color: '#65746A', fontSize: 12, fontWeight: '600', marginTop: 3 },
  availableBadge: { backgroundColor: '#E4F6EA', borderRadius: 15, color: '#008C3A', fontSize: 10, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  scannedRouteMeta: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10, marginTop: 10, rowGap: 7 },
  routeMetaItem: { color: '#314139', fontSize: 11, width: '50%' },
  selectRouteButton: { alignItems: 'center', backgroundColor: '#008C3A', borderRadius: 8, height: 45, justifyContent: 'center' },
  selectRouteButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  catalogSafe: { flex: 1, backgroundColor: '#F5FAF7' },
  catalogSearchRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#CCD9D0', borderRadius: 8, borderWidth: 1, flexDirection: 'row', height: 48, marginHorizontal: 16, marginTop: 14 },
  catalogSearchInput: { color: '#1B2820', flex: 1, fontSize: 15, height: '100%', paddingHorizontal: 13, paddingVertical: 0 },
  catalogSearchIcon: { color: '#738078', fontSize: 26, paddingHorizontal: 12 },
  catalogContent: { flexGrow: 1, paddingBottom: 28, paddingHorizontal: 16, paddingTop: 12 },
  catalogRouteCard: { backgroundColor: '#FFFFFF', borderColor: '#D4DFD7', borderRadius: 9, borderWidth: 1, marginBottom: 11, padding: 14 },
  catalogRouteTaken: { backgroundColor: '#F0F3F1' },
  catalogRouteHeadingCopy: { flex: 1, paddingRight: 10 },
  catalogMuted: { color: '#6E7A72' },
  takenBadge: { color: '#65736A', fontSize: 10, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 6 },
  routeTakenBy: { color: '#607068', fontSize: 11, fontWeight: '700', marginBottom: 10, marginTop: -1 },
  catalogSelectButton: { alignItems: 'center', backgroundColor: '#008C3A', borderRadius: 8, height: 45, justifyContent: 'center' },
  catalogSelectDisabled: { backgroundColor: '#D6DCDA' },
  catalogSelectText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  catalogSelectTextDisabled: { color: '#98A19C' },
  catalogEmpty: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#D7E1DA', borderRadius: 10, borderWidth: 1, marginTop: 6, padding: 28 },
  catalogEmptyTitle: { color: '#1D2A22', fontSize: 17, fontWeight: '800' },
  catalogEmptyText: { color: '#68766D', fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  routeCatalogCard: { backgroundColor: '#FFFFFF', borderColor: '#D4DFD7', borderRadius: 9, borderWidth: 1, marginBottom: 11, padding: 14 },
  inactiveBadge: { backgroundColor: '#ECEFED', borderRadius: 15, color: '#6D7671', fontSize: 10, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  catalogChevron: { color: '#536159', fontSize: 20, lineHeight: 23, marginLeft: 8 },
  catalogExpanded: { borderTopColor: '#E1E8E3', borderTopWidth: 1, marginTop: 4, paddingTop: 10 },
  catalogExpandedText: { color: '#59675F', fontSize: 11, lineHeight: 18 },
  historySafe: { flex: 1, backgroundColor: '#F5FAF7' },
  historyContent: { padding: 16, paddingBottom: 28 },
  historyCard: { backgroundColor: '#FFFFFF', borderColor: '#D5E0D8', borderRadius: 9, borderWidth: 1, marginBottom: 12, padding: 14 },
  historyRouteCode: { color: '#101A14', fontSize: 18, fontWeight: '800' },
  historyRouteName: { color: '#65736A', fontSize: 12, fontWeight: '700', marginBottom: 10, marginTop: 2 },
  historyProgressHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  historyProgressValue: { color: '#101A14', fontSize: 17, fontWeight: '800' },
  historyProgressLabel: { color: '#6B786F', fontSize: 10 },
  historyTrack: { backgroundColor: '#E5EBE7', borderRadius: 5, height: 10, marginBottom: 5, marginTop: 3, overflow: 'hidden' },
  historyFill: { backgroundColor: '#008C3A', borderRadius: 5, height: '100%' },
  deliveryStats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  deliveryStat: { alignItems: 'center', borderColor: '#D7E0DA', borderRadius: 8, borderWidth: 1, flex: 1, minHeight: 80, justifyContent: 'center', padding: 8 },
  deliveryStatComplete: { color: '#008C3A', fontSize: 20, fontWeight: '800' },
  deliveryStatPartial: { color: '#E99A00', fontSize: 20, fontWeight: '800' },
  deliveryStatMissing: { color: '#E63D48', fontSize: 20, fontWeight: '800' },
  deliveryStatLabel: { color: '#617068', fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: 'center' },
  historySectionTitle: { color: '#1B2820', fontSize: 13, fontWeight: '800', marginBottom: 10 },
  hospitalHistoryRow: { alignItems: 'center', flexDirection: 'row', minHeight: 28 },
  hospitalHistoryCheck: { color: '#728079', fontSize: 14, width: 22 },
  hospitalHistoryName: { color: '#344139', flex: 1, fontSize: 11 },
  hospitalCompleted: { color: '#008C3A', fontSize: 10 },
  hospitalPending: { color: '#C77A00', fontSize: 10 },
  moreHospitals: { color: '#68776E', fontSize: 10, marginTop: 5 },
  pendingDelivery: { backgroundColor: '#FFF4D8', borderColor: '#F2C35D', borderRadius: 8, borderWidth: 1, marginBottom: 9, padding: 11 },
  pendingDeliveryTitle: { color: '#754900', fontSize: 11, fontWeight: '800' },
  pendingDeliveryText: { color: '#754900', fontSize: 10, fontWeight: '700', marginTop: 3 },
  pendingWarning: { backgroundColor: '#FFF0F1', borderColor: '#F4B8BD', borderRadius: 8, borderWidth: 1, marginBottom: 9, padding: 11 },
  pendingWarningText: { color: '#C51F2D', fontSize: 10, fontWeight: '800' },
  reviewPendingButton: { alignItems: 'center', borderColor: '#8ECCA6', borderRadius: 8, borderWidth: 1, height: 44, justifyContent: 'center', marginBottom: 9 },
  reviewPendingText: { color: '#008C3A', fontSize: 12, fontWeight: '800' },
  finishIncidentButton: { alignItems: 'center', backgroundColor: '#EA4650', borderRadius: 8, height: 44, justifyContent: 'center' },
  finishIncidentText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  hospitalHeading: { marginBottom: 34 },
  hospitalName: { color: '#143B24', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  hospitalGreeting: { color: '#143B24', fontSize: 18, fontWeight: '800' },
  hospitalQuestion: { color: '#143B24', fontSize: 16, fontWeight: '800', marginTop: 5, marginBottom: 18 },
  hospitalAction: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#D7E6DB', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginBottom: 12, padding: 16 },
  actionIcon: { alignItems: 'center', backgroundColor: '#E4F5EA', borderRadius: 21, height: 42, justifyContent: 'center', marginRight: 13, width: 42 },
  actionIconText: { color: '#008C3A', fontSize: 24, fontWeight: '800' },
  actionCopy: { flex: 1 },
  actionTitle: { color: '#143B24', fontSize: 15, fontWeight: '800' },
  actionText: { color: '#627D6B', fontSize: 12, lineHeight: 17, marginTop: 3 },
  notificationBadge: { alignItems: 'center', backgroundColor: '#E93434', borderRadius: 15, height: 30, justifyContent: 'center', marginLeft: 8, minWidth: 30, paddingHorizontal: 6 },
  notificationBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  bottomNav: { height: 72, flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#D7E6DB', justifyContent: 'space-around', paddingTop: 8 },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navIcon: { color: '#7B8F82', fontSize: 19, fontWeight: '700' },
  navLabel: { color: '#7B8F82', fontSize: 10, fontWeight: '700' },
  navActive: { color: '#008C3A' },
  profileSafe: { flex: 1, backgroundColor: '#F3F8F5' },
  profileHeader: { backgroundColor: '#007D31', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, height: 142, paddingHorizontal: 17 },
  profilePageTitle: { color: '#FFFFFF', fontSize: 29, fontWeight: '800', marginLeft: 4, marginTop: 5 },
  profileContent: { paddingBottom: 28, paddingHorizontal: 16 },
  profileMainCard: { backgroundColor: '#FFFFFF', borderRadius: 20, elevation: 4, marginTop: 12, padding: 18, shadowColor: '#173D27', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 18 },
  profileIdentity: { alignItems: 'center', flexDirection: 'row' },
  profileAvatar: { alignItems: 'center', backgroundColor: '#DDF0E4', borderRadius: 46, height: 92, justifyContent: 'center', position: 'relative', width: 92 },
  profileAvatarIcon: { color: '#217E47', fontSize: 54 },
  profileCameraBadge: { alignItems: 'center', backgroundColor: '#008C3A', borderColor: '#FFFFFF', borderRadius: 15, borderWidth: 2, bottom: 2, height: 30, justifyContent: 'center', position: 'absolute', right: 0, width: 30 },
  profileCameraIcon: { color: '#FFFFFF', fontSize: 14 },
  profileIdentityCopy: { flex: 1, marginLeft: 18 },
  profileFullName: { color: '#0D1711', fontSize: 21, fontWeight: '800' },
  profilePosition: { color: '#008C3A', fontSize: 13, fontWeight: '800', marginBottom: 5, marginTop: 2 },
  profileContact: { color: '#607068', fontSize: 12, lineHeight: 19 },
  profileDivider: { backgroundColor: '#DDE5DF', height: 1, marginVertical: 16 },
  profileInfoGrid: { flexDirection: 'row' },
  profileInfoItem: { alignItems: 'center', flex: 1 },
  profileInfoDivider: { backgroundColor: '#DDE5DF', width: 1 },
  profileInfoIcon: { alignItems: 'center', backgroundColor: '#E8F6ED', borderRadius: 13, height: 42, justifyContent: 'center', marginBottom: 7, width: 42 },
  profileInfoIconText: { color: '#008C3A', fontSize: 21 },
  profileInfoLabel: { color: '#19251E', fontSize: 10, fontWeight: '800' },
  profileInfoValue: { color: '#303D35', fontSize: 11, marginTop: 5, textAlign: 'center' },
  profileSectionLabel: { color: '#647369', fontSize: 12, fontWeight: '800', marginBottom: 8, marginLeft: 4, marginTop: 18 },
  quickActions: { backgroundColor: '#FFFFFF', borderRadius: 14, flexDirection: 'row', overflow: 'hidden' },
  quickAction: { alignItems: 'center', borderRightColor: '#DDE5DF', borderRightWidth: 1, flex: 1, minHeight: 78, justifyContent: 'center', paddingHorizontal: 4 },
  quickActionIcon: { color: '#008C3A', fontSize: 23, marginBottom: 6 },
  quickActionLabel: { color: '#17221B', fontSize: 9, fontWeight: '800', lineHeight: 12, textAlign: 'center' },
  accountCard: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14 },
  accountRow: { alignItems: 'center', flexDirection: 'row', height: 56 },
  accountIcon: { alignItems: 'center', justifyContent: 'center', marginRight: 16, width: 26 },
  accountLabel: { color: '#17221B', flex: 1, fontSize: 14, fontWeight: '800' },
  accountArrow: { color: '#18231C', fontSize: 27 },
  accountDivider: { backgroundColor: '#DDE5DF', height: 1 },
  profileStats: { backgroundColor: '#FFFFFF', borderRadius: 14, flexDirection: 'row', overflow: 'hidden' },
  profileStat: { borderRightColor: '#DDE5DF', borderRightWidth: 1, flex: 1, minHeight: 143, padding: 9 },
  profileStatIcon: { alignItems: 'center', backgroundColor: '#E7F5EC', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  profileStatIconText: { color: '#008C3A', fontSize: 18 },
  profileStatValue: { color: '#008C3A', fontSize: 20, fontWeight: '800', marginTop: 7 },
  profileStatLabel: { color: '#18231C', fontSize: 9, fontWeight: '800', lineHeight: 13, marginTop: 2 },
  profileStatPeriod: { color: '#75827A', fontSize: 8, marginTop: 7 },
  profileLogout: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, flexDirection: 'row', gap: 9, height: 54, justifyContent: 'center', marginTop: 18 },
  profileLogoutText: { color: '#F0353F', fontSize: 15, fontWeight: '800' },
  profileHero: { alignItems: 'center', paddingVertical: 24, marginBottom: 8 },
  profileInitial: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DDF3E5', marginBottom: 10 },
  profileInitialText: { color: '#008C3A', fontSize: 31, fontWeight: '800' },
  profileName: { color: '#143B24', fontSize: 20, fontWeight: '800' },
  profileRole: { color: '#5C7865', fontSize: 13, marginTop: 4 },
  outlineButton: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#008C3A', alignItems: 'center', justifyContent: 'center' },
  outlineButtonText: { color: '#008C3A', fontWeight: '800' },
  releaseButton: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#C46A6A', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  releaseButtonText: { color: '#B13C3C', fontWeight: '800' },
  warning: { backgroundColor: '#FFF8E6', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#F6DF9C' },
  warningTitle: { color: '#8A5A00', fontWeight: '800', marginBottom: 5 },
  warningText: { color: '#765B27', fontSize: 13, lineHeight: 19 },
});
