import bcrypt from 'bcryptjs';

type UserRole = 'admin' | 'driver' | 'dev';
type BusinessTier = 'free' | 'business';

type Env = {
  MAPBOX_ACCESS_TOKEN?: string;
  JWT_SIGNING_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  SUPABASE_SERVICE_ROLE?: string;
  CORS_ORIGINS?: string;
};

type Pin = {
  id: string;
  address: string;
  lat: number;
  lng: number;
};

type NormalizeResult =
  | { type: 'ok'; addresses: string[] }
  | { type: 'error'; response: Response };

type GeocodeSuccess = {
  address: string;
  lat: number;
  lng: number;
};

type GeocodeFailure = {
  address: string;
  message: string;
};

type GeocodeResult =
  | { type: 'ok'; stops: GeocodeSuccess[] }
  | { type: 'error'; response: Response };

type JwtClaims = {
  sub: string;
  role: UserRole;
  full_name?: string | null;
  email_or_phone?: string | null;
  must_change_password?: boolean | null;
  business_tier?: BusinessTier | null;
  business_name?: string | null;
  workspace_id?: string | null;
  exp: number;
  iat: number;
};

type AuthenticatedUser = {
  id: string;
  role: UserRole;
  name: string | null;
  emailOrPhone: string | null;
  mustChangePassword: boolean;
  businessTier: BusinessTier;
  businessName: string | null;
  workspaceId: string | null;
  token: string;
  exp: number;
  claims: JwtClaims;
};

type AuthResponsePayload = {
  token: string;
  user: {
    id: string;
    fullName: string | null;
    emailOrPhone: string | null;
    role: UserRole;
    mustChangePassword: boolean;
    businessTier: BusinessTier;
    businessName: string | null;
    workspaceId: string | null;
    tokenExpiresAt: number;
  };
};

type RouteContext = {
  authUser: AuthenticatedUser | null;
  authError?: 'TOKEN_INVALID' | 'TOKEN_EXPIRED';
};

type SupabaseUserRow = {
  id: string;
  full_name: string | null;
  email_or_phone: string;
  password_hash: string;
  role: UserRole;
  status?: string | null;
  must_change_password?: boolean | null;
  business_tier?: BusinessTier | null;
  business_name?: string | null;
  workspace_id?: string | null;
};

type SupabaseInsertPayload = {
  id: string;
  full_name: string | null;
  email_or_phone: string;
  role: UserRole;
  status: string;
  password_hash: string;
  must_change_password: boolean;
  business_tier: BusinessTier;
  business_name: string | null;
  workspace_id: string | null;
};

type DriverStopRow = {
  id: string;
  driver_id: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  sort_order: number | null;
  status: string | null;
  workspace_id?: string | null;
};

type DriverStopView = {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  sortOrder: number | null;
  status: 'pending' | 'complete';
};

type UsageEventRow = {
  address_count: number | null;
  created_at: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  created_by?: string | null;
  created_at?: string;
};

type WorkspaceInviteRow = {
  id: string;
  workspace_id: string;
  code: string;
  label: string | null;
  max_uses: number | null;
  uses: number | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
};

type WorkspaceSummary = WorkspaceRow & {
  invite_count?: number;
};

const MAX_ADDRESSES = 150;
const DEFAULT_ADMIN_IDENTIFIER = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'AdminPass';
const MAPBOX_BATCH_LIMIT = 1000;
const MAPBOX_FORWARD_ENDPOINT =
  'https://api.mapbox.com/search/geocode/v6/forward?limit=1';
const SESSION_EXPIRATION_SECONDS = 60 * 60 * 24 * 365 * 10; // ~10 years for trusted devices
const MAPBOX_BATCH_ENDPOINT =
  'https://api.mapbox.com/search/geocode/v6/batch';
const FREE_TIER_DAILY_LIMIT = 30;
const FREE_TIER_WINDOW_MS = 1000 * 60 * 60 * 24;
const USAGE_TABLE = 'address_usage_events';
const WORKSPACE_TABLE = 'workspaces';
const WORKSPACE_INVITE_TABLE = 'workspace_invites';
const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const INVITE_CODE_LENGTH = 8;

const BASE_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
};

const STATUS_ACTIVE = 'active';
const STATUS_DEV_ACTIVE = 'dev-active';

const ADMIN_EQUIVALENT_ROLES: UserRole[] = ['admin', 'dev'];

function normalizeStatus(status?: string | null): string {
  return (status ?? STATUS_ACTIVE).toLowerCase();
}

function isDevStatus(status?: string | null): boolean {
  return normalizeStatus(status) === STATUS_DEV_ACTIVE;
}

function isAllowedStatus(status?: string | null): boolean {
  const normalized = normalizeStatus(status);
  return normalized === STATUS_ACTIVE || normalized === STATUS_DEV_ACTIVE;
}

function deriveUserRole(user: SupabaseUserRow): UserRole {
  if (isDevStatus(user.status)) {
    return 'dev';
  }
  if (user.role === 'admin') {
    return 'admin';
  }
  return 'driver';
}

function isRoleAllowed(role: UserRole, allowedRoles: UserRole[]): boolean {
  if (allowedRoles.includes(role)) {
    return true;
  }
  if (role === 'dev' && allowedRoles.includes('admin')) {
    return true;
  }
  return false;
}

function extractWorkspaceOverride(request?: Request): string | null {
  if (!request) {
    return null;
  }
  const headerValue = request.headers.get('x-workspace-id');
  if (headerValue && headerValue.trim().length > 0) {
    return headerValue.trim();
  }
  const url = new URL(request.url);
  const queryValue = url.searchParams.get('workspace_id');
  if (queryValue && queryValue.trim().length > 0) {
    return queryValue.trim();
  }
  return null;
}

function resolveWorkspaceId(context: RouteContext, request?: Request): string | null {
  const authUser = context.authUser;
  if (!authUser) {
    return null;
  }
  if (authUser.role === 'dev') {
    return extractWorkspaceOverride(request) ?? authUser.workspaceId ?? null;
  }
  return authUser.workspaceId ?? null;
}

function canAccessWorkspace(context: RouteContext, targetWorkspaceId: string | null): boolean {
  const authUser = context.authUser;
  if (!authUser) {
    return false;
  }
  if (authUser.role === 'dev') {
    return true;
  }
  if (!authUser.workspaceId || !targetWorkspaceId) {
    return false;
  }
  return authUser.workspaceId === targetWorkspaceId;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = parseCorsOrigins(env.CORS_ORIGINS ?? '*');
    const requestOrigin = request.headers.get('Origin');
    const corsOrigin = resolveCorsOrigin(requestOrigin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      return handlePreflight(request, corsOrigin);
    }

    const respond = (data: unknown, status = 200) =>
      jsonResponse(data, status, corsOrigin);

    const routeContext = await applyAuthMiddleware(request, env);
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return respond({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/auth/login') {
      return handleAuthLogin(request, env, respond);
    }

    if (request.method === 'POST' && url.pathname === '/auth/register') {
      return handleAuthRegister(request, env, respond);
    }

    if (request.method === 'POST' && url.pathname === '/admin/create-user') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminCreateUser(request, env, respond, routeContext)
      );
    }

    if (request.method === 'GET' && url.pathname === '/admin/admins') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminListAdmins(env, respond, routeContext, request)
      );
    }

    if (request.method === 'GET' && url.pathname === '/admin/drivers') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminListDrivers(env, respond, routeContext, request)
      );
    }

    if (request.method === 'GET' && url.pathname === '/admin/driver-stops') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminGetDriverStops(request, env, respond, routeContext)
      );
    }

    const driverStopLocationMatch =
      request.method === 'POST'
        ? url.pathname.match(/^\/admin\/driver-stops\/([^/]+)\/location$/)
        : null;
    if (driverStopLocationMatch) {
      const stopId = driverStopLocationMatch[1];
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminUpdateDriverStopLocation(request, env, respond, routeContext, stopId)
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/driver-stops') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminReplaceDriverStops(request, env, respond, routeContext)
      );
    }

    if (request.method === 'GET' && url.pathname === '/admin/driver-lookup') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminFindDriver(request, env, respond, routeContext)
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/users/reset-password') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminResetUserPassword(request, env, respond, routeContext)
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/users/update-profile') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminUpdateUserProfile(request, env, respond, routeContext)
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/users/update-password') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminUpdateUserPassword(request, env, respond, routeContext)
      );
    }

    if (request.method === 'DELETE' && url.pathname === '/admin/users') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminDeleteUser(request, env, respond, routeContext)
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/users/kick') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminKickUser(request, env, respond, routeContext)
      );
    }

    if (request.method === 'POST' && url.pathname === '/auth/change-password') {
      return requireAuth(routeContext, respond, ['admin', 'driver'], () =>
        handleAuthChangePassword(request, env, respond, routeContext)
      );
    }

    if (request.method === 'POST' && url.pathname === '/account/verify-password') {
      return requireAuth(routeContext, respond, ['admin', 'driver'], () =>
        handleAccountVerifyPassword(request, env, respond, routeContext)
      );
    }

    if (request.method === 'DELETE' && url.pathname === '/account/data') {
      return requireAuth(routeContext, respond, ['admin', 'driver'], () =>
        handleAccountDeleteData(env, respond, routeContext)
      );
    }

    if (request.method === 'DELETE' && url.pathname === '/account') {
      return requireAuth(routeContext, respond, ['admin', 'driver'], () =>
        handleAccountDeleteAccount(env, respond, routeContext)
      );
    }

    if (request.method === 'GET' && url.pathname === '/account/profile') {
      return requireAuth(routeContext, respond, ['admin', 'driver'], () =>
        handleAccountGetProfile(env, respond, routeContext)
      );
    }

    if (request.method === 'PATCH' && url.pathname === '/account/profile') {
      return requireAuth(routeContext, respond, ['admin', 'driver'], () =>
        handleAccountUpdateProfile(request, env, respond, routeContext)
      );
    }

    if (request.method === 'GET' && url.pathname === '/workspace/invites') {
      return respond({ error: 'INVITES_DISABLED' }, 410);
    }

    if (request.method === 'POST' && url.pathname === '/workspace/invites') {
      return respond({ error: 'INVITES_DISABLED' }, 410);
    }

    if (request.method === 'DELETE' && url.pathname === '/admin/workspaces') {
      return requireAuth(routeContext, respond, ['admin', 'dev'], () =>
        handleAdminDeleteWorkspace(request, env, respond, routeContext)
      );
    }

    if (request.method === 'GET' && url.pathname === '/dev/workspaces') {
      return requireAuth(routeContext, respond, ['dev'], () =>
        handleDevListWorkspaces(env, respond)
      );
    }

    if (request.method === 'GET' && url.pathname === '/dev/free-drivers') {
      return requireAuth(routeContext, respond, ['dev'], () =>
        handleDevListFreeDrivers(env, respond)
      );
    }

    if (request.method === 'GET' && url.pathname === '/dev/users') {
      return requireAuth(routeContext, respond, ['dev'], () =>
        handleDevListUsers(env, respond)
      );
    }

    if (request.method === 'POST' && url.pathname === '/dev/workspaces') {
      return requireAuth(routeContext, respond, ['dev'], () =>
        handleDevCreateWorkspace(request, env, respond, routeContext)
      );
    }

    if (request.method === 'DELETE' && /^\/dev\/workspaces\/[^/]+$/.test(url.pathname)) {
      return requireAuth(routeContext, respond, ['dev'], () =>
        handleDevDeleteWorkspace(request, env, respond, routeContext)
      );
    }

    if (request.method === 'POST' && url.pathname === '/dev/impersonate') {
      return requireAuth(routeContext, respond, ['dev'], () =>
        handleDevImpersonate(request, env, respond, routeContext)
      );
    }

    if (request.method === 'POST' && url.pathname === '/account/team-access-code') {
      return respond({ error: 'INVITES_DISABLED' }, 410);
    }

    if (request.method === 'GET' && url.pathname === '/driver/stops') {
      return requireAuth(routeContext, respond, ['driver', 'admin'], () =>
        handleDriverListStops(request, env, respond, routeContext)
      );
    }

    if (
      request.method === 'POST' &&
      /^\/driver\/stops\/[^/]+\/(complete|undo)$/.test(url.pathname)
    ) {
      return requireAuth(routeContext, respond, ['driver', 'admin'], () =>
        handleDriverStopStatusUpdate(request, env, respond, routeContext)
      );
    }

    if (request.method === 'POST' && url.pathname === '/geocode') {
      return requireAuth(routeContext, respond, ['admin', 'driver'], () =>
        handleGeocode(request, env, respond, routeContext)
      );
    }

    return respond({ error: 'NOT_FOUND' }, 404);
  },
};

