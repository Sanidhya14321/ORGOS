export class LLMProviderError extends Error {
  statusCode: number | undefined;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "LLMProviderError";
    this.statusCode = statusCode;
  }
}

export class RateLimitError extends LLMProviderError {
  constructor(message = "LLM provider rate limit exceeded") {
    super(message, 429);
    this.name = "RateLimitError";
  }
}

export class LLMTimeoutError extends LLMProviderError {
  constructor(message = "LLM provider timeout") {
    super(message);
    this.name = "LLMTimeoutError";
  }
}

export class AllProvidersExhaustedError extends Error {
  constructor(message = "All LLM providers failed") {
    super(message);
    this.name = "AllProvidersExhaustedError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
