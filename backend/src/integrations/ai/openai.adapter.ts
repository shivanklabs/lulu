import { ChatMessage, AICompletionOptions, AICompletionResult, IAIProviderAdapter } from './ai.types';

export class OpenAIAdapter implements IAIProviderAdapter {
  readonly name = 'openai';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  private sanitizeMessage(text: string): string {
    if (!this.apiKey || this.apiKey.length === 0) return text;
    return text.split(this.apiKey).join('[REDACTED_API_KEY]');
  }

  async generateText(
    messages: ChatMessage[],
    options?: AICompletionOptions
  ): Promise<AICompletionResult> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw new Error('OpenAI API key is not configured.');
    }

    const url = `${this.baseUrl}/chat/completions`;
    const timeoutMs = options?.timeoutMs || 15000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.2,
          max_tokens: options?.maxTokens ?? 1024,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${this.sanitizeMessage(errorText)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const replyText = data.choices?.[0]?.message?.content || '';

      return {
        content: replyText,
        provider: this.name,
        model: this.model,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateStructuredResponse<T>(
    messages: ChatMessage[],
    schemaDescription: string,
    options?: AICompletionOptions
  ): Promise<T> {
    const systemPrompt: ChatMessage = {
      role: 'system',
      content: `Respond strictly with a valid JSON object matching this schema description: ${schemaDescription}. Do not include markdown wraps. Pure JSON only.`,
    };

    const result = await this.generateText([systemPrompt, ...messages], options);
    try {
      const sanitized = result.content.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(sanitized) as T;
    } catch {
      throw new Error(`Failed to parse structured JSON response from OpenAI: ${this.sanitizeMessage(result.content)}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }
}