async function handleGeocode(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.MAPBOX_ACCESS_TOKEN) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'MAPBOX_ACCESS_TOKEN is not configured.',
      },
      500
    );
  }

  const normalizeResult = await normalizeAddresses(request);
  if (normalizeResult.type === 'error') {
    return normalizeResult.response;
  }

  const addresses = normalizeResult.addresses;

  if (addresses.length === 0) {
    return respond(
      { error: 'INVALID_INPUT', message: 'Provide at least one address.' },
      400
    );
  }

  if (addresses.length > MAX_ADDRESSES) {
    return respond(
      {
        error: 'TOO_MANY_ADDRESSES',
        message: `Limit is ${MAX_ADDRESSES} addresses per request.`,
      },
      400
    );
  }

  if (addresses.length > MAPBOX_BATCH_LIMIT) {
    return respond(
      {
        error: 'TOO_MANY_ADDRESSES_FOR_BATCH',
        message: `Mapbox batch geocoding accepts up to ${MAPBOX_BATCH_LIMIT} addresses.`,
      },
      400
    );
  }

  const authUser = context.authUser;
  if (!authUser) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }

  if (authUser.businessTier !== 'business') {
    const limitCheck = await enforceFreeTierLimit(env, authUser.id, addresses.length);
    if (!limitCheck.allowed) {
      return respond(
        {
          error: 'FREE_TIER_LIMIT_REACHED',
          message: limitCheck.message,
          limit: limitCheck.limit,
          used: limitCheck.used,
          resetsAt: limitCheck.resetsAt,
        },
        429
      );
    }
  }

  const geocodeResult = await geocodeAddresses(addresses, env.MAPBOX_ACCESS_TOKEN);
  if (geocodeResult.type === 'error') {
    return geocodeResult.response;
  }

  const pins: Pin[] = geocodeResult.stops.map((stop, index) => ({
    id: String(index + 1),
    address: stop.address,
    lat: stop.lat,
    lng: stop.lng,
  }));

  if (authUser.businessTier !== 'business') {
    try {
      await recordUsageEvent(env, authUser.id, addresses.length);
    } catch (error) {
      console.warn('Failed to record usage event', error);
    }
  }

  return respond({ pins });
}

async function handleAuthLogin(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE) || !env.JWT_SIGNING_KEY) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase or JWT configuration is incomplete.',
      },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!identifier || !password) {
    return respond(
      { error: 'INVALID_INPUT', message: 'Identifier and password are required.' },
      400
    );
  }

  let user: SupabaseUserRow | null = null;
  try {
    user = await fetchUserByIdentifier(env, identifier);
  } catch (error) {
    console.error('Failed to fetch user during login', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!user) {
    if (identifier.toLowerCase() === DEFAULT_ADMIN_IDENTIFIER.toLowerCase()) {
      try {
        const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
        const payload: SupabaseInsertPayload = {
          id: crypto.randomUUID(),
          full_name: 'Admin',
          email_or_phone: DEFAULT_ADMIN_IDENTIFIER,
          role: 'admin',
          status: 'active',
          password_hash: passwordHash,
          must_change_password: false,
          workspace_id: null,
        };
        await supabaseInsert(env, 'users', payload);
        user = await fetchUserById(env, payload.id);
      } catch (seedError) {
        console.error('Failed to seed default admin account', seedError);
      }
    }
    if (!user) {
      return respond({ error: 'INVALID_CREDENTIALS' }, 401);
    }
  }

  if (!isAllowedStatus(user.status)) {
    return respond({ error: 'USER_INACTIVE' }, 403);
  }

  const passwordValid = await verifyPassword(password, user.password_hash);
  if (!passwordValid) {
    return respond({ error: 'INVALID_CREDENTIALS' }, 401);
  }

  try {
    const session = await buildSessionPayload(user, env);
    return respond(session);
  } catch (error) {
    console.error('Failed to create auth session', error);
    return respond({ error: 'AUTH_ERROR' }, 500);
  }
}

