export class SanitizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SanitizationError";
  }
}

export const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all|previous)\s+instructions/i,
  /system\s+prompt/i,
  /you\s+are\s+now/i,
  /developer\s+message/i,
  /<\|im_start\|>|<\|im_end\|>/i,
  /\[inst\]|\[\/inst\]/i,
  /jailbreak|override|bypass/i
];

export function sanitizeGoalInput(raw: string): string {
  const withoutHtml = raw.replace(/<[^>]*>/g, "");

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(withoutHtml)) {
      throw new SanitizationError("Goal input contains disallowed prompt-injection content");
    }
  }

  return withoutHtml.trim().slice(0, 2000);
}
