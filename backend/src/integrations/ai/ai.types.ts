export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AICompletionResult {
  content: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface IAIProviderAdapter {
  readonly name: string;
  readonly model: string;
  generateText(messages: ChatMessage[], options?: AICompletionOptions): Promise<AICompletionResult>;
  generateStructuredResponse<T>(
    messages: ChatMessage[],
    schemaDescription: string,
    options?: AICompletionOptions
  ): Promise<T>;
  healthCheck(): Promise<boolean>;
}
