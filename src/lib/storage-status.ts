export function storageAdapterStatus(environment: NodeJS.ProcessEnv = process.env) {
  const provider = environment.STORAGE_PROVIDER ?? 'local';
  const configured = provider === 'local' || (provider === 's3' && !!environment.STORAGE_REGION && !!environment.STORAGE_BUCKET && !!environment.STORAGE_ACCESS_KEY && !!environment.STORAGE_SECRET_KEY);
  return { provider, configured, persistence: provider === 'local' ? 'filesystem' : provider === 's3' ? 'object-storage' : 'unsupported' };
}
