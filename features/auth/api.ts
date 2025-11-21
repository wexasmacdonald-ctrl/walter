import { API_BASE } from '@/features/route-planner/api';
import type {
  AccountProfile,
  AdminSummary,
  AdminUserProfileUpdateResponse,
  AuthUser,
  BusinessTier,
  CreateUserInput,
  CreateUserResponse,
  DriverStop,
  DriverSummary,
  LoginResponse,
  ResetUserPasswordResponse,
  RegisterInput,
  UserRole,
  WorkspaceInvite,
  WorkspaceSummary,
} from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

type RequestOptions = {
  token?: string;
  body?: unknown;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  workspaceId?: string | null;
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
  if (options.workspaceId) {
    headers['X-Workspace-Id'] = options.workspaceId;
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

export async function registerAccount(input: RegisterInput): Promise<LoginResponse> {
  const body: Record<string, string> = {
    email_or_phone: input.emailOrPhone,
    password: input.password,
  };
  if (typeof input.fullName === 'string') {
    const trimmed = input.fullName.trim();
    if (trimmed.length > 0) {
      body.full_name = trimmed;
    }
  }
  if (typeof input.businessName === 'string') {
    const trimmed = input.businessName.trim();
    if (trimmed.length > 0) {
      body.business_name = trimmed;
    }
  }
  const payload = await request<LoginResponse>('/auth/register', {
    body,
  });
  return {
    token: payload.token,
    user: normalizeUser(payload.user),
  };
}

export async function createUser(
  token: string,
  input: CreateUserInput,
  workspaceId?: string | null
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
    workspaceId,
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
  const profile = await request<AccountProfile>('/account/profile', {
    token,
    method: 'GET',
  });
  return normalizeAccountProfile(profile);
}

export async function updateMyProfile(
  token: string,
  profile: { fullName?: string | null; emailOrPhone?: string; businessName?: string | null }
): Promise<AccountProfile> {
  const payload: Record<string, string | null | undefined> = {};
  if (profile.fullName !== undefined) {
    payload.full_name = profile.fullName ?? null;
  }
  if (profile.emailOrPhone !== undefined) {
    payload.email_or_phone = profile.emailOrPhone;
  }
  if (profile.businessName !== undefined) {
    payload.business_name = profile.businessName ?? null;
  }
  const response = await request<AccountProfile>('/account/profile', {
    token,
    method: 'PATCH',
    body: payload,
  });
  return normalizeAccountProfile(response);
}

export async function fetchDrivers(
  token: string,
  workspaceId?: string | null
): Promise<DriverSummary[]> {
  if (!token) {
    return [];
  }
  const response = await request<{ drivers: DriverSummary[] }>('/admin/drivers', {
    token,
    method: 'GET',
    workspaceId,
  });
  return response.drivers ?? [];
}

export async function fetchDevFreeDrivers(token: string): Promise<DriverSummary[]> {
  if (!token) {
    return [];
  }
  const response = await request<{ drivers: DriverSummary[] }>('/dev/free-drivers', {
    token,
    method: 'GET',
  });
  return response.drivers ?? [];
}

export async function fetchAdmins(
  token: string,
  workspaceId?: string | null
): Promise<AdminSummary[]> {
  if (!token) {
    return [];
  }
  const response = await request<{ admins: AdminSummary[] }>('/admin/admins', {
    token,
    method: 'GET',
    workspaceId,
  });
  return response.admins ?? [];
}

export async function fetchDriverStops(
  token: string,
  driverId: string,
  workspaceId?: string | null
): Promise<DriverStop[]> {
  if (!token) {
    return [];
  }
  const response = await request<{ stops: DriverStop[] }>(
    `/admin/driver-stops?driver_id=${encodeURIComponent(driverId)}`,
    {
      token,
      method: 'GET',
      workspaceId,
    }
  );
  return normalizeStops(response.stops ?? []);
}

export async function saveDriverStops(
  token: string,
  driverId: string,
  addresses: string[],
  workspaceId?: string | null
): Promise<DriverStop[]> {
  const response = await request<{ stops: DriverStop[] }>('/admin/driver-stops', {
    token,
    body: {
      driver_id: driverId,
      addresses,
    },
    workspaceId,
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
  userId: string,
  workspaceId?: string | null
): Promise<ResetUserPasswordResponse> {
  return request<ResetUserPasswordResponse>('/admin/users/reset-password', {
    token,
    body: { user_id: userId },
    workspaceId,
  });
}

export async function deleteUserAccount(
  token: string,
  userId: string,
  workspaceId?: string | null
): Promise<void> {
  await request('/admin/users', {
    token,
    method: 'DELETE',
    body: { user_id: userId },
    workspaceId,
  });
}

export async function adminUpdateUserProfile(
  token: string,
  userId: string,
  updates: { fullName?: string | null; emailOrPhone?: string; workspaceId?: string | null },
  scopeWorkspaceId?: string | null
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
  if (Object.prototype.hasOwnProperty.call(updates, 'workspaceId')) {
    payload.workspace_id = updates.workspaceId ?? null;
  }
  return request<AdminUserProfileUpdateResponse>('/admin/users/update-profile', {
    token,
    body: payload,
    workspaceId: scopeWorkspaceId,
  });
}

export async function adminUpdateUserPassword(
  token: string,
  userId: string,
  newPassword: string,
  workspaceId?: string | null
): Promise<void> {
  await request('/admin/users/update-password', {
    token,
    body: {
      user_id: userId,
      new_password: newPassword,
    },
    workspaceId,
  });
}

export async function verifyPassword(token: string, password: string): Promise<void> {
  await request('/account/verify-password', {
    token,
    body: { current_password: password },
  });
}

export async function applyTeamAccessCode(
  token: string,
  code: string
): Promise<LoginResponse> {
  const payload = await request<LoginResponse>('/account/team-access-code', {
    token,
    body: { team_code: code },
  });
  return {
    token: payload.token,
    user: normalizeUser(payload.user),
  };
}

export async function getWorkspaceInvites(
  token: string,
  workspaceId: string
): Promise<WorkspaceInvite[]> {
  const response = await request<{ invites: WorkspaceInvitePayload[] }>('/workspace/invites', {
    token,
    method: 'GET',
    workspaceId,
  });
  return (response.invites ?? []).map(normalizeWorkspaceInvite);
}

export async function createWorkspaceInviteCode(
  token: string,
  workspaceId: string,
  input: { label?: string | null; maxUses?: number | null; expiresAt?: string | null }
): Promise<WorkspaceInvite> {
  const payload = await request<{ invite: WorkspaceInvitePayload }>('/workspace/invites', {
    token,
    body: {
      label: input.label ?? null,
      max_uses: input.maxUses ?? null,
      expires_at: input.expiresAt ?? null,
    },
    workspaceId,
  });
  return normalizeWorkspaceInvite(payload.invite);
}

export async function fetchDevWorkspaces(token: string): Promise<WorkspaceSummary[]> {
  const payload = await request<{ workspaces: WorkspaceRowPayload[] }>('/dev/workspaces', {
    token,
    method: 'GET',
  });
  return (payload.workspaces ?? []).map(normalizeWorkspaceSummary);
}

export async function createDevWorkspace(
  token: string,
  input: { name: string; inviteLabel?: string | null }
): Promise<{ workspace: WorkspaceSummary; invite: WorkspaceInvite }> {
  const payload = await request<{
    workspace: WorkspaceRowPayload;
    invite: WorkspaceInvitePayload;
  }>('/dev/workspaces', {
    token,
    body: { name: input.name, invite_label: input.inviteLabel ?? null },
  });
  return {
    workspace: normalizeWorkspaceSummary(payload.workspace),
    invite: normalizeWorkspaceInvite(payload.invite),
  };
}

export async function deleteDevWorkspace(token: string, workspaceId: string): Promise<void> {
  await request(`/dev/workspaces/${encodeURIComponent(workspaceId)}`, {
    token,
    method: 'DELETE',
  });
}

export async function updateDriverStopLocation(
  token: string,
  stopId: string,
  coordinates: { latitude: number; longitude: number },
  workspaceId?: string | null
): Promise<DriverStop> {
  const response = await request<{ stop: DriverStop }>(
    `/admin/driver-stops/${encodeURIComponent(stopId)}/location`,
    {
      token,
      body: {
        lat: coordinates.latitude,
        lng: coordinates.longitude,
      },
      workspaceId,
    }
  );
  return normalizeStop(response.stop);
}

export async function forgetCachedAddresses(
  token: string,
  addresses: string[],
  workspaceId?: string | null
): Promise<void> {
  if (addresses.length === 0) {
    return;
  }
  await request('/admin/address-cache/forget', {
    token,
    body: { addresses },
    workspaceId,
  });
}

type WorkspaceInvitePayload = {
  id: string;
  workspace_id: string;
  code: string;
  label: string | null;
  max_uses: number | null;
  uses: number | null;
  expires_at: string | null;
  created_at: string;
};

type WorkspaceRowPayload = {
  id: string;
  name: string;
  created_by?: string | null;
  created_at?: string | null;
};

function normalizeUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    fullName: user.fullName ?? null,
    emailOrPhone: user.emailOrPhone ?? null,
    role: normalizeRole(user.role),
    mustChangePassword: Boolean(user.mustChangePassword),
    businessTier: normalizeBusinessTier(user.businessTier),
    businessName: user.businessName ?? null,
    workspaceId: user.workspaceId ?? null,
    tokenExpiresAt: user.tokenExpiresAt,
  };
}

function normalizeRole(role: string): UserRole {
  const normalized = role?.toLowerCase?.() ?? '';
  if (normalized === 'admin') {
    return 'admin';
  }
  if (normalized === 'dev') {
    return 'dev';
  }
  return 'driver';
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

function normalizeBusinessTier(input: string | null | undefined): BusinessTier {
  return input?.toLowerCase() === 'business' ? 'business' : 'free';
}

function normalizeAccountProfile(profile: AccountProfile): AccountProfile {
  return {
    fullName: profile.fullName ?? null,
    emailOrPhone: profile.emailOrPhone ?? null,
    businessName: profile.businessName ?? null,
    businessTier: normalizeBusinessTier(profile.businessTier),
    workspaceId: profile.workspaceId ?? null,
  };
}

function normalizeWorkspaceInvite(invite: WorkspaceInvitePayload): WorkspaceInvite {
  return {
    id: invite.id,
    workspaceId: invite.workspace_id,
    code: invite.code,
    label: invite.label ?? null,
    maxUses: invite.max_uses ?? null,
    uses: invite.uses ?? 0,
    expiresAt: invite.expires_at ?? null,
    createdAt: invite.created_at,
  };
}

function normalizeWorkspaceSummary(row: WorkspaceRowPayload): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}
