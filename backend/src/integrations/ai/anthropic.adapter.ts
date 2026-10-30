import { ChatMessage, AICompletionOptions, AICompletionResult, IAIProviderAdapter } from './ai.types';

export class AnthropicAdapter implements IAIProviderAdapter {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = 'https://api.anthropic.com/v1';
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
      throw new Error('Anthropic API key is not configured.');
    }

    const systemMessage = messages.find((m) => m.role === 'system')?.content;
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const url = `${this.baseUrl}/messages`;
    const timeoutMs = options?.timeoutMs || 15000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          system: systemMessage,
          messages: chatMessages,
          max_tokens: options?.maxTokens ?? 1024,
          temperature: options?.temperature ?? 0.2,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${this.sanitizeMessage(errorText)}`);
      }

      const data = (await response.json()) as {
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const replyText = data.content?.[0]?.text || '';

      return {
        content: replyText,
        provider: this.name,
        model: this.model,
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
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
      content: `Respond strictly with a valid JSON object matching this schema description: ${schemaDescription}. No markdown formatting.`,
    };

    const result = await this.generateText([systemPrompt, ...messages], options);
    try {
      const sanitized = result.content.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(sanitized) as T;
    } catch {
      throw new Error(`Failed to parse structured JSON response from Anthropic: ${this.sanitizeMessage(result.content)}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }
}
