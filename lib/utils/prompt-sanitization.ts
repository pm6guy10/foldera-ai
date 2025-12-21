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

/**
 * Sanitizes email content specifically
 * Removes signatures, disclaimers, and forwarded content
 */
export function sanitizeEmailForPrompt(emailBody: string, maxLength: number = 3000): string {
  if (!emailBody) return '';
  
  let cleaned = emailBody;
  
  // Remove common email signatures
  const signaturePatterns = [
    /--\s*\n[\s\S]*$/,  // -- signature
    /Sent from my [\w\s]+$/i,
    /Get Outlook for [\w\s]+$/i,
    /\n_{3,}[\s\S]*$/,  // ___ signature line
    /\nBest,?\n[\s\S]*$/i,
    /\nRegards,?\n[\s\S]*$/i,
    /\nThanks,?\n[\s\S]*$/i,
  ];
  
  for (const pattern of signaturePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove forwarded/replied content
  cleaned = cleaned.replace(/\n>+\s.*$/gm, '');
  cleaned = cleaned.replace(/On .* wrote:[\s\S]*$/i, '');
  cleaned = cleaned.replace(/From:.*Sent:.*To:.*Subject:[\s\S]*$/i, '');
  
  // Remove disclaimers
  cleaned = cleaned.replace(/CONFIDENTIALITY NOTICE[\s\S]*$/i, '');
  cleaned = cleaned.replace(/This email and any attachments[\s\S]*$/i, '');
  
  return sanitizeForPrompt(cleaned, maxLength);
}

/**
 * Creates a safe JSON string for embedding in prompts
 */
export function safeJsonForPrompt(obj: unknown): string {
  try {
    const json = JSON.stringify(obj, null, 2);
    return sanitizeForPrompt(json, 8000);
  } catch {
    return '{}';
  }
}

