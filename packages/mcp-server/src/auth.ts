export const KEYCHAIN_SERVICE = "brighty-mcp";
export const KEYCHAIN_ACCOUNT = "default";

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "Brighty API key not found. Set the BRIGHTY_API_KEY environment variable, or run the login CLI to store it in the OS keychain: `yarn login` (local checkout), `brighty-mcp login` (after a global install), or `npx -y -p @brighty/mcp-server brighty-mcp login` (no install).",
    );
    this.name = "MissingApiKeyError";
  }
}

export interface KeychainProvider {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword?(service: string, account: string): Promise<boolean>;
}

let keychainOverride: KeychainProvider | undefined;

export function setKeychainProvider(provider: KeychainProvider | undefined): void {
  keychainOverride = provider;
}

async function getKeychain(): Promise<KeychainProvider> {
  if (keychainOverride) return keychainOverride;
  const mod = (await import("keytar")) as unknown as KeychainProvider & {
    default?: KeychainProvider;
  };
  return mod.default ?? mod;
}

export async function getApiKey(): Promise<string> {
  const fromEnv = process.env.BRIGHTY_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const keychain = await getKeychain();
  const fromKeychain = (await keychain.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT))?.trim();
  if (fromKeychain) return fromKeychain;

  throw new MissingApiKeyError();
}

export async function saveApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("Cannot save an empty API key.");
  const keychain = await getKeychain();
  await keychain.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, trimmed);
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "***";
  return `***${trimmed.slice(-4)}`;
}
