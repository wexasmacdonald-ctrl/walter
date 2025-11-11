import { API_BASE } from '@/features/route-planner/api';
import type {
  AccountProfile,
  AdminSummary,
  AdminUserProfileUpdateResponse,
  AuthUser,
  CreateUserInput,
  CreateUserResponse,
  DriverStop,
  DriverSummary,
  LoginResponse,
  ResetUserPasswordResponse,
  UserRole,
} from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

type RequestOptions = {
  token?: string;
  body?: unknown;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
};

type JsonError = {
  error?: string;
  message?: string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'POST';
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: method !== 'GET' && options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T & JsonError) : {};

  if (!response.ok) {
    const code = typeof payload?.error === 'string' ? payload.error : `HTTP_${response.status}`;
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : text || 'Request failed.';
    throw new Error(`${code}: ${message}`);
  }

  return payload as T;
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const payload = await request<LoginResponse>('/auth/login', {
    body: { identifier, password },
  });
  return {
    token: payload.token,
    user: normalizeUser(payload.user),
  };
}

export async function createUser(
  token: string,
  input: CreateUserInput
): Promise<CreateUserResponse> {
  const body: Record<string, string | undefined> = {
    email_or_phone: input.emailOrPhone,
    role: input.role ?? 'driver',
  };
  if (typeof input.fullName === 'string') {
    const trimmed = input.fullName.trim();
    if (trimmed.length > 0) {
      body.full_name = trimmed;
    }
  }

  const payload = await request<CreateUserResponse>('/admin/create-user', {
    token,
    body,
  });
  return payload;
}

export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await request('/auth/change-password', {
    token,
    body: {
      current_password: currentPassword,
      new_password: newPassword,
    },
  });
}

export async function deleteMyData(token: string): Promise<void> {
  await request('/account/data', {
    token,
    method: 'DELETE',
  });
}

export async function deleteAccount(token: string): Promise<void> {
  await request('/account', {
    token,
    method: 'DELETE',
  });
}

export async function getMyProfile(token: string): Promise<AccountProfile> {
  return request<AccountProfile>('/account/profile', {
    token,
    method: 'GET',
  });
}

export async function updateMyProfile(
  token: string,
  profile: { fullName?: string | null; emailOrPhone?: string }
): Promise<AccountProfile> {
  const payload: Record<string, string | null | undefined> = {};
  if (profile.fullName !== undefined) {
    payload.full_name = profile.fullName ?? null;
  }
  if (profile.emailOrPhone !== undefined) {
    payload.email_or_phone = profile.emailOrPhone;
  }
  return request<AccountProfile>('/account/profile', {
    token,
    method: 'PATCH',
    body: payload,
  });
}

export async function fetchDrivers(token: string): Promise<DriverSummary[]> {
  if (!token) {
    return [];
  }
  const response = await request<{ drivers: DriverSummary[] }>('/admin/drivers', {
    token,
    method: 'GET',
  });
  return response.drivers ?? [];
}

export async function fetchAdmins(token: string): Promise<AdminSummary[]> {
  if (!token) {
    return [];
  }
  const response = await request<{ admins: AdminSummary[] }>('/admin/admins', {
    token,
    method: 'GET',
  });
  return response.admins ?? [];
}

export async function fetchDriverStops(
  token: string,
  driverId: string
): Promise<DriverStop[]> {
  if (!token) {
    return [];
  }
  const response = await request<{ stops: DriverStop[] }>(
    `/admin/driver-stops?driver_id=${encodeURIComponent(driverId)}`,
    {
      token,
      method: 'GET',
    }
  );
  return normalizeStops(response.stops ?? []);
}

export async function saveDriverStops(
  token: string,
  driverId: string,
  addresses: string[]
): Promise<DriverStop[]> {
  const response = await request<{ stops: DriverStop[] }>('/admin/driver-stops', {
    token,
    body: {
      driver_id: driverId,
      addresses,
    },
  });
  return normalizeStops(response.stops ?? []);
}

export async function fetchMyStops(token: string): Promise<DriverStop[]> {
  if (!token) {
    return [];
  }
  const response = await request<{ stops: DriverStop[] }>('/driver/stops', {
    token,
    method: 'GET',
  });
  return normalizeStops(response.stops ?? []);
}

export async function updateDriverStopStatus(
  token: string,
  stopId: string,
  action: 'complete' | 'undo'
): Promise<DriverStop> {
  const response = await request<{ stop: DriverStop }>(
    `/driver/stops/${encodeURIComponent(stopId)}/${action}`,
    {
      token,
    }
  );
  return normalizeStop(response.stop);
}

export async function resetUserPassword(
  token: string,
  userId: string
): Promise<ResetUserPasswordResponse> {
  return request<ResetUserPasswordResponse>('/admin/users/reset-password', {
    token,
    body: { user_id: userId },
  });
}

export async function deleteUserAccount(token: string, userId: string): Promise<void> {
  await request('/admin/users', {
    token,
    method: 'DELETE',
    body: { user_id: userId },
  });
}

export async function adminUpdateUserProfile(
  token: string,
  userId: string,
  updates: { fullName?: string | null; emailOrPhone?: string }
): Promise<AdminUserProfileUpdateResponse> {
  const payload: Record<string, string | null | undefined> = {
    user_id: userId,
  };
  if (updates.fullName !== undefined) {
    payload.full_name = updates.fullName ?? null;
  }
  if (updates.emailOrPhone !== undefined) {
    payload.email_or_phone = updates.emailOrPhone;
  }
  return request<AdminUserProfileUpdateResponse>('/admin/users/update-profile', {
    token,
    body: payload,
  });
}

export async function adminUpdateUserPassword(
  token: string,
  userId: string,
  newPassword: string
): Promise<void> {
  await request('/admin/users/update-password', {
    token,
    body: {
      user_id: userId,
      new_password: newPassword,
    },
  });
}

export async function verifyPassword(token: string, password: string): Promise<void> {
  await request('/account/verify-password', {
    token,
    body: { current_password: password },
  });
}

function normalizeUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    fullName: user.fullName ?? null,
    role: normalizeRole(user.role),
    mustChangePassword: Boolean(user.mustChangePassword),
    tokenExpiresAt: user.tokenExpiresAt,
  };
}

function normalizeRole(role: string): UserRole {
  return role === 'admin' ? 'admin' : 'driver';
}

function normalizeStops(stops: DriverStop[]): DriverStop[] {
  return stops.map(normalizeStop);
}

function normalizeStop(stop: DriverStop): DriverStop {
  return {
    ...stop,
    status: stop.status === 'complete' ? 'complete' : 'pending',
  };
}