async function handleAuthRegister(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE) || !env.JWT_SIGNING_KEY) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase or JWT configuration is incomplete.',
      },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const fullNameInput = typeof body?.full_name === 'string' ? body.full_name.trim() : '';
  const businessNameInput =
    typeof body?.business_name === 'string' ? body.business_name.trim() : '';
  const emailOrPhone = typeof body?.email_or_phone === 'string' ? body.email_or_phone.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!emailOrPhone) {
    return respond(
      { error: 'INVALID_IDENTIFIER', message: 'Email or phone is required.' },
      400
    );
  }

  if (!password || password.length < 8) {
    return respond(
      {
        error: 'WEAK_PASSWORD',
        message: 'Choose a password with at least 8 characters.',
      },
      400
    );
  }

  let existing: SupabaseUserRow | null = null;
  try {
    existing = await fetchUserByIdentifier(env, emailOrPhone);
  } catch (error) {
    console.error('Failed to check for existing user during registration', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (existing) {
    return respond(
      {
        error: 'USER_EXISTS',
        message: 'An account already exists for this email or phone number.',
      },
      409
    );
  }

  const passwordHash = await hashPassword(password);
  const payload: SupabaseInsertPayload = {
    id: crypto.randomUUID(),
    full_name: fullNameInput.length > 0 ? fullNameInput : null,
    email_or_phone: emailOrPhone,
    role: 'driver',
    status: STATUS_ACTIVE,
    password_hash: passwordHash,
    must_change_password: false,
    business_tier: 'free',
    business_name: businessNameInput.length > 0 ? businessNameInput : null,
    workspace_id: null,
  };

  try {
    await supabaseInsert(env, 'users', payload);
  } catch (error) {
    console.error('Failed to register user', error);
    return respond({ error: 'USER_CREATE_FAILED' }, 500);
  }

  let created: SupabaseUserRow | null = null;
  try {
    created = await fetchUserByIdentifier(env, emailOrPhone);
  } catch (error) {
    console.error('Failed to load created user', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!created) {
    return respond(
      {
        error: 'USER_NOT_FOUND',
        message: 'Account created but could not be loaded. Try signing in.',
      },
      500
    );
  }

  try {
    const session = await buildSessionPayload(created, env);
    return respond(session, 201);
  } catch (error) {
    console.error('Failed to create session after registration', error);
    return respond({ error: 'AUTH_ERROR' }, 500);
  }
}

async function handleAdminCreateUser(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : '';
  const emailOrPhone = typeof body?.email_or_phone === 'string' ? body.email_or_phone.trim() : '';
  const roleInput = typeof body?.role === 'string' ? body.role.trim().toLowerCase() : 'driver';
  const businessNameInput =
    typeof body?.business_name === 'string' ? body.business_name.trim() : '';
  const businessTierInput =
    typeof body?.business_tier === 'string' ? body.business_tier.trim().toLowerCase() : '';
  let role: UserRole;
  if (roleInput === 'admin') {
    role = 'admin';
  } else if (roleInput === 'dev') {
    role = 'dev';
  } else {
    role = 'driver';
  }
  const savedRole: UserRole = role === 'dev' ? 'admin' : role;
  const statusValue = role === 'dev' ? STATUS_DEV_ACTIVE : STATUS_ACTIVE;

  if (!fullName) {
    return respond(
      { error: 'INVALID_FULL_NAME', message: 'Full name is required.' },
      400
    );
  }
  if (!emailOrPhone) {
    return respond(
      { error: 'INVALID_IDENTIFIER', message: 'Email or phone is required.' },
      400
    );
  }

  try {
    const existing = await fetchUserByIdentifier(env, emailOrPhone);
    if (existing) {
      return respond(
        { error: 'USER_EXISTS', message: 'An account already exists for this identifier.' },
        409
      );
    }
  } catch (error) {
    console.error('Failed to check existing user', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  const workspaceId = resolveWorkspaceId(context, request);
  if (!workspaceId) {
    const authUser = context.authUser;
    if (authUser?.role === 'dev') {
      return respond(
        {
          error: 'WORKSPACE_REQUIRED',
          message: 'Provide a workspace_id via header or query parameter.',
        },
        400
      );
    }
    return respond(
      {
        error: 'WORKSPACE_REQUIRED',
        message: 'Join or create a workspace before creating users.',
      },
      409
    );
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const payload: SupabaseInsertPayload = {
    id: crypto.randomUUID(),
    full_name: fullName,
    email_or_phone: emailOrPhone,
    role: savedRole,
    status: statusValue,
    password_hash: passwordHash,
    must_change_password: false,
    business_tier: businessTierInput === 'free' ? 'free' : 'business',
    business_name: businessNameInput.length > 0 ? businessNameInput : null,
    workspace_id: workspaceId,
  };

  try {
    await supabaseInsert(env, 'users', payload);
  } catch (error) {
    console.error('Failed to create user', error);
    return respond({ error: 'USER_CREATE_FAILED' }, 500);
  }

  return respond({ status: 'ok', tempPassword, role });
}

async function handleAdminResetUserPassword(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  if (!userId) {
    return respond(
      { error: 'INVALID_USER_ID', message: 'user_id is required.' },
      400
    );
  }

  let user: SupabaseUserRow | null = null;
  try {
    user = await fetchUserById(env, userId);
  } catch (error) {
    console.error('Failed to fetch user for password reset', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!user) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  if (!canAccessWorkspace(context, user.workspace_id ?? null)) {
    return respond({ error: 'FORBIDDEN' }, 403);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  try {
    await updateUserPassword(env, user.id, passwordHash, true);
  } catch (error) {
    console.error('Failed to reset user password', error);
    return respond({ error: 'PASSWORD_RESET_FAILED' }, 500);
  }

  return respond({ status: 'ok', tempPassword, role: deriveUserRole(user) });
}

async function handleAdminDeleteUser(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  if (!userId) {
    return respond(
      { error: 'INVALID_USER_ID', message: 'user_id is required.' },
      400
    );
  }

  let user: SupabaseUserRow | null = null;
  try {
    user = await fetchUserById(env, userId);
  } catch (error) {
    console.error('Failed to fetch user for delete', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!user) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  if (!canAccessWorkspace(context, user.workspace_id ?? null)) {
    return respond({ error: 'FORBIDDEN' }, 403);
  }

  // Soft removal: demote to driver within the same workspace, keep account/searchable
  try {
    await updateUserProfile(env, user.id, {
      role: 'driver',
      status: STATUS_ACTIVE,
      workspace_id: null,
      business_tier: 'free',
      business_name: null,
    });
    try {
      await clearUserCreatorReferences(env, user.id);
    } catch (cleanupError) {
      console.error('Failed to clear creator references during soft delete', cleanupError);
    }
    try {
      await deleteDriverStopsRecords(env, user.id);
    } catch (stopError) {
      console.error('Failed to clear driver stops during soft delete', stopError);
    }
    return respond({ status: 'ok', mode: 'soft-removed' });
  } catch (error) {
    console.error('Failed to soft-remove user', error);
    return respond({ error: 'USER_DELETE_FAILED' }, 500);
  }
}

async function handleAdminKickUser(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  if (!userId) {
    return respond(
      { error: 'INVALID_USER_ID', message: 'user_id is required.' },
      400
    );
  }

  let user: SupabaseUserRow | null = null;
  try {
    user = await fetchUserById(env, userId);
  } catch (error) {
    console.error('Failed to fetch user for kick', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!user) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  if (!canAccessWorkspace(context, user.workspace_id ?? null)) {
    return respond({ error: 'FORBIDDEN' }, 403);
  }

  try {
    await updateUserProfile(env, user.id, {
      role: 'driver',
      status: STATUS_ACTIVE,
      workspace_id: null,
      business_tier: 'free',
      business_name: null,
    });
    try {
      await deleteDriverStopsRecords(env, user.id);
    } catch (stopError) {
      console.error('Failed to clear driver stops during kick', stopError);
    }
    return respond({ status: 'ok', mode: 'kicked' });
  } catch (error) {
    console.error('Failed to kick user', error);
    return respond({ error: 'USER_DELETE_FAILED' }, 500);
  }
}

async function handleAdminUpdateUserProfile(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const workspaceScope = resolveWorkspaceId(context, request);
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  if (!userId) {
    return respond({ error: 'INVALID_USER_ID', message: 'user_id is required.' }, 400);
  }

  const fullNameInput =
    typeof body?.full_name === 'string' ? body.full_name.trim() : undefined;
  const emailInput =
    typeof body?.email_or_phone === 'string' ? body.email_or_phone.trim() : undefined;
  const roleProvided =
    body !== null && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'role');
  const roleInput =
    typeof body?.role === 'string' ? body.role.trim().toLowerCase() : undefined;
  const workspaceUpdateProvided =
    body !== null && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'workspace_id');
  let workspaceIdInput: string | null | undefined;
  if (workspaceUpdateProvided) {
    if (body.workspace_id === null) {
      workspaceIdInput = null;
    } else if (typeof body.workspace_id === 'string') {
      const trimmedWorkspace = body.workspace_id.trim();
      workspaceIdInput = trimmedWorkspace.length > 0 ? trimmedWorkspace : null;
    } else {
      return respond(
        {
          error: 'INVALID_WORKSPACE_ID',
          message: 'workspace_id must be a string or null.',
        },
        400
      );
    }
  }

  if (
    !workspaceUpdateProvided &&
    !roleProvided &&
    (fullNameInput === undefined || fullNameInput === null) &&
    (emailInput === undefined || emailInput === null)
  ) {
    return respond(
      {
        error: 'INVALID_INPUT',
        message: 'Provide full_name, email_or_phone, workspace_id, or role to update.',
      },
      400
    );
  }

  let user: SupabaseUserRow | null = null;
  try {
    user = await fetchUserById(env, userId);
  } catch (error) {
    console.error('Failed to fetch user for profile update', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!user) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  const canAccessCurrentWorkspace = canAccessWorkspace(context, user.workspace_id ?? null);
  const canAccessScopedWorkspace =
    user.workspace_id === null && workspaceScope ? canAccessWorkspace(context, workspaceScope) : false;

  if (!canAccessCurrentWorkspace && !canAccessScopedWorkspace) {
    return respond({ error: 'FORBIDDEN' }, 403);
  }

  const updates: {
    full_name?: string | null;
    email_or_phone?: string;
    business_name?: string | null;
    business_tier?: BusinessTier;
    workspace_id?: string | null;
    role?: UserRole;
    status?: string;
  } = {};
  if (workspaceUpdateProvided) {
    if (context.authUser.role !== 'dev') {
      return respond({ error: 'FORBIDDEN' }, 403);
    }
    if (workspaceIdInput) {
      let targetWorkspace: WorkspaceRow | null = null;
      try {
        targetWorkspace = await fetchWorkspaceById(env, workspaceIdInput);
      } catch (error) {
        console.error('Failed to fetch workspace for reassignment', error);
        return respond({ error: 'WORKSPACE_LOOKUP_FAILED' }, 500);
      }
      if (!targetWorkspace) {
        return respond({ error: 'WORKSPACE_NOT_FOUND' }, 404);
      }
      updates.workspace_id = targetWorkspace.id;
      updates.business_tier = 'business';
      updates.business_name = targetWorkspace.name ?? user.business_name ?? null;
    } else {
      updates.workspace_id = null;
      updates.business_tier = 'free';
      updates.business_name = null;
    }
  }

  if (fullNameInput !== undefined) {
    updates.full_name = fullNameInput.length === 0 ? null : fullNameInput;
  }

  if (emailInput !== undefined) {
    if (!emailInput) {
      return respond(
        {
          error: 'INVALID_IDENTIFIER',
          message: 'Email or phone cannot be empty.',
        },
        400
      );
    }

    try {
      const existing = await fetchUserByIdentifier(env, emailInput);
      if (existing && existing.id !== userId) {
        return respond(
          {
            error: 'USER_EXISTS',
            message: 'Another account already uses this identifier.',
          },
          409
        );
      }
    } catch (error) {
      console.error('Failed to check identifier uniqueness', error);
      return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
    }

    updates.email_or_phone = emailInput;
  }

  if (roleProvided) {
    if (!roleInput) {
      return respond(
        { error: 'INVALID_ROLE', message: 'role must be admin, driver, or dev.' },
        400
      );
    }
    if (roleInput === 'dev') {
      if (context.authUser.role !== 'dev') {
        return respond({ error: 'FORBIDDEN' }, 403);
      }
      updates.role = 'admin';
      updates.status = STATUS_DEV_ACTIVE;
    } else if (roleInput === 'admin') {
      updates.role = 'admin';
      updates.status = STATUS_ACTIVE;
    } else if (roleInput === 'driver') {
      updates.role = 'driver';
      updates.status = STATUS_ACTIVE;
    } else {
      return respond(
        { error: 'INVALID_ROLE', message: 'role must be admin, driver, or dev.' },
        400
      );
    }

    if (!workspaceUpdateProvided && user.workspace_id === null && workspaceScope) {
      updates.workspace_id = workspaceScope;
    }
  }

  try {
    const updated = await updateUserProfile(env, userId, updates);
    return respond({
      status: 'ok',
      user: {
        id: updated.id,
        fullName: updated.full_name,
        emailOrPhone: updated.email_or_phone,
        role: deriveUserRole(updated),
      },
    });
  } catch (error) {
    console.error('Failed to update user profile', error);
    return respond({ error: 'USER_PROFILE_UPDATE_FAILED' }, 500);
  }
}

async function handleAdminUpdateUserPassword(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';

  if (!userId) {
    return respond(
      { error: 'INVALID_USER_ID', message: 'user_id is required.' },
      400
    );
  }

  if (!newPassword || newPassword.length < 8) {
    return respond(
      {
        error: 'INVALID_NEW_PASSWORD',
        message: 'New password must be at least 8 characters long.',
      },
      400
    );
  }

  let user: SupabaseUserRow | null = null;
  try {
    user = await fetchUserById(env, userId);
  } catch (error) {
    console.error('Failed to fetch user for admin password update', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!user) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  if (!canAccessWorkspace(context, user.workspace_id ?? null)) {
    return respond({ error: 'FORBIDDEN' }, 403);
  }

  const hash = await hashPassword(newPassword);

  try {
    await updateUserPassword(env, user.id, hash, true);
  } catch (error) {
    console.error('Failed to update user password (admin)', error);
    return respond({ error: 'PASSWORD_UPDATE_FAILED' }, 500);
  }

  return respond({ status: 'ok' });
}

async function handleAdminListDrivers(
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext,
  request: Request
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  const workspaceId = resolveWorkspaceId(context, request);
  if (!workspaceId) {
    return respond(
      {
        error: 'WORKSPACE_REQUIRED',
        message: 'Select a workspace to view drivers.',
      },
      400
    );
  }

  try {
    const drivers = await fetchDrivers(env, workspaceId);
    return respond({ drivers });
  } catch (error) {
    console.error('Failed to list drivers', error);
    return respond({ error: 'DRIVER_LIST_FAILED' }, 500);
  }
}

async function handleAdminListAdmins(
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext,
  request: Request
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  const workspaceId = resolveWorkspaceId(context, request);
  if (!workspaceId) {
    return respond(
      {
        error: 'WORKSPACE_REQUIRED',
        message: 'Select a workspace to view admins.',
      },
      400
    );
  }

  try {
    const admins = await fetchAdmins(env, workspaceId);
    return respond({ admins });
  } catch (error) {
    console.error('Failed to list admins', error);
    return respond({ error: 'ADMIN_LIST_FAILED' }, 500);
  }
}

async function handleAdminFindDriver(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  const url = new URL(request.url);
  const identifier = url.searchParams.get('identifier')?.trim();
  if (!identifier) {
    return respond({ error: 'INVALID_IDENTIFIER', message: 'identifier is required.' }, 400);
  }

  let user: SupabaseUserRow | null = null;
  try {
    user = await fetchUserByIdentifier(env, identifier);
  } catch (error) {
    console.error('Failed to lookup driver by identifier', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!user) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  const role = deriveUserRole(user);
  if (role !== 'driver') {
    return respond({ error: 'NOT_DRIVER' }, 400);
  }

  const adminWorkspaceId = resolveWorkspaceId(context, request);
  const targetWorkspaceId = user.workspace_id ?? null;

  if (context.authUser?.role !== 'dev') {
    // Admins can see drivers in their workspace or free-tier (null workspace)
    const allowed =
      targetWorkspaceId === null || (adminWorkspaceId !== null && adminWorkspaceId === targetWorkspaceId);
    if (!allowed) {
      return respond({ error: 'FORBIDDEN' }, 403);
    }
  }

  let workspaceName: string | null = null;
  if (targetWorkspaceId) {
    try {
      const ws = await fetchWorkspaceById(env, targetWorkspaceId);
      workspaceName = ws?.name ?? null;
    } catch (error) {
      console.error('Failed to fetch workspace for driver lookup', error);
    }
  }

  return respond({
    driver: {
      id: user.id,
      fullName: user.full_name,
      emailOrPhone: user.email_or_phone,
      workspaceId: targetWorkspaceId,
      workspaceName,
    },
  });
}

async function handleAdminGetDriverStops(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  const url = new URL(request.url);
  const driverId = url.searchParams.get('driver_id')?.trim();

  if (!driverId) {
    return respond({ error: 'INVALID_DRIVER_ID', message: 'driver_id is required.' }, 400);
  }

  try {
    const driver = await fetchUserById(env, driverId);
    if (!driver || driver.role !== 'driver') {
      return respond({ error: 'DRIVER_NOT_FOUND' }, 404);
    }

    if (!canAccessWorkspace(context, driver.workspace_id ?? null)) {
      return respond({ error: 'FORBIDDEN' }, 403);
    }

    const stops = await fetchDriverStops(env, driverId, driver.workspace_id ?? null);
    return respond({ stops });
  } catch (error) {
    console.error('Failed to fetch driver stops', error);
    return respond({ error: 'DRIVER_STOPS_FAILED' }, 500);
  }
}

async function handleAdminDeleteWorkspace(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      { error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id.trim() : '';
  if (!workspaceId) {
    return respond({ error: 'INVALID_WORKSPACE_ID', message: 'workspace_id is required.' }, 400);
  }

  let workspace: WorkspaceRow | null = null;
  try {
    workspace = await fetchWorkspaceById(env, workspaceId);
  } catch (error) {
    console.error('Failed to fetch workspace for delete (admin)', error);
    return respond({ error: 'WORKSPACE_LOOKUP_FAILED' }, 500);
  }

  if (!workspace) {
    return respond({ error: 'WORKSPACE_NOT_FOUND' }, 404);
  }

  const isDev = context.authUser?.role === 'dev';
  const canDelete =
    isDev || (context.authUser?.role === 'admin' && context.authUser.workspaceId === workspaceId);
  if (!canDelete) {
    return respond({ error: 'FORBIDDEN' }, 403);
  }

  try {
    await releaseWorkspaceUsers(env, workspaceId);
    await clearWorkspaceDriverStops(env, workspaceId);
    await deleteWorkspaceInvites(env, workspaceId);
    await deleteWorkspaceById(env, workspaceId);
    return respond({
      status: 'ok',
      workspace: {
        id: workspace.id,
        name: workspace.name,
        createdBy: workspace.created_by ?? null,
        createdAt: workspace.created_at ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to delete workspace (admin)', error);
    return respond({ error: 'WORKSPACE_DELETE_FAILED' }, 500);
  }
}

async function handleAdminReplaceDriverStops(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const driverId = typeof body?.driver_id === 'string' ? body.driver_id.trim() : '';
  const addresses = extractAddressesFromPayload(body);

  if (!driverId) {
    return respond({ error: 'INVALID_DRIVER_ID', message: 'driver_id is required.' }, 400);
  }
  if (!addresses) {
    return respond({ error: 'INVALID_INPUT', message: 'addresses payload is required.' }, 400);
  }

  if (addresses.length > MAX_ADDRESSES) {
    return respond(
      {
        error: 'TOO_MANY_ADDRESSES',
        message: `Limit is ${MAX_ADDRESSES} addresses per request.`,
      },
      400
    );
  }

  let driver: SupabaseUserRow | null = null;
  try {
    driver = await fetchUserById(env, driverId);
  } catch (error) {
    console.error('Failed to look up driver', error);
    return respond({ error: 'DRIVER_LOOKUP_FAILED' }, 500);
  }
  if (!driver || driver.role !== 'driver') {
    return respond({ error: 'DRIVER_NOT_FOUND' }, 404);
  }

  if (!canAccessWorkspace(context, driver.workspace_id ?? null)) {
    return respond({ error: 'FORBIDDEN' }, 403);
  }

  try {
    const currentStops = await fetchDriverStops(env, driverId, driver.workspace_id ?? null);
    const knownByAddress = new Map(
      currentStops.map((stop) => [stop.address.trim().toLowerCase(), stop])
    );

    const needsGeocode: string[] = [];
    const stopsPayload: GeocodeSuccess[] = addresses.map((address, index) => {
      const key = address.trim().toLowerCase();
      const existing = knownByAddress.get(key);
      if (existing && typeof existing.lat === 'number' && typeof existing.lng === 'number') {
        return {
          address,
          lat: existing.lat,
          lng: existing.lng,
        };
      }
      needsGeocode.push(address);
      return {
        address,
        lat: DEFAULT_COORDINATE.latitude,
        lng: DEFAULT_COORDINATE.longitude,
      };
    });

    if (needsGeocode.length > 0) {
      if (!env.MAPBOX_ACCESS_TOKEN) {
        return respond(
          { error: 'CONFIG_ERROR', message: 'Mapbox token is required to geocode new addresses.' },
          500
        );
      }
      const geocodeResult = await geocodeAddresses(needsGeocode, env.MAPBOX_ACCESS_TOKEN);
      if (geocodeResult.type === 'error') {
        return geocodeResult.response;
      }
      const geoByAddress = new Map(
        geocodeResult.stops.map((stop) => [stop.address.trim().toLowerCase(), stop])
      );
      const merged: GeocodeSuccess[] = [];
      for (const stop of stopsPayload) {
        const geo = geoByAddress.get(stop.address.trim().toLowerCase());
        merged.push(geo ?? stop);
      }
      await replaceDriverStops(env, driverId, merged, driver.workspace_id ?? null);
    } else {
      await replaceDriverStops(env, driverId, stopsPayload, driver.workspace_id ?? null);
    }

    const stops = await fetchDriverStops(env, driverId, driver.workspace_id ?? null);
    return respond({ stops });
  } catch (error) {
    console.error('Failed to replace driver stops', error);
    return respond({ error: 'DRIVER_STOPS_UPDATE_FAILED' }, 500);
  }
}

async function handleAdminUpdateDriverStopLocation(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext,
  stopId: string
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond({ error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' }, 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const lat = typeof body?.lat === 'number' ? body.lat : Number(body?.latitude);
  const lng = typeof body?.lng === 'number' ? body.lng : Number(body?.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return respond({ error: 'INVALID_INPUT', message: 'lat and lng are required numbers.' }, 400);
  }

  const workspaceId = resolveWorkspaceId(context, request);

  try {
    const updated = await updateDriverStopLocation(env, stopId, { lat, lng }, workspaceId);
    if (!updated) {
      return respond({ error: 'NOT_FOUND' }, 404);
    }
    return respond({ stop: updated });
  } catch (error) {
    console.error('Failed to update driver stop location', error);
    return respond({ error: 'DRIVER_STOP_UPDATE_FAILED' }, 500);
  }
}

async function /* invites disabled */ handleWorkspaceListInvites(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond({ error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' }, 500);
  }

  const workspaceId = resolveWorkspaceId(context, request);
  if (!workspaceId) {
    return respond(
      { error: 'WORKSPACE_REQUIRED', message: 'Select a workspace to view invite codes.' },
      400
    );
  }

  try {
    const invites = await fetchWorkspaceInvites(env, workspaceId);
    return respond({ invites });
  } catch (error) {
    console.error('Failed to list workspace invites', error);
    return respond({ error: 'INVITE_LIST_FAILED' }, 500);
  }
}

async function /* invites disabled */ handleWorkspaceCreateInvite(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond({ error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' }, 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const workspaceId = resolveWorkspaceId(context, request);
  if (!workspaceId) {
    return respond(
      { error: 'WORKSPACE_REQUIRED', message: 'Select a workspace before creating invites.' },
      400
    );
  }

  const label = typeof body?.label === 'string' ? body.label.trim() : null;
  const maxUses =
    typeof body?.max_uses === 'number' && body.max_uses > 0 ? Math.floor(body.max_uses) : null;
  const expiresAt =
    typeof body?.expires_at === 'string' && body.expires_at.trim().length > 0
      ? body.expires_at
      : null;

  try {
    const invite = await createWorkspaceInvite(env, workspaceId, {
      label,
      maxUses,
      expiresAt,
      createdBy: context.authUser?.id ?? null,
    });
    return respond({ invite }, 201);
  } catch (error) {
    console.error('Failed to create workspace invite', error);
    return respond({ error: 'INVITE_CREATE_FAILED' }, 500);
  }
}

async function handleDevListWorkspaces(
  env: Env,
  respond: (data: unknown, status?: number) => Response
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond({ error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' }, 500);
  }

  try {
    const workspaces = await listWorkspaces(env);
    return respond({ workspaces });
  } catch (error) {
    console.error('Failed to list workspaces', error);
    return respond({ error: 'WORKSPACE_LIST_FAILED' }, 500);
  }
}

async function handleDevCreateWorkspace(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond({ error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' }, 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return respond({ error: 'INVALID_WORKSPACE_NAME', message: 'Workspace name is required.' }, 400);
  }

  try {
    const workspace = await createWorkspace(env, name, context.authUser?.id ?? null);
    const invite = await createWorkspaceInvite(env, workspace.id, {
      label: body?.invite_label ?? null,
      maxUses: null,
      expiresAt: null,
      createdBy: context.authUser?.id ?? null,
    });
    return respond({ workspace, invite }, 201);
  } catch (error) {
    console.error('Failed to create workspace', error);
    return respond({ error: 'WORKSPACE_CREATE_FAILED' }, 500);
  }
}

async function handleDevDeleteWorkspace(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond({ error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' }, 500);
  }

  const match = request.url.match(/\/dev\/workspaces\/([^/]+)$/);
  const workspaceId = match?.[1] ? decodeURIComponent(match[1]) : '';
  if (!workspaceId) {
    return respond({ error: 'INVALID_WORKSPACE_ID', message: 'Workspace id is required.' }, 400);
  }

  let workspace: WorkspaceRow | null = null;
  try {
    workspace = await fetchWorkspaceById(env, workspaceId);
  } catch (error) {
    console.error('Failed to fetch workspace for delete', error);
    return respond({ error: 'WORKSPACE_LOOKUP_FAILED' }, 500);
  }

  if (!workspace) {
    return respond({ error: 'WORKSPACE_NOT_FOUND' }, 404);
  }

  try {
    await releaseWorkspaceUsers(env, workspaceId);
    await clearWorkspaceDriverStops(env, workspaceId);
    await deleteWorkspaceInvites(env, workspaceId);
    await deleteWorkspaceById(env, workspaceId);
    return respond({
      status: 'ok',
      workspace: {
        id: workspace.id,
        name: workspace.name,
        createdBy: workspace.created_by ?? null,
        createdAt: workspace.created_at ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to delete workspace', error);
    return respond({ error: 'WORKSPACE_DELETE_FAILED' }, 500);
  }
}

async function handleDevListFreeDrivers(
  env: Env,
  respond: (data: unknown, status?: number) => Response
): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return respond({ error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' }, 500);
  }

  try {
    const drivers = await fetchDriversWithoutWorkspace(env);
    return respond({ drivers });
  } catch (error) {
    console.error('Failed to list free-tier drivers', error);
    return respond({ error: 'FREE_DRIVER_LIST_FAILED' }, 500);
  }
}

async function handleDevListUsers(
  env: Env,
  respond: (data: unknown, status?: number) => Response
): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return respond({ error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' }, 500);
  }

  try {
    const users = await listAllUsers(env);
    const summaries = users.map((user) => ({
      id: user.id,
      fullName: user.full_name ?? null,
      emailOrPhone: user.email_or_phone ?? '',
      role: deriveUserRole(user),
      status: normalizeStatus(user.status),
      workspaceId: user.workspace_id ?? null,
    }));
    return respond({ users: summaries });
  } catch (error) {
    console.error('Failed to list users for dev', error);
    return respond({ error: 'USER_LIST_FAILED' }, 500);
  }
}

async function handleDevImpersonate(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE) || !env.JWT_SIGNING_KEY) {
    return respond(
      { error: 'CONFIG_ERROR', message: 'Supabase or JWT configuration is incomplete.' },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const userId =
    typeof body?.user_id === 'string' && body.user_id.trim().length > 0
      ? body.user_id.trim()
      : null;
  if (!userId) {
    return respond(
      { error: 'INVALID_USER_ID', message: 'Provide a valid user_id to impersonate.' },
      400
    );
  }
  if (userId === context.authUser?.id) {
    return respond({ error: 'NO_OP', message: 'Already running as this user.' }, 400);
  }

  let target: SupabaseUserRow | null = null;
  try {
    target = await fetchUserById(env, userId);
  } catch (error) {
    console.error('Failed to fetch target user for impersonation', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!target) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  const targetRole = deriveUserRole(target);
  if (targetRole === 'dev') {
    return respond(
      { error: 'FORBIDDEN', message: 'Impersonating developer accounts is not allowed.' },
      403
    );
  }
  if (!isAllowedStatus(target.status)) {
    return respond({ error: 'USER_INACTIVE', message: 'Target account is inactive.' }, 400);
  }

  try {
    const session = await buildSessionPayload(target, env);
    return respond(session);
  } catch (error) {
    console.error('Failed to create impersonation session', error);
    return respond({ error: 'IMPERSONATION_FAILED' }, 500);
  }
}

async function handleAuthChangePassword(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!context.authUser) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      { error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' },
      500
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const currentPassword = typeof body?.current_password === 'string' ? body.current_password : '';
  const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';

  if (!currentPassword) {
    return respond(
      { error: 'INVALID_CURRENT_PASSWORD', message: 'Current password is required.' },
      400
    );
  }
  if (!newPassword || newPassword.length < 8) {
    return respond(
      {
        error: 'INVALID_NEW_PASSWORD',
        message: 'New password must be at least 8 characters long.',
      },
      400
    );
  }

  let user: SupabaseUserRow | null = null;
  try {
    user = await fetchUserById(env, context.authUser.id);
  } catch (error) {
    console.error('Failed to fetch user for password change', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!user) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  const passwordValid = await verifyPassword(currentPassword, user.password_hash);
  if (!passwordValid) {
    return respond({ error: 'INVALID_CURRENT_PASSWORD' }, 401);
  }

  const newHash = await hashPassword(newPassword);

  try {
    await updateUserPassword(env, user.id, newHash, false);
  } catch (error) {
    console.error('Failed to update password', error);
    return respond({ error: 'PASSWORD_UPDATE_FAILED' }, 500);
  }

  return respond({ status: 'ok' });
}

async function handleAccountDeleteData(
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  const user = context.authUser;
  if (!user) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }

  try {
    await wipePersonalData(env, user.id, user.role);
    return respond({ status: 'ok' });
  } catch (error) {
    console.error('Failed to delete account data', error);
    return respond({ error: 'ACCOUNT_DATA_DELETE_FAILED' }, 500);
  }
}

async function handleAccountDeleteAccount(
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  const user = context.authUser;
  if (!user) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }

  try {
    await deleteAccountRecords(env, user.id, user.role);
    return respond({ status: 'ok' });
  } catch (error) {
    console.error('Failed to delete account', error);
    try {
      await anonymizeUser(env, user.id);
      return respond({ status: 'ok', fallback: 'anonymized' });
    } catch (fallbackError) {
      console.error('Fallback anonymize failed', fallbackError);
      return respond({ error: 'ACCOUNT_DELETE_FAILED' }, 500);
    }
  }
}

async function handleAccountVerifyPassword(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  const user = context.authUser;
  if (!user) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const currentPassword =
    typeof body?.current_password === 'string' ? body.current_password : '';
  if (!currentPassword) {
    return respond(
      { error: 'INVALID_CURRENT_PASSWORD', message: 'Current password is required.' },
      400
    );
  }

  let storedUser: SupabaseUserRow | null = null;
  try {
    storedUser = await fetchUserById(env, user.id);
  } catch (error) {
    console.error('Failed to fetch user for password verification', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!storedUser) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  const valid = await verifyPassword(currentPassword, storedUser.password_hash);
  if (!valid) {
    return respond({ error: 'INVALID_PASSWORD' }, 401);
  }

  return respond({ status: 'ok' });
}

async function handleAccountGetProfile(
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  if (!context.authUser) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }

  try {
    const user = await fetchUserById(env, context.authUser.id);
    if (!user) {
      return respond({ error: 'USER_NOT_FOUND' }, 404);
    }
    return respond({
      fullName: user.full_name,
      emailOrPhone: user.email_or_phone,
      businessName: user.business_name,
      businessTier: normalizeBusinessTier(user.business_tier),
    });
  } catch (error) {
    console.error('Failed to fetch account profile', error);
    return respond({ error: 'ACCOUNT_PROFILE_FAILED' }, 500);
  }
}

async function handleAccountUpdateProfile(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase configuration is incomplete.',
      },
      500
    );
  }

  if (!context.authUser) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const fullNameInput =
    typeof body?.full_name === 'string' ? body.full_name.trim() : undefined;
  const emailInput =
    typeof body?.email_or_phone === 'string' ? body.email_or_phone.trim() : undefined;
  const businessNameInput =
    typeof body?.business_name === 'string' ? body.business_name : undefined;

  if (
    (fullNameInput === undefined || fullNameInput === null) &&
    (emailInput === undefined || emailInput === null) &&
    businessNameInput === undefined
  ) {
    return respond(
      {
        error: 'INVALID_INPUT',
        message: 'Provide full_name, email_or_phone, or business_name to update.',
      },
      400
    );
  }

  const updates: {
    full_name?: string | null;
    email_or_phone?: string;
    business_name?: string | null;
  } = {};

  if (fullNameInput !== undefined) {
    updates.full_name = fullNameInput.length === 0 ? null : fullNameInput;
  }

  if (emailInput !== undefined) {
    if (!emailInput) {
      return respond(
        {
          error: 'INVALID_IDENTIFIER',
          message: 'Email or phone cannot be empty.',
        },
        400
      );
    }

    try {
      const existing = await fetchUserByIdentifier(env, emailInput);
      if (existing && existing.id !== context.authUser.id) {
        return respond(
          {
            error: 'USER_EXISTS',
            message: 'Another account already uses this identifier.',
          },
          409
        );
      }
    } catch (error) {
      console.error('Failed to check identifier uniqueness', error);
      return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
    }

    updates.email_or_phone = emailInput;
  }

  if (businessNameInput !== undefined) {
    const trimmed =
      typeof businessNameInput === 'string' ? businessNameInput.trim() : '';
    updates.business_name = trimmed.length === 0 ? null : trimmed;
  }

  try {
    const updated = await updateUserProfile(env, context.authUser.id, updates);
    return respond({
      fullName: updated.full_name,
      emailOrPhone: updated.email_or_phone,
      businessName: updated.business_name,
      businessTier: normalizeBusinessTier(updated.business_tier),
    });
  } catch (error) {
    console.error('Failed to update profile', error);
    return respond({ error: 'ACCOUNT_PROFILE_UPDATE_FAILED' }, 500);
  }
}

async function handleAccountJoinWorkspace(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE) || !env.JWT_SIGNING_KEY) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase or JWT configuration is incomplete.',
      },
      500
    );
  }

  const user = context.authUser;
  if (!user) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const teamCode = typeof body?.team_code === 'string' ? body.team_code.trim() : '';
  if (!teamCode) {
    return respond(
      { error: 'INVALID_TEAM_CODE', message: 'Workspace invite code is required.' },
      400
    );
  }

  let invite: WorkspaceInviteRow | null = null;
  try {
    invite = await findWorkspaceInviteByCode(env, teamCode);
  } catch (error) {
    console.error('Failed to fetch workspace invite', error);
    return respond({ error: 'INVITE_LOOKUP_FAILED' }, 500);
  }

  if (!invite) {
    return respond(
      { error: 'INVALID_TEAM_CODE', message: 'We could not verify that invite code.' },
      404
    );
  }

  if (invite.expires_at) {
    const expires = Date.parse(invite.expires_at);
    if (!Number.isNaN(expires) && expires < Date.now()) {
      return respond(
        { error: 'INVITE_EXPIRED', message: 'This invite code has expired.' },
        400
      );
    }
  }

  const maxUses = typeof invite.max_uses === 'number' ? invite.max_uses : null;
  const usedCount = typeof invite.uses === 'number' ? invite.uses : 0;
  if (maxUses !== null && usedCount >= maxUses) {
    return respond(
      {
        error: 'INVITE_LIMIT_REACHED',
        message: 'This invite code has already been used the maximum number of times.',
      },
      400
    );
  }

  let workspace: WorkspaceRow | null = null;
  try {
    workspace = await fetchWorkspaceById(env, invite.workspace_id);
  } catch (error) {
    console.error('Failed to fetch workspace for invite', error);
    return respond({ error: 'WORKSPACE_LOOKUP_FAILED' }, 500);
  }

  if (!workspace) {
    return respond({ error: 'WORKSPACE_NOT_FOUND' }, 404);
  }

  let existing: SupabaseUserRow | null = null;
  try {
    existing = await fetchUserById(env, user.id);
  } catch (error) {
    console.error('Failed to fetch user for invite apply', error);
    return respond({ error: 'USER_LOOKUP_FAILED' }, 500);
  }

  if (!existing) {
    return respond({ error: 'USER_NOT_FOUND' }, 404);
  }

  if (existing.workspace_id === workspace.id) {
    const session = await buildSessionPayload(existing, env);
    return respond(session);
  }

  let updated: SupabaseUserRow;
  try {
    updated = await updateUserProfile(env, user.id, {
      business_tier: 'business',
      business_name: workspace.name ?? existing.business_name ?? null,
      workspace_id: workspace.id,
    });
  } catch (error) {
    console.error('Failed to join workspace', error);
    return respond({ error: 'WORKSPACE_JOIN_FAILED' }, 500);
  }

  try {
    await updateWorkspaceInviteUsage(env, invite.id, usedCount + 1);
  } catch (error) {
    console.error('Failed to increment invite usage', error);
    // continue; not fatal
  }

  try {
    const session = await buildSessionPayload(updated, env);
    return respond(session);
  } catch (error) {
    console.error('Failed to refresh session after workspace invite code', error);
    return respond({ error: 'AUTH_ERROR' }, 500);
  }
}

async function handleDriverListStops(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!context.authUser) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      { error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' },
      500
    );
  }

  const effectiveDriverId =
    context.authUser.role === 'driver'
      ? context.authUser.id
      : new URL(request.url).searchParams.get('driver_id') ?? '';

  if (!effectiveDriverId) {
    return respond({ error: 'INVALID_DRIVER_ID', message: 'driver_id is required.' }, 400);
  }

  try {
    let workspaceFilter: string | null = null;
    if (context.authUser.role === 'driver') {
      workspaceFilter = context.authUser.workspaceId ?? null;
    } else {
      const driver = await fetchUserById(env, effectiveDriverId);
      if (!driver || driver.role !== 'driver') {
        return respond({ error: 'DRIVER_NOT_FOUND' }, 404);
      }
      if (!canAccessWorkspace(context, driver.workspace_id ?? null)) {
        return respond({ error: 'FORBIDDEN' }, 403);
      }
      workspaceFilter = driver.workspace_id ?? null;
    }

    const stops = await fetchDriverStops(env, effectiveDriverId, workspaceFilter);
    return respond({ stops });
  } catch (error) {
    console.error('Failed to fetch driver stops', error);
    return respond({ error: 'DRIVER_STOPS_FAILED' }, 500);
  }
}

async function handleDriverStopStatusUpdate(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  context: RouteContext
): Promise<Response> {
  if (!context.authUser) {
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return respond(
      { error: 'CONFIG_ERROR', message: 'Supabase configuration is incomplete.' },
      500
    );
  }

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/driver\/stops\/([^/]+)\/(complete|undo)$/);
  if (!match) {
    return respond({ error: 'NOT_FOUND' }, 404);
  }
  const [, stopId, action] = match;
  const newStatus = action === 'complete' ? 'complete' : 'pending';

  try {
    const workspaceFilter = context.authUser.workspaceId ?? null;
    const updated = await updateDriverStopStatus(
      env,
      context.authUser.role === 'admin' ? null : context.authUser.id,
      stopId,
      newStatus,
      context.authUser.role === 'admin' ? workspaceFilter : workspaceFilter
    );
    if (!updated) {
      return respond({ error: 'STOP_NOT_FOUND' }, 404);
    }
    return respond({ status: 'ok', stop: updated });
  } catch (error) {
    console.error('Failed to update driver stop status', error);
    return respond({ error: 'DRIVER_STOP_UPDATE_FAILED' }, 500);
  }
}

function jsonResponse(data: unknown, status = 200, origin: string | null = null): Response {
  const headers: HeadersInit = { ...BASE_HEADERS };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

function handlePreflight(request: Request, origin: string | null): Response {
  const headers: HeadersInit = {
    ...BASE_HEADERS,
    'Access-Control-Allow-Headers':
      request.headers.get('Access-Control-Request-Headers') ?? 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return new Response(null, { status: 204, headers });
}

function parseCorsOrigins(origins: string | null): string[] {
  if (!origins) {
    return [];
  }
  return origins
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function resolveCorsOrigin(origin: string | null, allowedOrigins: string[]): string | null {
  if (!origin) {
    return null;
  }
  if (allowedOrigins.includes('*')) {
    return origin;
  }
  return allowedOrigins.includes(origin) ? origin : null;
}

function requireAuth(
  context: RouteContext,
  respond: (data: unknown, status?: number) => Response,
  allowedRoles: UserRole[],
  onAuthorized: () => Response | Promise<Response>
): Response | Promise<Response> {
  if (!context.authUser) {
    if (context.authError === 'TOKEN_EXPIRED') {
      return respond({ error: 'TOKEN_EXPIRED' }, 401);
    }
    return respond({ error: 'UNAUTHORIZED' }, 401);
  }

  if (!isRoleAllowed(context.authUser.role, allowedRoles)) {
    return respond({ error: 'FORBIDDEN' }, 403);
  }

  return onAuthorized();
}

async function applyAuthMiddleware(request: Request, env: Env): Promise<RouteContext> {
  if (!env.JWT_SIGNING_KEY) {
    return { authUser: null };
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return { authUser: null };
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { authUser: null };
  }

  const token = match[1]?.trim();
  if (!token) {
    return { authUser: null };
  }

  try {
    const claims = await verifyJwt(token, env.JWT_SIGNING_KEY);
    if (claims.exp * 1000 <= Date.now()) {
      return { authUser: null, authError: 'TOKEN_EXPIRED' };
    }
    return {
      authUser: {
        id: claims.sub,
        role: claims.role,
        name: claims.full_name ?? null,
        emailOrPhone: claims.email_or_phone ?? null,
        mustChangePassword: Boolean(claims.must_change_password),
        businessTier: normalizeBusinessTier(claims.business_tier ?? null),
        businessName: claims.business_name ?? null,
        workspaceId: claims.workspace_id ?? null,
        token,
        exp: claims.exp,
        claims,
      },
    };
  } catch (error) {
    console.warn('Failed to verify Authorization token', error);
    return { authUser: null, authError: 'TOKEN_INVALID' };
  }
}

async function normalizeAddresses(request: Request): Promise<NormalizeResult> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return {
      type: 'error',
      response: jsonResponse({ error: 'INVALID_JSON' }, 400),
    };
  }

  const addresses = extractAddressesFromPayload(payload);
  if (addresses) {
    return { type: 'ok', addresses };
  }

  return {
    type: 'error',
    response: jsonResponse(
      {
        error: 'INVALID_INPUT',
        message: 'Expected addresses as array or newline string.',
      },
      400
    ),
  };
}

function extractAddressesFromPayload(payload: unknown): string[] | null {
  const input =
    (payload as any)?.addresses ??
    (payload as any)?.stops ??
    (payload as any)?.input ??
    (payload as any)?.Addresses ??
    (payload as any)?.Stops ??
    (payload as any)?.Input ??
    payload;

  if (typeof input === 'string') {
    return input
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  if (Array.isArray(input)) {
    return input
      .flatMap((value) => (typeof value === 'string' ? value.split(/\r?\n/) : []))
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  return null;
}

async function geocodeAddresses(
  addresses: string[],
  token: string
): Promise<GeocodeResult> {
  if (addresses.length === 1) {
    return geocodeSingle(addresses[0], token);
  }

  return geocodeBatch(addresses, token);
}

async function geocodeSingle(
  address: string,
  token: string
): Promise<GeocodeResult> {
  const url = new URL(MAPBOX_FORWARD_ENDPOINT);
  url.searchParams.set('q', address);
  url.searchParams.set('access_token', token);

  const response = await fetch(url, {
    method: 'GET',
  });

  const text = await response.text();
  if (!response.ok) {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: createBodySnippet(text),
          failed: [
            {
              address,
              message: `Forward geocode failed (${response.status}).`,
            },
          ],
          success: [],
        },
        response.status >= 400 ? response.status : 502
      ),
    };
  }

  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: createBodySnippet(text),
          failed: [
            {
              address,
              message: 'Mapbox response was not valid JSON.',
            },
          ],
          success: [],
        },
        502
      ),
    };
  }

  const coords = extractCoordinates(parsed?.features?.[0]);
  if (!coords) {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: createBodySnippet(text),
          failed: [
            {
              address,
              message: 'Mapbox did not return coordinates.',
            },
          ],
          success: [],
        },
        404
      ),
    };
  }

  return {
    type: 'ok',
    stops: [
      {
        address,
        lat: coords.lat,
        lng: coords.lng,
      },
    ],
  };
}

async function geocodeBatch(
  addresses: string[],
  token: string
): Promise<GeocodeResult> {
  const payload = addresses.map((value) => ({ q: value }));

  const response = await fetch(`${MAPBOX_BATCH_ENDPOINT}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: createBodySnippet(text),
          failed: addresses.map((address) => ({
            address,
            message: `Batch geocode failed (${response.status}).`,
          })),
          success: [],
        },
        response.status >= 400 ? response.status : 502
      ),
    };
  }

  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: createBodySnippet(text),
          failed: addresses.map((address) => ({
            address,
            message: 'Mapbox response was not valid JSON.',
          })),
          success: [],
        },
        502
      ),
    };
  }

  const successes: GeocodeSuccess[] = [];
  const failures: GeocodeFailure[] = [];

  (parsed?.batch ?? []).forEach((result: any, index: number) => {
    const address = addresses[index];
    const coords = extractCoordinates(result?.features?.[0]);
    if (coords) {
      successes.push({ address, lat: coords.lat, lng: coords.lng });
    } else {
      failures.push({
        address,
        message: 'Mapbox did not return coordinates for this address.',
      });
    }
  });

  if (failures.length > 0) {
    return {
      type: 'error',
      response: jsonResponse(
        {
          error: 'MAPBOX_GEOCODE_FAILED',
          mapboxStatus: response.status,
          mapboxBody: createBodySnippet(text),
          failed: failures,
          success: successes,
        },
        207
      ),
    };
  }

  return { type: 'ok', stops: successes };
}

function createBodySnippet(source: string | null | undefined, maxLength = 400): string | undefined {
  if (!source) {
    return undefined;
  }
  return source.length > maxLength ? `${source.slice(0, maxLength)}â€¦` : source;
}

function extractCoordinates(node: any): { lat: number; lng: number } | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const geometry = node.geometry;
  if (
    geometry &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 &&
    typeof geometry.coordinates[0] === 'number' &&
    typeof geometry.coordinates[1] === 'number'
  ) {
    const [lng, lat] = geometry.coordinates;
    return { lat, lng };
  }

  if (
    node.latLng &&
    typeof node.latLng.latitude === 'number' &&
    typeof node.latLng.longitude === 'number'
  ) {
    return { lat: node.latLng.latitude, lng: node.latLng.longitude };
  }

  if (typeof node.latitude === 'number' && typeof node.longitude === 'number') {
    return { lat: node.latitude, lng: node.longitude };
  }

  return null;
}

function supabaseHeaders(env: Env): HeadersInit {
  const serviceKey = env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE;
  if (!serviceKey) {
    throw new Error('Supabase service key is not configured');
  }
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

function normalizeSupabaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

async function fetchUserByIdentifier(env: Env, identifier: string): Promise<SupabaseUserRow | null> {
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set(
    'select',
    'id,full_name,email_or_phone,password_hash,role,status,must_change_password,business_tier,business_name,workspace_id'
  );
  url.searchParams.set('email_or_phone', `eq.${identifier}`);
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as SupabaseUserRow[];
  return rows.length > 0 ? rows[0] : null;
}

async function fetchUserById(env: Env, userId: string): Promise<SupabaseUserRow | null> {
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set(
    'select',
    'id,full_name,email_or_phone,password_hash,role,status,must_change_password,business_tier,business_name,workspace_id'
  );
  url.searchParams.set('id', `eq.${userId}`);
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as SupabaseUserRow[];
  return rows.length > 0 ? rows[0] : null;
}

type UserSummary = { id: string; fullName: string | null; emailOrPhone: string; workspaceId?: string | null };

async function fetchUsersByRole(
  env: Env,
  role: UserRole,
  workspaceId?: string | null
): Promise<UserSummary[]> {
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('select', 'id,full_name,email_or_phone,role,status,workspace_id');
  if (role === 'dev') {
    url.searchParams.set('role', 'eq.admin');
  } else {
    url.searchParams.set('role', `eq.${role}`);
  }
  if (workspaceId) {
    url.searchParams.set('workspace_id', `eq.${workspaceId}`);
  }
  url.searchParams.append('order', 'full_name.asc');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Array<{
    id: string;
    full_name: string | null;
    email_or_phone: string;
    status?: string | null;
  }>;

  return rows
    .filter((row) => {
      if (role === 'admin') {
        return row.role === 'admin' && !isDevStatus(row.status);
      }
      if (role === 'dev') {
        return isDevStatus(row.status);
      }
      // Only keep true driver rows
      return row.role === 'driver' && !isDevStatus(row.status);
    })
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      emailOrPhone: row.email_or_phone,
      workspaceId: row.workspace_id ?? null,
    }));
}

async function fetchDrivers(env: Env, workspaceId?: string | null): Promise<UserSummary[]> {
  return fetchUsersByRole(env, 'driver', workspaceId);
}

async function fetchAdmins(env: Env, workspaceId?: string | null): Promise<UserSummary[]> {
  return fetchUsersByRole(env, 'admin', workspaceId);
}

async function listAllUsers(env: Env): Promise<SupabaseUserRow[]> {
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set(
    'select',
    'id,full_name,email_or_phone,role,status,must_change_password,workspace_id,business_tier,business_name'
  );
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select users failed (${response.status}): ${errorBody}`);
  }
  return (await response.json()) as SupabaseUserRow[];
}

async function fetchDriversWithoutWorkspace(env: Env): Promise<UserSummary[]> {
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('select', 'id,full_name,email_or_phone,workspace_id,status');
  url.searchParams.set('role', 'eq.driver');
  url.searchParams.set('workspace_id', 'is.null');
  url.searchParams.append('order', 'full_name.asc');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Array<{
    id: string;
    full_name: string | null;
    email_or_phone: string;
    status?: string | null;
  }>;

  return rows
    .filter((row) => !isDevStatus(row.status))
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      emailOrPhone: row.email_or_phone,
      workspaceId: null,
    }));
}

async function fetchDriverStops(
  env: Env,
  driverId: string,
  workspaceId?: string | null
): Promise<DriverStopView[]> {
  const url = new URL('/rest/v1/driver_stops', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set(
    'select',
    'id,driver_id,address_text,lat,lng,sort_order,status'
  );
  url.searchParams.set('driver_id', `eq.${driverId}`);
  if (workspaceId) {
    url.searchParams.set('workspace_id', `eq.${workspaceId}`);
  }
  url.searchParams.append('order', 'sort_order.asc');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as DriverStopRow[];
  return rows.map(normalizeDriverStop);
}

async function enforceFreeTierLimit(
  env: Env,
  userId: string,
  requestedCount: number
): Promise<{ allowed: boolean; used: number; limit: number; resetsAt: string | null; message: string }> {
  if (requestedCount <= 0) {
    return { allowed: true, used: 0, limit: FREE_TIER_DAILY_LIMIT, resetsAt: null, message: '' };
  }
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return { allowed: true, used: 0, limit: FREE_TIER_DAILY_LIMIT, resetsAt: null, message: '' };
  }
  const windowStartIso = new Date(Date.now() - FREE_TIER_WINDOW_MS).toISOString();
  const events = await fetchUsageEvents(env, userId, windowStartIso);
  let used = 0;
  let oldestTimestamp: number | null = null;
  events.forEach((event) => {
    const count = typeof event.address_count === 'number' ? event.address_count : 0;
    used += count;
    if (oldestTimestamp === null) {
      const created = Date.parse(event.created_at);
      if (!Number.isNaN(created)) {
        oldestTimestamp = created;
      }
    }
  });
  if (used + requestedCount > FREE_TIER_DAILY_LIMIT) {
    const resetsAt =
      oldestTimestamp !== null
        ? new Date(oldestTimestamp + FREE_TIER_WINDOW_MS).toISOString()
        : null;
    return {
      allowed: false,
      used,
      limit: FREE_TIER_DAILY_LIMIT,
      resetsAt,
      message:
        'Daily limit reached on the free plan. Enter a workspace invite code in Settings to unlock unlimited usage.',
    };
  }
  return {
    allowed: true,
    used,
    limit: FREE_TIER_DAILY_LIMIT,
    resetsAt: null,
    message: '',
  };
}

async function fetchUsageEvents(env: Env, userId: string, sinceIso: string): Promise<UsageEventRow[]> {
  const url = new URL(`/rest/v1/${USAGE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('select', 'address_count,created_at');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('created_at', `gte.${sinceIso}`);
  url.searchParams.append('order', 'created_at.asc');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as UsageEventRow[];
}

async function recordUsageEvent(env: Env, userId: string, addressCount: number): Promise<void> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return;
  }
  if (addressCount <= 0) {
    return;
  }

  const url = new URL(`/rest/v1/${USAGE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      user_id: userId,
      address_count: addressCount,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${errorBody}`);
  }
}

function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  const buffer = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += INVITE_CODE_ALPHABET[buffer[i] % INVITE_CODE_ALPHABET.length];
  }
  return result;
}

async function fetchWorkspaceById(env: Env, workspaceId: string): Promise<WorkspaceRow | null> {
  const url = new URL(`/rest/v1/${WORKSPACE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('id', `eq.${workspaceId}`);
  url.searchParams.set('limit', '1');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }
  const rows = (await response.json()) as WorkspaceRow[];
  return rows.length > 0 ? rows[0] : null;
}

async function listWorkspaces(env: Env): Promise<WorkspaceRow[]> {
  const url = new URL(`/rest/v1/${WORKSPACE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('select', 'id,name,created_by,created_at');
  url.searchParams.append('order', 'name.asc');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }
  return (await response.json()) as WorkspaceRow[];
}

async function createWorkspace(env: Env, name: string, createdBy: string | null): Promise<WorkspaceRow> {
  const url = new URL(`/rest/v1/${WORKSPACE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name, created_by: createdBy }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${errorBody}`);
  }
  const rows = (await response.json()) as WorkspaceRow[];
  if (rows.length === 0) {
    throw new Error('WORKSPACE_CREATE_FAILED');
  }
  return rows[0];
}

async function releaseWorkspaceUsers(env: Env, workspaceId: string): Promise<void> {
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('workspace_id', `eq.${workspaceId}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      workspace_id: null,
      business_tier: 'free',
      business_name: null,
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase release users failed (${response.status}): ${errorBody}`);
  }
}

async function clearWorkspaceDriverStops(env: Env, workspaceId: string): Promise<void> {
  const url = new URL('/rest/v1/driver_stops', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('workspace_id', `eq.${workspaceId}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ workspace_id: null }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase release driver stops failed (${response.status}): ${errorBody}`);
  }
}

async function deleteWorkspaceInvites(env: Env, workspaceId: string): Promise<void> {
  const url = new URL('/rest/v1/workspace_invites', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('workspace_id', `eq.${workspaceId}`);
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase delete invites failed (${response.status}): ${errorBody}`);
  }
}

async function deleteWorkspaceById(env: Env, workspaceId: string): Promise<void> {
  const url = new URL(`/rest/v1/${WORKSPACE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('id', `eq.${workspaceId}`);
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase delete workspace failed (${response.status}): ${errorBody}`);
  }
}

async function fetchWorkspaceInvites(
  env: Env,
  workspaceId: string
): Promise<WorkspaceInviteRow[]> {
  const url = new URL(`/rest/v1/${WORKSPACE_INVITE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set(
    'select',
    'id,workspace_id,code,label,max_uses,uses,expires_at,created_by,created_at'
  );
  url.searchParams.set('workspace_id', `eq.${workspaceId}`);
  url.searchParams.append('order', 'created_at.desc');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }
  return (await response.json()) as WorkspaceInviteRow[];
}

async function createWorkspaceInvite(
  env: Env,
  workspaceId: string,
  input: { label?: string | null; maxUses?: number | null; expiresAt?: string | null; createdBy?: string | null }
): Promise<WorkspaceInviteRow> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    const payload = {
      workspace_id: workspaceId,
      code,
      label: input?.label ?? null,
      max_uses: typeof input?.maxUses === 'number' ? input.maxUses : null,
      expires_at: input?.expiresAt ?? null,
      created_by: input?.createdBy ?? null,
    };
    const url = new URL(`/rest/v1/${WORKSPACE_INVITE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        ...supabaseHeaders(env),
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const rows = (await response.json()) as WorkspaceInviteRow[];
      if (rows.length === 0) {
        throw new Error('INVITE_CREATE_FAILED');
      }
      return rows[0];
    }
    if (response.status === 409 || response.status === 400) {
      // assume duplicate code; retry
      continue;
    }
    const errorBody = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${errorBody}`);
  }
  throw new Error('INVITE_CODE_CONFLICT');
}

async function findWorkspaceInviteByCode(
  env: Env,
  code: string
): Promise<WorkspaceInviteRow | null> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }
  const url = new URL(`/rest/v1/${WORKSPACE_INVITE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set(
    'select',
    'id,workspace_id,code,label,max_uses,uses,expires_at,created_by,created_at'
  );
  url.searchParams.set('code', `eq.${normalizedCode}`);
  url.searchParams.set('limit', '1');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }
  const rows = (await response.json()) as WorkspaceInviteRow[];
  return rows.length > 0 ? rows[0] : null;
}

async function updateWorkspaceInviteUsage(
  env: Env,
  inviteId: string,
  uses: number
): Promise<void> {
  const url = new URL(`/rest/v1/${WORKSPACE_INVITE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('id', `eq.${inviteId}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ uses }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase update failed (${response.status}): ${errorBody}`);
  }
}

async function supabaseInsert(env: Env, table: string, payload: unknown): Promise<void> {
  const url = new URL(`/rest/v1/${table}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${errorBody}`);
  }
}

async function replaceDriverStops(
  env: Env,
  driverId: string,
  stops: GeocodeSuccess[],
  workspaceId?: string | null
): Promise<void> {
  await deleteDriverStopsRecords(env, driverId);

  // Insert new stops (with order + default status)
  const payload = stops.map((stop, index) => ({
    driver_id: driverId,
    address_text: stop.address,
    lat: stop.lat,
    lng: stop.lng,
    sort_order: index,
    status: 'pending',
    workspace_id: workspaceId ?? null,
  }));

  if (payload.length === 0) {
    return;
  }

  const base = normalizeSupabaseUrl(env.SUPABASE_URL!);
  const insertUrl = new URL('/rest/v1/driver_stops', base);
  const insertResponse = await fetch(insertUrl.toString(), {
    method: 'POST',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!insertResponse.ok) {
    const errorBody = await insertResponse.text();
    throw new Error(`Supabase insert failed (${insertResponse.status}): ${errorBody}`);
  }
}

async function updateDriverStopStatus(
  env: Env,
  driverId: string | null,
  stopId: string,
  status: 'pending' | 'complete',
  workspaceId?: string | null
): Promise<DriverStopView | null> {
  const url = new URL('/rest/v1/driver_stops', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('id', `eq.${stopId}`);
  if (driverId) {
    url.searchParams.set('driver_id', `eq.${driverId}`);
  }
  if (workspaceId) {
    url.searchParams.set('workspace_id', `eq.${workspaceId}`);
  }

  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as DriverStopRow[];
  if (rows.length === 0) {
    return null;
  }

  return normalizeDriverStop(rows[0]);
}

async function updateDriverStopLocation(
  env: Env,
  stopId: string,
  coordinates: { lat: number; lng: number },
  workspaceId?: string | null
): Promise<DriverStopView | null> {
  const attemptUpdate = async (workspaceFilter: string | null) => {
    const url = new URL('/rest/v1/driver_stops', normalizeSupabaseUrl(env.SUPABASE_URL!));
    url.searchParams.set('id', `eq.${stopId}`);
    if (workspaceFilter) {
      url.searchParams.set('workspace_id', `eq.${workspaceFilter}`);
    }

    const response = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        ...supabaseHeaders(env),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        lat: coordinates.lat,
        lng: coordinates.lng,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Supabase update failed (${response.status}): ${errorBody}`);
    }

    const rows = (await response.json()) as DriverStopRow[];
    if (rows.length === 0) {
      return null;
    }

    return normalizeDriverStop(rows[0]);
  };

  const primary = await attemptUpdate(workspaceId ?? null);
  if (primary) {
    return primary;
  }
  if (workspaceId) {
    // Retry without workspace filter in case the stop has no workspace set.
    return attemptUpdate(null);
  }
  return null;
}

