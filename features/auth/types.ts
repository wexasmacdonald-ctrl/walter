export type UserRole = 'admin' | 'driver';

export type AuthUser = {
  id: string;
  fullName: string | null;
  emailOrPhone: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  tokenExpiresAt?: number;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type AccountProfile = {
  fullName: string | null;
  emailOrPhone: string | null;
};

export type CreateUserInput = {
  fullName: string;
  emailOrPhone: string;
  role?: UserRole;
};

export type CreateUserResponse = {
  status: 'ok';
  tempPassword: string;
  role: UserRole;
};

export type ResetUserPasswordResponse = {
  status: 'ok';
  tempPassword: string;
  role: UserRole;
};

export type AdminUserProfileUpdateResponse = {
  status: 'ok';
  user: {
    id: string;
    fullName: string | null;
    emailOrPhone: string | null;
  };
};

export type DriverSummary = {
  id: string;
  fullName: string | null;
  emailOrPhone: string;
};

export type DriverStopStatus = 'pending' | 'complete';

export type DriverStop = {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  sortOrder: number | null;
  status: DriverStopStatus;
};
