import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiAIAdapter } from '../../src/integrations/ai/gemini.adapter';
import { AIProviderFactory } from '../../src/integrations/ai/ai.factory';
import { ChatbotService, CLINICAL_DISCLAIMER } from '../../src/modules/chatbot/chatbot.service';

describe('Gemini AI Adapter & Chatbot Integration Tests', () => {
  const TEST_API_KEY = 'test_secret_gemini_api_key_12345';
  const TEST_MODEL = 'gemini-2.5-flash';
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    AIProviderFactory.resetProvider();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1. Missing API key
  describe('1. Missing API Key Validation', () => {
    it('throws error when API key is empty or omitted', async () => {
      const adapter = new GeminiAIAdapter('', TEST_MODEL);
      await expect(
        adapter.generateText([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Gemini API key is not configured.');
    });

    it('healthCheck returns false when API key is empty or whitespace', async () => {
      const adapter = new GeminiAIAdapter('   ', TEST_MODEL);
      expect(await adapter.healthCheck()).toBe(false);
    });
  });

  // 2. Valid Gemini configuration
  describe('2. Valid Gemini Configuration', () => {
    it('initializes with provided key and model and passes healthCheck', async () => {
      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      expect(adapter.name).toBe('gemini');
      expect(adapter.model).toBe(TEST_MODEL);
      expect(await adapter.healthCheck()).toBe(true);
    });

    it('falls back to default gemini-2.5-flash model when model is not provided', () => {
      const adapter = new GeminiAIAdapter(TEST_API_KEY);
      expect(adapter.model).toBe('gemini-2.5-flash');
    });
  });

  // 3. Successful provider response
  describe('3. Successful Provider Response', () => {
    it('successfully generates text using x-goog-api-key header and without query param key', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: Record<string, unknown> = {};

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = init.headers as Record<string, string>;
        capturedBody = JSON.parse(init.body as string);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Drink water and rest for mild headaches.' }],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 15,
              candidatesTokenCount: 12,
            },
          }),
        };
      });

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      const result = await adapter.generateText([
        { role: 'system', content: 'You are an informational assistant.' },
        { role: 'user', content: 'What should I do for a mild headache?' },
      ]);

      expect(result.content).toBe('Drink water and rest for mild headaches.');
      expect(result.provider).toBe('gemini');
      expect(result.model).toBe(TEST_MODEL);
      expect(result.promptTokens).toBe(15);
      expect(result.completionTokens).toBe(12);

      // Verify API Key security in transport:
      // Must NOT include key in URL query string
      expect(capturedUrl).not.toContain('key=');
      expect(capturedUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
      // Must include x-goog-api-key in header
      expect(capturedHeaders['x-goog-api-key']).toBe(TEST_API_KEY);

      // Verify payload separation: systemInstruction vs contents
      expect(capturedBody.systemInstruction).toBeDefined();
      expect(capturedBody.contents).toBeDefined();
      const sys = capturedBody.systemInstruction as { parts: Array<{ text: string }> };
      expect(sys.parts[0].text).toContain('You are an informational assistant.');
    });

    it('generates structured JSON responses correctly and sanitizes markdown blocks', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '```json\n{"recommendation":"Rest","urgency":"ROUTINE"}\n```' }],
              },
            },
          ],
        }),
      }));

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      interface TestOutput {
        recommendation: string;
        urgency: string;
      }
      const structured = await adapter.generateStructuredResponse<TestOutput>(
        [{ role: 'user', content: 'Analyze symptoms' }],
        'JSON with recommendation and urgency'
      );

      expect(structured).toEqual({
        recommendation: 'Rest',
        urgency: 'ROUTINE',
      });
    });
  });

  // 4. Invalid API key / unauthorized provider response
  describe('4. Invalid API Key / Unauthorized Provider Response', () => {
    it('throws user-friendly error on 401 Unauthorized without leaking key', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: `API_KEY_INVALID: ${TEST_API_KEY}` } }),
      }));

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      await expect(
        adapter.generateText([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Gemini API authentication failed: Invalid or unauthorized API key.');
    });

    it('throws user-friendly error on 403 Forbidden without leaking key', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Permission denied for resource' } }),
      }));

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      await expect(
        adapter.generateText([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Gemini API authentication failed: Invalid or unauthorized API key.');
    });
  });

  // 5. Rate-limit and network errors
  describe('5. Rate-Limit & Network Errors Handling', () => {
    it('retries on 429 rate limit and fails gracefully when retries are exhausted', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'Resource exhausted (quota exceeded)' } }),
        };
      });

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      await expect(
        adapter.generateText([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Gemini API rate limit exceeded. Please retry later.');

      // Initial attempt + 2 retries = 3 attempts total
      expect(callCount).toBe(3);
    });

    it('succeeds if retry succeeds after an initial 429 rate limit', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            json: async () => ({ error: { message: 'Rate limit' } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: { parts: [{ text: 'Recovered response after retry.' }] },
              },
            ],
          }),
        };
      });

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      const res = await adapter.generateText([{ role: 'user', content: 'Hello' }]);
      expect(res.content).toBe('Recovered response after retry.');
      expect(callCount).toBe(2);
    });

    it('handles network connection failures cleanly without crashing', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      await expect(
        adapter.generateText([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('fetch failed: ECONNREFUSED');
    });
  });

  // 6. Malformed response and timeout handling
  describe('6. Malformed Response & Timeout Handling', () => {
    it('handles empty candidates array gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [] }),
      });

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      await expect(
        adapter.generateText([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Gemini API returned no response candidates.');
    });

    it('detects and reports responses blocked by Gemini safety filters', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              finishReason: 'SAFETY',
              content: { parts: [] },
            },
          ],
        }),
      });

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      await expect(
        adapter.generateText([{ role: 'user', content: 'Unsafe prompt' }])
      ).rejects.toThrow('Gemini API response was blocked by safety filters.');
    });

    it('handles request timeouts cleanly when AbortSignal triggers', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      await expect(
        adapter.generateText([{ role: 'user', content: 'Hello' }], { timeoutMs: 50 })
      ).rejects.toThrow('Gemini request timed out after 50ms.');
    });
  });

  // 7. Provider factory selection
  describe('7. Provider Factory Selection', () => {
    it('selects GeminiAIAdapter when provider is set to gemini', () => {
      const provider = AIProviderFactory.getProvider('gemini');
      expect(provider.name).toBe('gemini');
      expect(provider instanceof GeminiAIAdapter).toBe(true);
    });

    it('falls back to MockAIAdapter when provider is mock', () => {
      const provider = AIProviderFactory.getProvider('mock');
      expect(provider.name).toBe('mock');
    });

    it('getMultimodalAdapter initializes with Gemini multimodal adapter', () => {
      const multimodal = AIProviderFactory.getMultimodalAdapter();
      expect(multimodal.name).toBe('gemini-multimodal');
    });

    it('resolves OpenAI default model to gpt-4o-mini when AI_MODEL is mock-model', () => {
      const provider = AIProviderFactory.getProvider('openai');
      expect(provider.name).toBe('openai');
      expect(provider.model).toBe('gpt-4o-mini');
    });

    it('resolves Anthropic default model to claude-3-5-sonnet-20241022 when AI_MODEL is mock-model', () => {
      const provider = AIProviderFactory.getProvider('anthropic');
      expect(provider.name).toBe('anthropic');
      expect(provider.model).toBe('claude-3-5-sonnet-20241022');
    });
  });

  // 8. Chatbot safety and existing response contract
  describe('8. Chatbot Safety & Response Contract with Gemini Provider', () => {
    it('routes chatbot messages through Gemini, scrubs PII, and appends clinical disclaimer', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'For common colds, rest and proper hydration are advisable.' }],
              },
            },
          ],
        }),
      });

      // Temporarily override cached provider with Gemini provider
      vi.spyOn(AIProviderFactory, 'getDefaultProvider').mockReturnValue(
        new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL)
      );

      const rawUserMessage = 'My email is patient.secret@example.com and phone is 9876543210. I have a cold.';
      const res = await ChatbotService.processMessage(rawUserMessage);

      expect(res.reply).toBe('For common colds, rest and proper hydration are advisable.');
      expect(res.disclaimer).toBe(CLINICAL_DISCLAIMER);
      expect(res.provider).toBe('gemini');
      expect(res.model).toBe(TEST_MODEL);
    });

    it('guarantees PII is scrubbed before reaching Gemini adapter', async () => {
      let sentBody = '';
      globalThis.fetch = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
        sentBody = init.body as string;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Guidance text' }] } }],
          }),
        };
      });

      vi.spyOn(AIProviderFactory, 'getDefaultProvider').mockReturnValue(
        new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL)
      );

      await ChatbotService.processMessage('Contact me at patient@hospital.in or 9876543210');

      expect(sentBody).not.toContain('patient@hospital.in');
      expect(sentBody).not.toContain('9876543210');
      expect(sentBody).toContain('[REDACTED_EMAIL]');
      expect(sentBody).toContain('[REDACTED_ID_OR_PHONE]');
    });
  });

  // 9. Confirmation that secrets are not returned or leaked
  describe('9. Secret Leakage Prevention & Sanitization', () => {
    it('redacts raw API key if provider error text includes the key', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: `Invalid request with key ${TEST_API_KEY}. Please check configuration.`,
          },
        }),
      });

      const adapter = new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL);
      let errorThrown: Error | null = null;
      try {
        await adapter.generateText([{ role: 'user', content: 'Test' }]);
      } catch (err: unknown) {
        errorThrown = err as Error;
      }

      expect(errorThrown).not.toBeNull();
      expect(errorThrown?.message).not.toContain(TEST_API_KEY);
      expect(errorThrown?.message).toContain('[REDACTED_API_KEY]');
    });

    it('ensures successful ChatbotService result never contains the API key', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Clinical guidance response.' }] } }],
        }),
      });

      vi.spyOn(AIProviderFactory, 'getDefaultProvider').mockReturnValue(
        new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL)
      );

      const res = await ChatbotService.processMessage('Headache guidance');
      const serialized = JSON.stringify(res);
      expect(serialized).not.toContain(TEST_API_KEY);
    });
  });

  // 10. Graceful Runtime Fallback and Auto-Resolution
  describe('10. Graceful Runtime Fallback & Auto-Resolution (Phase 3)', () => {
    it('seamlessly returns clinical fallback response without throwing 500/503 when live Gemini call fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Quota exceeded 429'));

      vi.spyOn(AIProviderFactory, 'getDefaultProvider').mockReturnValue(
        new GeminiAIAdapter(TEST_API_KEY, TEST_MODEL)
      );

      const res = await ChatbotService.processMessage('I have a severe cough');
      expect(res.reply).toContain('Clinical Fallback');
      expect(res.provider).toBe('fallback');
      expect(res.liveAiActive).toBe(false);
      expect(res.disclaimer).toBe(CLINICAL_DISCLAIMER);
    });

    it('reports AI status correctly via AIProviderFactory.getAIStatus', () => {
      const status = AIProviderFactory.getAIStatus();
      expect(status).toHaveProperty('liveAiActive');
      expect(status).toHaveProperty('provider');
      expect(status).toHaveProperty('model');
    });
  });
});
