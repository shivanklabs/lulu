import { ChatMessage, AICompletionOptions, AICompletionResult, IAIProviderAdapter } from './ai.types';

export class GeminiAIAdapter implements IAIProviderAdapter {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, model: string = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Redacts raw API key from strings to prevent secret leakage in error logs or responses.
   */
  private sanitizeMessage(text: string): string {
    if (!this.apiKey || this.apiKey.length === 0) return text;
    return text.split(this.apiKey).join('[REDACTED_API_KEY]');
  }

  /**
   * Formats ChatMessages into Gemini v1beta REST payload.
   * System messages are mapped to top-level systemInstruction.
   * Non-system messages alternate between 'user' and 'model' turns.
   */
  private formatPayload(
    messages: ChatMessage[],
    options?: AICompletionOptions
  ): Record<string, unknown> {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const msg of conversationMessages) {
      const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
      const lastTurn = contents[contents.length - 1];

      if (lastTurn && lastTurn.role === role) {
        lastTurn.parts.push({ text: msg.content });
      } else {
        contents.push({ role, parts: [{ text: msg.content }] });
      }
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.maxTokens ?? 1024,
      },
    };

    if (systemMessages.length > 0) {
      payload.systemInstruction = {
        parts: [{ text: systemMessages.map((m) => m.content).join('\n\n') }],
      };
    }

    return payload;
  }

  async generateText(
    messages: ChatMessage[],
    options?: AICompletionOptions
  ): Promise<AICompletionResult> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw new Error('Gemini API key is not configured.');
    }

    const payload = this.formatPayload(messages, options);
    // Authenticate via x-goog-api-key header; never place key in URL query parameter
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const timeoutMs = options?.timeoutMs || 15000;

    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (response.ok) {
          const data = (await response.json()) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
              finishReason?: string;
            }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          };

          const candidate = data.candidates?.[0];
          if (!candidate) {
            throw new Error('Gemini API returned no response candidates.');
          }

          if (candidate.finishReason === 'SAFETY') {
            throw new Error('Gemini API response was blocked by safety filters.');
          }

          const replyText = candidate.content?.parts?.[0]?.text || '';

          return {
            content: replyText,
            provider: this.name,
            model: this.model,
            promptTokens: data.usageMetadata?.promptTokenCount,
            completionTokens: data.usageMetadata?.candidatesTokenCount,
          };
        }

        // Handle retryable status codes (429 Rate Limit, 503 Service Unavailable)
        if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
          attempt++;
          const delayMs = process.env.NODE_ENV === 'test' ? 5 : Math.min(250 * Math.pow(2, attempt), 2000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        // Non-retryable or retries exhausted
        if (response.status === 401 || response.status === 403) {
          throw new Error('Gemini API authentication failed: Invalid or unauthorized API key.');
        }

        if (response.status === 429) {
          throw new Error('Gemini API rate limit exceeded. Please retry later.');
        }

        if (response.status === 503) {
          throw new Error('Gemini API service is temporarily unavailable.');
        }

        let errorMessage = `Gemini API error (${response.status})`;
        try {
          const errorJson = (await response.json()) as { error?: { message?: string } };
          if (errorJson.error?.message) {
            errorMessage += `: ${this.sanitizeMessage(errorJson.error.message)}`;
          }
        } catch {
          const rawText = await response.text().catch(() => '');
          if (rawText) {
            errorMessage += `: ${this.sanitizeMessage(rawText.slice(0, 200))}`;
          }
        }

        throw new Error(errorMessage);
      } catch (err: unknown) {
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            throw new Error(`Gemini request timed out after ${timeoutMs}ms.`);
          }
          // Re-throw already sanitized known errors
          throw err;
        }
        throw new Error('Unknown error occurred during Gemini API request.');
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('Gemini API request failed after retry attempts.');
  }

  async generateStructuredResponse<T>(
    messages: ChatMessage[],
    schemaDescription: string,
    options?: AICompletionOptions
  ): Promise<T> {
    const systemPrompt: ChatMessage = {
      role: 'system',
      content: `Respond strictly with a valid JSON object satisfying this specification: ${schemaDescription}. Do not include markdown code block syntax (like \`\`\`json). Output pure JSON only.`,
    };

    const result = await this.generateText([systemPrompt, ...messages], options);
    try {
      const sanitized = result.content.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(sanitized) as T;
    } catch {
      throw new Error(`Failed to parse structured JSON response from Gemini: ${this.sanitizeMessage(result.content)}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }
}
