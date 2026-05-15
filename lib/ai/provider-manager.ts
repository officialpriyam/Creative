import { appConfig } from '@/config/app.config';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

type ProviderName = 'openai' | 'anthropic' | 'groq' | 'google' | 'openrouter';

// Client function type returned by @ai-sdk providers
export type ProviderClient =
  | ReturnType<typeof createOpenAI>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGroq>
  | ReturnType<typeof createGoogleGenerativeAI>;

export interface ProviderResolution {
  client: ProviderClient;
  actualModel: string;
}

function configured(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(your_|replace_|changeme|placeholder)/i.test(trimmed)) return undefined;
  return trimmed;
}

const aiGatewayApiKey = configured(process.env.AI_GATEWAY_API_KEY);
const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';
const isUsingAIGateway = !!aiGatewayApiKey;
const openRouterBaseURL = 'https://openrouter.ai/api/v1';

// Cache provider clients by a stable key to avoid recreating
const clientCache = new Map<string, ProviderClient>();

function getEnvDefaults(provider: ProviderName): { apiKey?: string; baseURL?: string } {
  let defaults: { apiKey?: string; baseURL?: string };

  switch (provider) {
    case 'openai':
      defaults = { apiKey: configured(process.env.OPENAI_API_KEY), baseURL: process.env.OPENAI_BASE_URL };
      break;
    case 'anthropic':
      // Default Anthropic base URL mirrors existing routes
      defaults = { apiKey: configured(process.env.ANTHROPIC_API_KEY), baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1' };
      break;
    case 'groq':
      defaults = { apiKey: configured(process.env.GROQ_API_KEY), baseURL: process.env.GROQ_BASE_URL };
      break;
    case 'google':
      defaults = { apiKey: configured(process.env.GEMINI_API_KEY), baseURL: process.env.GEMINI_BASE_URL };
      break;
    case 'openrouter':
      defaults = { apiKey: configured(process.env.OPENROUTER_API_KEY), baseURL: process.env.OPENROUTER_BASE_URL || openRouterBaseURL };
      break;
    default:
      defaults = {};
  }

  if (!defaults.apiKey && isUsingAIGateway && provider !== 'openrouter') {
    return { apiKey: aiGatewayApiKey, baseURL: aiGatewayBaseURL };
  }

  return defaults;
}

function getOrCreateClient(provider: ProviderName, apiKey?: string, baseURL?: string): ProviderClient {
  const defaults = getEnvDefaults(provider);
  const effective = {
    apiKey: apiKey || defaults.apiKey,
    baseURL: baseURL ?? defaults.baseURL,
  };

  const cacheKey = `${provider}:${effective.apiKey || ''}:${effective.baseURL || ''}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  let client: ProviderClient;
  switch (provider) {
    case 'openai':
      client = createOpenAI({ apiKey: effective.apiKey, baseURL: effective.baseURL });
      break;
    case 'anthropic':
      client = createAnthropic({ apiKey: effective.apiKey, baseURL: effective.baseURL });
      break;
    case 'groq':
      client = createGroq({ apiKey: effective.apiKey, baseURL: effective.baseURL });
      break;
    case 'google':
      client = createGoogleGenerativeAI({ apiKey: effective.apiKey, baseURL: effective.baseURL });
      break;
    case 'openrouter':
      client = createOpenAI({ apiKey: effective.apiKey, baseURL: effective.baseURL });
      break;
    default:
      client = createGroq({ apiKey: effective.apiKey, baseURL: effective.baseURL });
  }

  clientCache.set(cacheKey, client);
  return client;
}

export function getDefaultFreeModelId(): string {
  if (configured(process.env.GROQ_API_KEY)) {
    return 'openai/gpt-oss-20b';
  }

  if (configured(process.env.GEMINI_API_KEY)) {
    return 'google/gemini-2.5-flash-lite';
  }

  if (configured(process.env.OPENROUTER_API_KEY)) {
    return 'openrouter/free';
  }

  if (isUsingAIGateway) {
    return 'openai/gpt-oss-20b';
  }

  throw new Error('No free AI provider key configured. Set GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY.');
}

export function getProviderForModel(modelId: string): ProviderResolution {
  if (modelId === 'free/auto') {
    return getProviderForModel(getDefaultFreeModelId());
  }

  // 1) Check explicit model configuration in app config (custom models)
  const explicitConfig = appConfig.ai.modelApiConfig?.[modelId as keyof typeof appConfig.ai.modelApiConfig];
  if (explicitConfig) {
    const { provider, apiKey, baseURL, model } = explicitConfig as { provider: ProviderName; apiKey?: string; baseURL?: string; model: string };
    const client = getOrCreateClient(provider, apiKey, baseURL);
    return { client, actualModel: model };
  }

  // 2) Fallback logic based on prefixes and special cases
  const isAnthropic = modelId.startsWith('anthropic/');
  const isOpenAI = modelId.startsWith('openai/');
  const isGoogle = modelId.startsWith('google/');
  const isOpenRouter = modelId.startsWith('openrouter/');
  const isKimiGroq = modelId === 'moonshotai/kimi-k2-instruct-0905';

  if (isKimiGroq) {
    const client = getOrCreateClient('groq');
    return { client, actualModel: 'moonshotai/kimi-k2-instruct-0905' };
  }

  if (isAnthropic) {
    const client = getOrCreateClient('anthropic');
    return { client, actualModel: modelId.replace('anthropic/', '') };
  }

  if (isOpenAI) {
    const client = getOrCreateClient('openai');
    return { client, actualModel: modelId.replace('openai/', '') };
  }

  if (isGoogle) {
    const client = getOrCreateClient('google');
    return { client, actualModel: modelId.replace('google/', '') };
  }

  if (isOpenRouter) {
    const client = getOrCreateClient('openrouter');
    return { client, actualModel: modelId };
  }

  // Default: use Groq with modelId as-is
  const client = getOrCreateClient('groq');
  return { client, actualModel: modelId };
}

export default getProviderForModel;
