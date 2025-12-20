/**
 * Sanitizes user-provided content before including in AI prompts.
 * Prevents prompt injection attacks.
 */
export function sanitizeForPrompt(input: string, maxLength: number = 10000): string {
  if (!input) return '';
  
  let sanitized = input;

  // 1. Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '... [truncated]';
  }

  // 2. Remove potential instruction patterns
  const instructionPatterns = [
    /ignore (all )?(previous |above )?(instructions|prompts)/gi,
    /disregard (all )?(previous |above )?(instructions|prompts)/gi,
    /forget (all )?(previous |above )?(instructions|prompts)/gi,
    /new instructions?:/gi,
    /system prompt:/gi,
    /you are now/gi,
    /act as if/gi,
    /pretend (that )?(you are|to be)/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
  ];

  for (const pattern of instructionPatterns) {
    sanitized = sanitized.replace(pattern, '[FILTERED]');
  }

  // 3. Remove Base64 encoded content (potential hidden instructions)
  sanitized = sanitized.replace(
    /[A-Za-z0-9+/]{50,}={0,2}/g,
    '[BASE64_REMOVED]'
  );

  // 4. Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Escapes special characters that might affect prompt parsing
 */
export function escapePromptDelimiters(input: string): string {
  return input
    .replace(/```/g, '\\`\\`\\`')
    .replace(/"""/g, '\\"\\"\\"')
    .replace(/\{\{/g, '\\{\\{')
    .replace(/\}\}/g, '\\}\\}');
}

