export type UserRole = 'admin' | 'driver' | 'dev';

export type BusinessTier = 'free' | 'business';

export type AuthUser = {
  id: string;
  fullName: string | null;
  emailOrPhone: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  businessTier: BusinessTier;
  businessName: string | null;
  workspaceId: string | null;
  tokenExpiresAt?: number;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type AccountProfile = {
  fullName: string | null;
  emailOrPhone: string | null;
  businessName: string | null;
  businessTier: BusinessTier;
  workspaceId: string | null;
};

export type CreateUserInput = {
  fullName?: string | null;
  emailOrPhone: string;
  role?: UserRole;
};

export type RegisterInput = {
  fullName?: string | null;
  emailOrPhone: string;
  password: string;
  businessName?: string | null;
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

export type AdminSummary = {
  id: string;
  fullName: string | null;
  emailOrPhone: string;
};

export type DevUserSummary = {
  id: string;
  fullName: string | null;
  emailOrPhone: string;
  role: UserRole;
  workspaceId: string | null;
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

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  code: string;
  label: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  createdBy?: string | null;
  createdAt?: string | null;
};