async function deleteDriverStopsRecords(env: Env, driverId: string): Promise<void> {
  const base = normalizeSupabaseUrl(env.SUPABASE_URL!);
  const deleteUrl = new URL(`/rest/v1/driver_stops`, base);
  deleteUrl.searchParams.set('driver_id', `eq.${driverId}`);
  const deleteResponse = await fetch(deleteUrl.toString(), {
    method: 'DELETE',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
  });
  if (!deleteResponse.ok) {
    const errorBody = await deleteResponse.text();
    throw new Error(`Supabase delete failed (${deleteResponse.status}): ${errorBody}`);
  }
}

async function deleteUsageEvents(env: Env, userId: string): Promise<void> {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE)) {
    return;
  }
  const url = new URL(`/rest/v1/${USAGE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('user_id', `eq.${userId}`);
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      // Table not present in this Supabase project; ignore silently
      return;
    }
    const errorBody = await response.text();
    throw new Error(`Supabase delete failed (${response.status}): ${errorBody}`);
  }
}

async function updateUserPassword(
  env: Env,
  userId: string,
  passwordHash: string,
  mustChangePassword: boolean
): Promise<void> {
  const url = new URL(`/rest/v1/users?id=eq.${userId}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      password_hash: passwordHash,
      must_change_password: mustChangePassword,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase update failed (${response.status}): ${errorBody}`);
  }
}

async function updateUserProfile(
  env: Env,
  userId: string,
  updates: {
    full_name?: string | null;
    email_or_phone?: string;
    business_name?: string | null;
    business_tier?: BusinessTier;
    workspace_id?: string | null;
    role?: UserRole;
    status?: string;
  }
): Promise<SupabaseUserRow> {
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('id', `eq.${userId}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as SupabaseUserRow[];
  if (rows.length === 0) {
    throw new Error('USER_NOT_FOUND');
  }
  return rows[0];
}

