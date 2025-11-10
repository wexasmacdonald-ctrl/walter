import { Asset } from 'expo-asset';
import { router } from 'expo-router';

export const LEGAL_DOCUMENTS = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-argument
    asset: Asset.fromModule(require('../../assets/legal/privacy-policy.md')),
  },
  terms: {
    id: 'terms',
    title: 'Terms of Use',
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-argument
    asset: Asset.fromModule(require('../../assets/legal/terms-of-use.md')),
  },
} as const;

export type LegalDocumentId = keyof typeof LEGAL_DOCUMENTS;

export function getLegalDocumentConfig(id: LegalDocumentId) {
  return LEGAL_DOCUMENTS[id];
}

function openLegalDocument(id: LegalDocumentId) {
  router.push(`/legal/${id}`);
}

export function openPrivacyPolicy() {
  openLegalDocument('privacy');
}

export function openTermsOfUse() {
  openLegalDocument('terms');
}
