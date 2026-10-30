import { env } from '../../config/env';
import { IAIProviderAdapter } from './ai.types';
import { MockAIAdapter } from './mock.adapter';
import { GeminiAIAdapter } from './gemini.adapter';
import { OpenAIAdapter } from './openai.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { GeminiMultimodalAdapter } from '../gemini-multimodal.adapter';

export class AIProviderFactory {
  private static cachedAdapter: IAIProviderAdapter | null = null;
  private static multimodalAdapter: GeminiMultimodalAdapter | null = null;

  private static cleanKey(key?: string): string {
    if (!key) return '';
    return key.trim().replace(/^["']|["']$/g, '').trim();
  }

  static isLiveGeminiAvailable(): boolean {
    const key = this.cleanKey(
      env.GEMINI_API_KEY || (env.AI_API_KEY?.startsWith('AIza') ? env.AI_API_KEY : '')
    );
    return Boolean(key && key.length > 0);
  }

  static getAIStatus(): { liveAiActive: boolean; provider: string; model: string } {
    const isTest = env.NODE_ENV === 'test';
    const hasKey = this.isLiveGeminiAvailable();
    const activeProvider = !isTest && hasKey ? 'gemini' : env.AI_PROVIDER;
    const model = activeProvider === 'gemini' ? (env.GEMINI_MODEL || 'gemini-2.5-flash') : env.AI_MODEL;
    return {
      liveAiActive: activeProvider === 'gemini' && hasKey,
      provider: activeProvider,
      model,
    };
  }

  static getProvider(providerOverride?: string): IAIProviderAdapter {
    const isTest = env.NODE_ENV === 'test';
    const effectiveGeminiKey = this.cleanKey(
      env.GEMINI_API_KEY || (env.AI_API_KEY?.startsWith('AIza') ? env.AI_API_KEY : '')
    );

    let providerName = providerOverride || env.AI_PROVIDER;

    // Auto-detection: If Gemini key is available and not running in test with default mock, resolve to gemini
    if (!providerOverride && !isTest && effectiveGeminiKey && providerName === 'mock') {
      providerName = 'gemini';
    }

    switch (providerName) {
      case 'gemini': {
        const apiKey = effectiveGeminiKey || this.cleanKey(env.GEMINI_API_KEY) || this.cleanKey(env.AI_API_KEY);
        const model = (env.AI_MODEL && env.AI_MODEL !== 'mock-model')
          ? env.AI_MODEL
          : (env.GEMINI_MODEL || 'gemini-2.5-flash');
        return new GeminiAIAdapter(apiKey, model);
      }
      case 'openai': {
        const model = (env.AI_MODEL && env.AI_MODEL !== 'mock-model' && !env.AI_MODEL.startsWith('gemini-'))
          ? env.AI_MODEL
          : 'gpt-4o-mini';
        return new OpenAIAdapter(this.cleanKey(env.AI_API_KEY), model);
      }
      case 'anthropic': {
        const model = (env.AI_MODEL && env.AI_MODEL !== 'mock-model' && !env.AI_MODEL.startsWith('gemini-'))
          ? env.AI_MODEL
          : 'claude-3-5-sonnet-20241022';
        return new AnthropicAdapter(this.cleanKey(env.AI_API_KEY), model);
      }
      case 'mock':
      default:
        return new MockAIAdapter();
    }
  }

  static getMultimodalAdapter(): GeminiMultimodalAdapter {
    if (!this.multimodalAdapter) {
      const effectiveGeminiKey = this.cleanKey(
        env.GEMINI_API_KEY || (env.AI_API_KEY?.startsWith('AIza') ? env.AI_API_KEY : '')
      );
      const apiKey = effectiveGeminiKey || this.cleanKey(env.GEMINI_API_KEY) || this.cleanKey(env.AI_API_KEY);
      const model = (env.AI_MODEL && env.AI_MODEL !== 'mock-model')
        ? env.AI_MODEL
        : (env.GEMINI_MODEL || 'gemini-2.5-flash');
      this.multimodalAdapter = new GeminiMultimodalAdapter(apiKey, model);
    }
    return this.multimodalAdapter;
  }

  static getDefaultProvider(): IAIProviderAdapter {
    if (!this.cachedAdapter) {
      this.cachedAdapter = this.getProvider();
    }
    return this.cachedAdapter;
  }

  static setProvider(adapter: IAIProviderAdapter | null): void {
    this.cachedAdapter = adapter;
  }

  static resetProvider(): void {
    this.cachedAdapter = null;
    this.multimodalAdapter = null;
  }
}