async function deleteUserById(env: Env, userId: string): Promise<void> {
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('id', `eq.${userId}`);
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase delete failed (${response.status}): ${errorBody}`);
  }
}

async function anonymizeUser(env: Env, userId: string): Promise<void> {
  const placeholder = `deleted-${userId}-${Date.now()}`;
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('id', `eq.${userId}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      full_name: 'Deleted User',
      email_or_phone: placeholder,
      status: 'deleted',
      must_change_password: false,
      business_name: null,
      business_tier: 'free',
      workspace_id: null,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase update failed (${response.status}): ${errorBody}`);
  }
}

async function deleteAccountRecords(env: Env, userId: string, role: UserRole): Promise<void> {
  if (role === 'driver') {
    try {
      await deleteDriverStopsRecords(env, userId);
    } catch (error) {
      console.error('Failed to delete driver stops during account removal', error);
    }
  }
  try {
    await clearUserCreatorReferences(env, userId);
  } catch (error) {
    console.error('Failed to clear creator references during account removal', error);
  }
  try {
    await deleteUsageEvents(env, userId);
  } catch (error) {
    console.error('Failed to delete usage events during account removal', error);
  }
  try {
    await deleteUserById(env, userId);
  } catch (error) {
    // If FK from invites/workspaces still exist, attempt one more cleanup and retry
    console.error('Delete user failed, retrying after cleanup', error);
    try {
      await clearUserCreatorReferences(env, userId);
    } catch (cleanupError) {
      console.error('Retry cleanup failed', cleanupError);
    }
    await deleteUserById(env, userId);
  }
}

async function wipePersonalData(env: Env, userId: string, role: UserRole): Promise<void> {
  if (role === 'driver') {
    try {
      await deleteDriverStopsRecords(env, userId);
    } catch (error) {
      console.error('Failed to delete driver stops during personal data wipe', error);
    }
  }
  try {
    await deleteUsageEvents(env, userId);
  } catch (error) {
    console.error('Failed to delete usage events during personal data wipe', error);
  }
  await updateUserProfile(env, userId, {
    full_name: null,
    business_name: null,
  });
}

async function clearUserCreatorReferences(env: Env, userId: string): Promise<void> {
  // Clear user references that can block delete because of FK constraints
  // Delete invites authored by this user
  const invitesUrl = new URL(`/rest/v1/${WORKSPACE_INVITE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  invitesUrl.searchParams.set('created_by', `eq.${userId}`);
  const deleteInvitesRes = await fetch(invitesUrl.toString(), {
    method: 'DELETE',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
  });
  if (!deleteInvitesRes.ok) {
    const errorBody = await deleteInvitesRes.text();
    console.error(`Delete invites failed (${deleteInvitesRes.status}): ${errorBody}`);
  }

  // Null workspace created_by if possible
  const workspaceUrl = new URL(`/rest/v1/${WORKSPACE_TABLE}`, normalizeSupabaseUrl(env.SUPABASE_URL!));
  workspaceUrl.searchParams.set('created_by', `eq.${userId}`);
  const wsRes = await fetch(workspaceUrl.toString(), {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ created_by: null }),
  });
  if (!wsRes.ok) {
    const errorBody = await wsRes.text();
    console.error(`Clear workspace created_by failed (${wsRes.status}): ${errorBody}`);
  }
}

