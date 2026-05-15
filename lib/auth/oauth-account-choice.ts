export type FolderaOAuthProvider = 'google' | 'azure-ad';

export const GOOGLE_ACCOUNT_CHOICE_PROMPT = 'consent select_account';
export const MICROSOFT_ACCOUNT_CHOICE_PROMPT = 'select_account';

export function getAccountChoiceAuthorizationParams(provider: FolderaOAuthProvider) {
  return {
    prompt:
      provider === 'google'
        ? GOOGLE_ACCOUNT_CHOICE_PROMPT
        : MICROSOFT_ACCOUNT_CHOICE_PROMPT,
  };
}
