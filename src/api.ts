/**
 * Typed API Client for WarrantyEase
 */

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Warranty {
  id: string;
  user_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  model_number: string | null;
  serial_number: string | null;
  purchase_date: string;
  purchase_price: number | null;
  currency: string;
  warranty_duration_months: number;
  expiry_date: string;
  seller: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  remaining_days: number;
  status: 'active' | 'expiring_soon' | 'expiring_today' | 'expired';
  linked_documents?: DocumentItem[];
}

export interface DocumentItem {
  id: string;
  user_id: string;
  warranty_id: string | null;
  original_filename: string;
  object_key: string;
  mime_type: string;
  file_size: number;
  processing_status: string;
  created_at: string;
  updated_at: string;
  product_name?: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  warranty_id: string;
  reminder_type: string;
  message: string;
  is_read: boolean;
  deduplication_key: string;
  created_at: string;
  product_name?: string;
  expiry_date?: string;
}

export interface DashboardSummary {
  total_warranties: number;
  active_warranties: number;
  expiring_soon: number;
  expired_warranties: number;
  upcoming_expiries: Warranty[];
  recent_warranties: Warranty[];
  recent_documents: DocumentItem[];
  database_type: string;
}

export interface HealthInfo {
  status: string;
  app: string;
  version: string;
  database: string;
  storage: string;
  uptime_seconds: number;
  timestamp: string;
}

export interface OcrSuggestions {
  product_name?: string;
  brand?: string;
  invoice_number?: string;
  seller?: string;
  purchase_date?: string;
  purchase_price?: number;
  currency?: string;
  warranty_duration_months?: number;
  raw_text: string;
  confidence: number;
  extracted_fields_count: number;
}

export interface OcrResponse {
  success: boolean;
  message: string;
  suggestions: OcrSuggestions;
  document_id?: string;
  filename: string;
  file_size: number;
  mime_type: string;
}

let activeAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  activeAuthToken = token;
}

export function getAuthToken(): string | null {
  return activeAuthToken;
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const defaultHeaders: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  if (activeAuthToken) {
    defaultHeaders['Authorization'] = `Bearer ${activeAuthToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include', // Include HttpOnly cookies
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  register: (name: string, email: string, password: string) =>
    fetchJson<{ user: User; token: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    fetchJson<{ user: User; token: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    fetchJson<{ success: boolean }>('/api/v1/auth/logout', { method: 'POST' }),

  getMe: () =>
    fetchJson<{ user: User }>('/api/v1/auth/me'),

  updateSettings: (name: string) =>
    fetchJson<{ user: User }>('/api/v1/auth/settings', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  loginDemo: () =>
    fetchJson<{ user: User; message: string }>('/api/v1/auth/demo', { method: 'POST' }),

  // Warranties
  getWarranties: (params?: { search?: string; category?: string; status?: string; sortBy?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.status) query.set('status', params.status);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    return fetchJson<{ warranties: Warranty[] }>(`/api/v1/warranties?${query.toString()}`);
  },

  getWarranty: (id: string) =>
    fetchJson<{ warranty: Warranty }>(`/api/v1/warranties/${id}`),

  createWarranty: (data: {
    product_name: string;
    brand?: string;
    category?: string;
    model_number?: string;
    serial_number?: string;
    purchase_date: string;
    purchase_price?: number;
    currency?: string;
    warranty_duration_months: number;
    seller?: string;
    notes?: string;
    document_id?: string;
  }) =>
    fetchJson<{ warranty: Warranty; message: string }>('/api/v1/warranties', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateWarranty: (id: string, data: Partial<Warranty>) =>
    fetchJson<{ warranty: Warranty; message: string }>(`/api/v1/warranties/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteWarranty: (id: string) =>
    fetchJson<{ success: boolean; message: string }>(`/api/v1/warranties/${id}`, {
      method: 'DELETE',
    }),

  // Documents
  getDocuments: () =>
    fetchJson<{ documents: DocumentItem[] }>('/api/v1/documents'),

  uploadDocument: (file: File, warrantyId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (warrantyId) formData.append('warranty_id', warrantyId);

    return fetchJson<{ document: DocumentItem; message: string }>('/api/v1/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  getDownloadUrl: (id: string) =>
    fetchJson<{ url: string; is_signed_s3: boolean; filename: string }>(`/api/v1/documents/${id}/download-url`, {
      method: 'POST',
    }),

  linkDocument: (documentId: string, warrantyId: string | null) =>
    fetchJson<{ success: boolean; message: string }>(`/api/v1/documents/${documentId}/link`, {
      method: 'PATCH',
      body: JSON.stringify({ warranty_id: warrantyId }),
    }),

  deleteDocument: (id: string) =>
    fetchJson<{ success: boolean; message: string }>(`/api/v1/documents/${id}`, {
      method: 'DELETE',
    }),

  // Notifications
  getNotifications: () =>
    fetchJson<{ notifications: NotificationItem[]; unread_count: number }>('/api/v1/notifications'),

  markNotificationRead: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/v1/notifications/${id}/read`, {
      method: 'PATCH',
    }),

  markAllNotificationsRead: () =>
    fetchJson<{ success: boolean; marked_count: number }>('/api/v1/notifications/read-all', {
      method: 'POST',
    }),

  generateDueNotifications: () =>
    fetchJson<{
      success: boolean;
      new_notifications_count: number;
      total_unread: number;
      notifications: NotificationItem[];
      message: string;
    }>('/api/v1/notifications/generate-due', {
      method: 'POST',
    }),

  // Dashboard
  getDashboardSummary: () =>
    fetchJson<{ summary: DashboardSummary }>('/api/v1/dashboard/summary'),

  // OCR Extraction
  processOcr: (file: File, save: boolean = true) => {
    const formData = new FormData();
    formData.append('invoice', file);
    formData.append('save', String(save));
    return fetchJson<OcrResponse>('/api/v1/ocr/process', {
      method: 'POST',
      body: formData,
    });
  },

  // Clerk User Sync
  syncClerkUser: (name?: string, email?: string) =>
    fetchJson<{ user: User }>('/api/v1/auth/sync-clerk', {
      method: 'POST',
      body: JSON.stringify({ name, email }),
    }),

  // Health
  getHealth: () =>
    fetchJson<HealthInfo>('/api/v1/health'),
};
