export const API_BASE_URL = 'http://10.0.2.2:8080/api/mobile';

export type QuotationWorkflow = { id: number; folio: string; status: string; status_label: string; institution?: string; hospital?: string; seller?: string; central?: string; request_id?: number; category: string; can_authorize: boolean; can_prepare: boolean; events: { previous_status?: string; status: string; source: string; created_at: string }[] };
export function quotationWorkflow(token: string, id: number): Promise<QuotationWorkflow> { return request(`/quotations/${id}/workflow`, {}, token); }

type ApiError = { message?: string; errors?: Record<string, string[]> };

export type MobileStop = {
  schedule_id: number;
  hospital_id: number;
  order: number;
  hospital: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: 'pending' | 'delivered';
  delivered_at: string | null;
};

export type MobileRoute = {
  id: number;
  code: string;
  name: string;
  date: string;
  schedule_start: string;
  schedule_end: string;
  status: string;
  stops_count: number;
  completed_stops_count: number;
  stops: MobileStop[];
};

export type RouteCatalogItem = {
  id: number;
  code: string;
  name: string;
  schedule_start: string;
  schedule_end: string;
  status: 'active' | 'inactive';
  hospitals_count: number;
  deliveries_count: number;
  is_taken: boolean;
};

export type MobileUser = {
  id: number;
  name: string;
  username: string;
  module: 'courier' | 'hospital' | 'sales';
  profile: {
    position: string;
    email: string | null;
    phone: string | null;
    department: string | null;
    hire_date: string | null;
  } | null;
  hospital: { id: number; name: string; short_name: string | null } | null;
};

export type MobileSession = { token: string; user: MobileUser };

export type MobileNotification = {
  id: string;
  title: string;
  message: string;
  kind: 'route_assigned' | 'reminder' | 'delivery_completed' | 'info' | 'quotation_updated';
  quotation_id?: number;
  status?: string;
  read_at: string | null;
  created_at: string | null;
  relative_time: string;
};

export type HospitalDashboard = {
  hospital: { id: number; name: string; short_name: string | null };
  requests: { oncology_pending: number; nutrition_pending: number; pending_total: number };
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('La conexión con Mezclas Pro tardó demasiado. Revisa tu conexión a internet e inténtalo otra vez.');
    }

    throw new Error('No fue posible comunicarse con Mezclas Pro. Revisa tu conexión a internet e inténtalo otra vez.');
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({})) as T & ApiError;

  if (!response.ok) {
    const validationMessage = payload.errors ? Object.values(payload.errors).flat().join('\n') : '';
    throw new Error(validationMessage || payload.message || 'No fue posible comunicarse con Mezclas Pro.');
  }

  return payload;
}

export async function login(username: string, password: string): Promise<MobileSession> {
  return request<MobileSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, device_name: 'Prodifem Rutas Android' }),
  });
}

export function salesRequest<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  return request<T>(`/sales${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }, token);
}

export function hospitalRequest<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  return request<T>(`/hospital${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }, token);
}

export async function uploadHospitalRequest<T>(token: string, form: FormData): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_BASE_URL}/hospital/quotation-requests`, { method: 'POST', signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.errors ? Object.values(data.errors).flat().join('\n') : data.message || 'No se pudo enviar la solicitud.');
    return data;
  } finally { clearTimeout(timer); }
}

export function mobileLogout(token: string): Promise<unknown> { return request('/auth/logout', { method: 'POST' }, token); }

export async function mobileMe(token: string): Promise<MobileUser> {
  const data = await request<{ user: MobileUser }>('/me', {}, token);
  return data.user;
}

export async function hospitalDashboard(token: string): Promise<HospitalDashboard> {
  return request<HospitalDashboard>('/hospital/dashboard', {}, token);
}

export async function assignedRoutes(token: string): Promise<MobileRoute[]> {
  const data = await request<{ routes: MobileRoute[] }>('/routes/assigned', {}, token);
  return data.routes;
}

export async function availableRoutes(token: string): Promise<MobileRoute[]> {
  const data = await request<{ routes: MobileRoute[] }>('/routes/available', {}, token);
  return data.routes;
}

export async function routeCatalog(token: string): Promise<RouteCatalogItem[]> {
  const data = await request<{ routes: RouteCatalogItem[] }>('/routes/catalog', {}, token);
  return data.routes;
}

export async function routeHistory(token: string): Promise<MobileRoute[]> {
  const data = await request<{ routes: MobileRoute[] }>('/routes/history', {}, token);
  return data.routes;
}

export async function mobileNotifications(token: string): Promise<{ notifications: MobileNotification[]; unread_count: number }> {
  return request('/notifications', {}, token);
}

export async function markAllMobileNotificationsRead(token: string): Promise<void> {
  await request('/notifications/read-all', { method: 'POST' }, token);
}

export async function acceptRoute(token: string, routeId: number): Promise<void> {
  await request(`/routes/${routeId}/accept`, { method: 'POST' }, token);
}

export async function releaseRoute(token: string, routeId: number): Promise<void> {
  await request(`/routes/${routeId}/release`, { method: 'POST' }, token);
}

export async function startRoute(token: string, routeId: number, location?: Coordinates): Promise<void> {
  await request(`/routes/${routeId}/start`, {
    method: 'POST',
    body: JSON.stringify(location ?? {}),
  }, token);
}

export async function sendLocation(token: string, routeId: number, location: Coordinates): Promise<void> {
  await request(`/routes/${routeId}/locations`, { method: 'POST', body: JSON.stringify(location) }, token);
}

export async function confirmDelivery(token: string, routeId: number, scheduleId: number, location?: Coordinates): Promise<void> {
  await request(`/routes/${routeId}/deliveries/${scheduleId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(location ?? {}),
  }, token);
}

export type Coordinates = { latitude: number; longitude: number; accuracy?: number | null };
