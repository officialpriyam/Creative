import { SandboxProvider, SandboxProviderConfig } from './types';
import { VercelProvider } from './providers/vercel-provider';
import { appConfig } from '@/config/app.config';

export class SandboxFactory {
  static create(provider?: string, config?: SandboxProviderConfig): SandboxProvider {
    const selectedProvider = provider || process.env.SANDBOX_PROVIDER || appConfig.sandboxProvider;
    
    
    switch (selectedProvider.toLowerCase()) {
      case 'webcontainer':
        throw new Error('WebContainer runs in the browser and does not use the server sandbox provider API.');

      case 'vercel':
        return new VercelProvider(config || {});
      
      default:
        throw new Error(`Unknown sandbox provider: ${selectedProvider}. Supported providers: webcontainer, vercel`);
    }
  }
  
  static getAvailableProviders(): string[] {
    return ['webcontainer', 'vercel'];
  }
  
  static isProviderAvailable(provider: string): boolean {
    switch (provider.toLowerCase()) {
      case 'webcontainer':
        return true;

      case 'vercel':
        // Vercel can use OIDC (automatic) or PAT
        return !!process.env.VERCEL_OIDC_TOKEN || 
               (!!process.env.VERCEL_TOKEN && !!process.env.VERCEL_TEAM_ID && !!process.env.VERCEL_PROJECT_ID);
      
      default:
        return false;
    }
  }
}
