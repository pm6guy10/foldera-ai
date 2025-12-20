// =====================================================
// PROMPT SANITIZATION
// Prevents prompt injection attacks
// =====================================================

/**
 * Sanitize user content before including in AI prompts
 * Removes or escapes potentially dangerous patterns
 */
export function sanitizeForPrompt(content: string, maxLength: number = 10000): string {
  if (!content) {
    return '';
  }
  
  // Truncate to max length
  let sanitized = content.substring(0, maxLength);
  
  // Remove or escape common prompt injection patterns
  // These patterns could trick the AI into ignoring instructions
  
  // 1. Remove instruction-like patterns at the start
  sanitized = sanitized.replace(
    /^(ignore|forget|disregard|override|system|assistant|user):\s*/gim,
    ''
  );
  
  // 2. Remove markdown code blocks that might contain instructions
  sanitized = sanitized.replace(/```[\s\S]*?```/g, '[code block removed]');
  
  // 3. Remove XML-like tags that might be instructions
  sanitized = sanitized.replace(/<[^>]+>/g, '');
  
  // 4. Escape newlines in a way that preserves readability but prevents injection
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
  
  // 5. Remove potential base64 or encoded content
  sanitized = sanitized.replace(/[A-Za-z0-9+/]{50,}={0,2}/g, '[encoded content]');
  
  // 6. Remove URLs that might contain instructions
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '[url removed]');
  
  // 7. Limit special characters that could be used for injection
  // Keep common punctuation but remove excessive special chars
  sanitized = sanitized.replace(/[^\w\s.,!?;:'"()-]{3,}/g, '');
  
  return sanitized.trim();
}

/**
 * Sanitize email content for prompts
 */
export function sanitizeEmailForPrompt(email: {
  subject?: string;
  body?: string;
  from?: string;
  to?: string;
}): string {
  const parts: string[] = [];
  
  if (email.from) {
    parts.push(`From: ${sanitizeForPrompt(email.from, 200)}`);
  }
  
  if (email.to) {
    parts.push(`To: ${sanitizeForPrompt(email.to, 200)}`);
  }
  
  if (email.subject) {
    parts.push(`Subject: ${sanitizeForPrompt(email.subject, 500)}`);
  }
  
  if (email.body) {
    parts.push(`Body: ${sanitizeForPrompt(email.body, 5000)}`);
  }
  
  return parts.join('\n');
}

