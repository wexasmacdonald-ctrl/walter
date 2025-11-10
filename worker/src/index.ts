import * as bcrypt from 'bcryptjs';

type UserRole = 'admin' | 'driver';

type Env = {
  MAPBOX_ACCESS_TOKEN?: string;
  JWT_SIGNING_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
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
  exp: number;
  iat: number;
};

type AuthenticatedUser = {
  id: string;
  role: UserRole;
  name: string | null;
  emailOrPhone: string | null;
  mustChangePassword: boolean;
  token: string;
  exp: number;
  claims: JwtClaims;
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
};

type SupabaseInsertPayload = {
  id: string;
  full_name: string;
  email_or_phone: string;
  role: UserRole;
  status: string;
  password_hash: string;
  must_change_password: boolean;
};

type DriverStopRow = {
  id: string;
  driver_id: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  sort_order: number | null;
  status: string | null;
};

type DriverStopView = {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  sortOrder: number | null;
  status: 'pending' | 'complete';
};

const MAX_ADDRESSES = 150;
const DEFAULT_ADMIN_IDENTIFIER = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'AdminPass';
const MAPBOX_BATCH_LIMIT = 1000;
const MAPBOX_FORWARD_ENDPOINT =
  'https://api.mapbox.com/search/geocode/v6/forward?limit=1';
const MAPBOX_BATCH_ENDPOINT =
  'https://api.mapbox.com/search/geocode/v6/batch';

const BASE_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
};

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

    if (request.method === 'POST' && url.pathname === '/admin/create-user') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminCreateUser(request, env, respond)
      );
    }

    if (request.method === 'GET' && url.pathname === '/admin/drivers') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminListDrivers(env, respond)
      );
    }

    if (request.method === 'GET' && url.pathname === '/admin/driver-stops') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminGetDriverStops(request, env, respond)
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/driver-stops') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminReplaceDriverStops(request, env, respond)
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/users/reset-password') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminResetUserPassword(request, env, respond)
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/users/update-profile') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminUpdateUserProfile(request, env, respond)
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/users/update-password') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminUpdateUserPassword(request, env, respond)
      );
    }

    if (request.method === 'DELETE' && url.pathname === '/admin/users') {
      return requireAuth(routeContext, respond, ['admin'], () =>
        handleAdminDeleteUser(request, env, respond)
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
        handleGeocode(request, env, respond)
      );
    }

    return respond({ error: 'NOT_FOUND' }, 404);
  },
};