const DEFAULT_BCRYPT_ROUNDS = 10;

async function hashPassword(password: string, rounds = DEFAULT_BCRYPT_ROUNDS): Promise<string> {
  return new Promise((resolve, reject) => {
    bcrypt.genSalt(rounds, (saltErr: Error | null, salt: string) => {
      if (saltErr || !salt) {
        reject(saltErr ?? new Error('Failed to generate salt'));
        return;
      }
      bcrypt.hash(password, salt, (hashErr: Error | null, hash: string) => {
        if (hashErr || !hash) {
          reject(hashErr ?? new Error('Failed to hash password'));
          return;
        }
        resolve(hash);
      });
    });
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve) => {
    bcrypt.compare(password, hash, (err: Error | null, same: boolean) => {
      if (err) {
        console.error('bcrypt compare failed', err);
        resolve(false);
        return;
      }
      resolve(Boolean(same));
    });
  });
}

function generateTempPassword(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const buffer = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += alphabet[buffer[i] % alphabet.length];
  }
  return result;
}

async function buildSessionPayload(user: SupabaseUserRow, env: Env): Promise<AuthResponsePayload> {
  const effectiveRole = deriveUserRole(user);
  const now = Math.floor(Date.now() / 1000);
  const businessTier =
    effectiveRole === 'dev' ? 'business' : normalizeBusinessTier(user.business_tier);
  const workspaceId = user.workspace_id ?? null;
  const claims: JwtClaims = {
    sub: user.id,
    role: effectiveRole,
    full_name: user.full_name,
    email_or_phone: user.email_or_phone,
    must_change_password: user.must_change_password ?? false,
     business_tier: businessTier,
     business_name: user.business_name ?? null,
    workspace_id: workspaceId,
    iat: now,
    exp: now + SESSION_EXPIRATION_SECONDS,
  };
  const token = await signJwt(claims, env.JWT_SIGNING_KEY!);
  return {
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      emailOrPhone: user.email_or_phone,
      role: effectiveRole,
      mustChangePassword: Boolean(user.must_change_password),
      businessTier,
      businessName: user.business_name ?? null,
      workspaceId,
      tokenExpiresAt: claims.exp,
    },
  };
}

