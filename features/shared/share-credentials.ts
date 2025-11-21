import { Share } from 'react-native';

import type { UserRole } from '@/features/auth/types';

export type CredentialSharePayload = {
  fullName?: string | null;
  emailOrPhone: string;
  role: UserRole;
  tempPassword: string;
};

export async function shareCredentials(payload: CredentialSharePayload) {
  await Share.share({
    title: buildShareTitle(payload),
    message: buildShareMessage(payload),
  });
}

function buildShareTitle(payload: CredentialSharePayload) {
  const displayName = payload.fullName?.trim() || payload.emailOrPhone;
  return `Share credentials with ${displayName}`;
}

function buildShareMessage(payload: CredentialSharePayload) {
  const displayName = payload.fullName?.trim() || payload.emailOrPhone;
  return `Hey ${displayName}, here's your password for the route planner: ${payload.tempPassword}. Sign in and update it from Settings once you're in.`;
}