async function handleGeocode(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response
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

  if (addresses.length === 0) {
    try {
      await replaceDriverStops(env, driverId, []);
      const stops = await fetchDriverStops(env, driverId);
      return respond({ stops });
    } catch (error) {
      console.error('Failed to clear driver stops', error);
      return respond({ error: 'DRIVER_STOPS_UPDATE_FAILED' }, 500);
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

  return respond({ pins });
}

async function handleAuthLogin(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response
): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.JWT_SIGNING_KEY) {
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

  if (user.status && user.status !== 'active') {
    return respond({ error: 'USER_INACTIVE' }, 403);
  }

  const passwordValid = await verifyPassword(password, user.password_hash);
  if (!passwordValid) {
    return respond({ error: 'INVALID_CREDENTIALS' }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresInSeconds = 60 * 60 * 24; // 24 hours
  const claims: JwtClaims = {
    sub: user.id,
    role: user.role,
    full_name: user.full_name,
    email_or_phone: user.email_or_phone,
    must_change_password: user.must_change_password ?? false,
    iat: now,
    exp: now + expiresInSeconds,
  };

  let token: string;
  try {
    token = await signJwt(claims, env.JWT_SIGNING_KEY);
  } catch (error) {
    console.error('Failed to sign JWT', error);
    return respond({ error: 'AUTH_ERROR' }, 500);
  }

  return respond({
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      emailOrPhone: user.email_or_phone,
      role: user.role,
      mustChangePassword: Boolean(user.must_change_password),
      tokenExpiresAt: claims.exp,
    },
  });
}

async function handleAdminCreateUser(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : '';
  const emailOrPhone = typeof body?.email_or_phone === 'string' ? body.email_or_phone.trim() : '';
  const roleInput = typeof body?.role === 'string' ? body.role.trim().toLowerCase() : 'driver';
  const role: UserRole = roleInput === 'admin' ? 'admin' : 'driver';

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

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const payload: SupabaseInsertPayload = {
    id: crypto.randomUUID(),
    full_name: fullName,
    email_or_phone: emailOrPhone,
    role,
    status: 'active',
    password_hash: passwordHash,
    must_change_password: false,
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
  respond: (data: unknown, status?: number) => Response
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

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  try {
    await updateUserPassword(env, user.id, passwordHash, true);
  } catch (error) {
    console.error('Failed to reset user password', error);
    return respond({ error: 'PASSWORD_RESET_FAILED' }, 500);
  }

  return respond({ status: 'ok', tempPassword, role: user.role });
}

async function handleAdminDeleteUser(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response
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

  try {
    await deleteAccountRecords(env, user.id, user.role);
    return respond({ status: 'ok' });
  } catch (error) {
    console.error('Failed to delete user account', error);
    try {
      await anonymizeUser(env, user.id);
      return respond({ status: 'ok', fallback: 'anonymized' });
    } catch (fallbackError) {
      console.error('Fallback anonymize failed', fallbackError);
      return respond({ error: 'USER_DELETE_FAILED' }, 500);
    }
  }
}

async function handleAdminUpdateUserProfile(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'INVALID_JSON' }, 400);
  }

  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  if (!userId) {
    return respond({ error: 'INVALID_USER_ID', message: 'user_id is required.' }, 400);
  }

  const fullNameInput =
    typeof body?.full_name === 'string' ? body.full_name.trim() : undefined;
  const emailInput =
    typeof body?.email_or_phone === 'string' ? body.email_or_phone.trim() : undefined;

  if (
    (fullNameInput === undefined || fullNameInput === null) &&
    (emailInput === undefined || emailInput === null)
  ) {
    return respond(
      {
        error: 'INVALID_INPUT',
        message: 'Provide full_name and/or email_or_phone to update.',
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

  const updates: { full_name?: string | null; email_or_phone?: string } = {};
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

  try {
    const updated = await updateUserProfile(env, userId, updates);
    return respond({
      status: 'ok',
      user: {
        id: updated.id,
        fullName: updated.full_name,
        emailOrPhone: updated.email_or_phone,
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
  respond: (data: unknown, status?: number) => Response
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
  respond: (data: unknown, status?: number) => Response
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

  try {
    const drivers = await fetchDrivers(env);
    return respond({ drivers });
  } catch (error) {
    console.error('Failed to list drivers', error);
    return respond({ error: 'DRIVER_LIST_FAILED' }, 500);
  }
}

async function handleAdminGetDriverStops(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response
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

    const stops = await fetchDriverStops(env, driverId);
    return respond({ stops });
  } catch (error) {
    console.error('Failed to fetch driver stops', error);
    return respond({ error: 'DRIVER_STOPS_FAILED' }, 500);
  }
}

async function handleAdminReplaceDriverStops(
  request: Request,
  env: Env,
  respond: (data: unknown, status?: number) => Response
): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.MAPBOX_ACCESS_TOKEN) {
    return respond(
      {
        error: 'CONFIG_ERROR',
        message: 'Supabase or Mapbox configuration is incomplete.',
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

  const geocodeResult = await geocodeAddresses(addresses, env.MAPBOX_ACCESS_TOKEN);
  if (geocodeResult.type === 'error') {
    return geocodeResult.response;
  }

  try {
    await replaceDriverStops(env, driverId, geocodeResult.stops);
    const stops = await fetchDriverStops(env, driverId);
    return respond({ stops });
  } catch (error) {
    console.error('Failed to replace driver stops', error);
    return respond({ error: 'DRIVER_STOPS_UPDATE_FAILED' }, 500);
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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
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

  if (
    (fullNameInput === undefined || fullNameInput === null) &&
    (emailInput === undefined || emailInput === null)
  ) {
    return respond(
      {
        error: 'INVALID_INPUT',
        message: 'Provide full_name and/or email_or_phone to update.',
      },
      400
    );
  }

  const updates: { full_name?: string | null; email_or_phone?: string } = {};

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

  try {
    const updated = await updateUserProfile(env, context.authUser.id, updates);
    return respond({
      fullName: updated.full_name,
      emailOrPhone: updated.email_or_phone,
    });
  } catch (error) {
    console.error('Failed to update profile', error);
    return respond({ error: 'ACCOUNT_PROFILE_UPDATE_FAILED' }, 500);
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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
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
    const stops = await fetchDriverStops(env, effectiveDriverId);
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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
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
    const updated = await updateDriverStopStatus(
      env,
      context.authUser.role === 'admin' ? null : context.authUser.id,
      stopId,
      newStatus
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
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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

  if (!allowedRoles.includes(context.authUser.role)) {
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
  return source.length > maxLength ? `${source.slice(0, maxLength)}…` : source;
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
  return {
    apikey: env.SUPABASE_SERVICE_KEY!,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
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
    'id,full_name,email_or_phone,password_hash,role,status,must_change_password'
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
    'id,full_name,email_or_phone,password_hash,role,status,must_change_password'
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

async function fetchDrivers(
  env: Env
): Promise<{ id: string; fullName: string | null; emailOrPhone: string }[]> {
  const url = new URL('/rest/v1/users', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('select', 'id,full_name,email_or_phone,role');
  url.searchParams.set('role', 'eq.driver');
  url.searchParams.append('order', 'full_name.asc');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: supabaseHeaders(env),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as {
    id: string;
    full_name: string | null;
    email_or_phone: string;
  }[];

  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    emailOrPhone: row.email_or_phone,
  }));
}

async function fetchDriverStops(env: Env, driverId: string): Promise<DriverStopView[]> {
  const url = new URL('/rest/v1/driver_stops', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set(
    'select',
    'id,driver_id,address_text,lat,lng,sort_order,status'
  );
  url.searchParams.set('driver_id', `eq.${driverId}`);
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
  stops: GeocodeSuccess[]
): Promise<void> {
  const base = normalizeSupabaseUrl(env.SUPABASE_URL!);

  await deleteDriverStopsRecords(env, driverId);

  // Insert new stops (with order + default status)
  const payload = stops.map((stop, index) => ({
    driver_id: driverId,
    address_text: stop.address,
    lat: stop.lat,
    lng: stop.lng,
    sort_order: index,
    status: 'pending',
  }));

  if (payload.length === 0) {
    return;
  }

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

async function updateDriverStopStatus(
  env: Env,
  driverId: string | null,
  stopId: string,
  status: 'pending' | 'complete'
): Promise<DriverStopView | null> {
  const url = new URL('/rest/v1/driver_stops', normalizeSupabaseUrl(env.SUPABASE_URL!));
  url.searchParams.set('id', `eq.${stopId}`);
  if (driverId) {
    url.searchParams.set('driver_id', `eq.${driverId}`);
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
  updates: { full_name?: string | null; email_or_phone?: string }
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
      full_name: null,
      email_or_phone: placeholder,
      status: 'deleted',
      must_change_password: false,
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
  await deleteUserById(env, userId);
}

async function wipePersonalData(env: Env, userId: string, role: UserRole): Promise<void> {
  if (role === 'driver') {
    try {
      await deleteDriverStopsRecords(env, userId);
    } catch (error) {
      console.error('Failed to delete driver stops during personal data wipe', error);
    }
  }
  await updateUserProfile(env, userId, {
    full_name: null,
  });
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