async function signJwt(claims: JwtClaims, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${data}.${signatureB64}`;
}

async function verifyJwt(token: string, secret: string): Promise<JwtClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token structure');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const encoder = new TextEncoder();
  const key = await importHmacKey(secret);
  const data = `${headerB64}.${payloadB64}`;
  const signature = base64UrlDecode(signatureB64);
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(data));
  if (!valid) {
    throw new Error('Invalid signature');
  }
  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
  const claims = JSON.parse(payloadJson) as JwtClaims;
  if (!claims || typeof claims !== 'object' || typeof claims.sub !== 'string') {
    throw new Error('Invalid claims');
  }
  return claims;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function normalizeDriverStop(row: DriverStopRow): DriverStopView {
  return {
    id: row.id,
    address: row.address_text,
    lat: row.lat,
    lng: row.lng,
    sortOrder: row.sort_order,
    status: row.status === 'complete' ? 'complete' : 'pending',
  };
}

function base64UrlEncode(input: Uint8Array): string {
  let str = '';
  input.forEach((value) => {
    str += String.fromCharCode(value);
  });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padLength = (4 - (input.length % 4)) % 4;
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeBusinessTier(value: string | null | undefined): BusinessTier {
  return value?.toLowerCase() === 'business' ? 'business' : 'free';
}

