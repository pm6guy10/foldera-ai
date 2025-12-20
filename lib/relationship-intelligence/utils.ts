import { Person, EmailMessage, ExtractionConfig, DEFAULT_EXTRACTION_CONFIG } from './types';

/**
 * Extracts the email address from a string like "John Doe <john@example.com>"
 */
export function extractEmail(emailString: string): string {
  const match = emailString.match(/<([^>]+)>/);
  if (match) {
    return match[1].toLowerCase().trim();
  }
  return emailString.toLowerCase().trim();
}

/**
 * Extracts the display name from a string like "John Doe <john@example.com>"
 */
export function extractName(emailString: string): string | null {
  const match = emailString.match(/^([^<]+)</);
  if (match) {
    const name = match[1].trim();
    // Don't return if it's just the email
    if (!name.includes('@')) {
      return name;
    }
  }
  return null;
}

/**
 * Extracts the domain from an email address
 */
export function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase() : '';
}

/**
 * Extracts company name from domain (basic heuristic)
 */
export function extractCompanyFromDomain(domain: string): string | null {
  // Remove common TLDs and www
  const cleaned = domain
    .replace(/^www\./i, '')
    .replace(/\.(com|org|net|io|co|ai|app|dev|tech)$/i, '')
    .replace(/\.(co\.[a-z]{2})$/i, '');  // .co.uk, etc.
  
  if (cleaned && cleaned.length > 1) {
    // Capitalize first letter
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return null;
}

/**
 * Creates a Person object from an email string
 */
export function createPerson(emailString: string): Person {
  const email = extractEmail(emailString);
  const name = extractName(emailString);
  const domain = extractDomain(email);
  const company = extractCompanyFromDomain(domain);
  
  return {
    email,
    name,
    domain,
    company,
  };
}

/**
 * Checks if an email should be excluded from relationship tracking
 */
export function shouldExcludeEmail(
  email: string, 
  config: ExtractionConfig = DEFAULT_EXTRACTION_CONFIG
): boolean {
  const lowerEmail = email.toLowerCase();
  const domain = extractDomain(lowerEmail);
  const localPart = lowerEmail.split('@')[0];
  
  // Check excluded domains
  for (const excludedDomain of config.excludedDomains) {
    if (localPart.includes(excludedDomain) || domain.includes(excludedDomain)) {
      return true;
    }
  }
  
  // Check excluded patterns
  for (const pattern of config.excludedPatterns) {
    if (pattern.test(lowerEmail)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Groups emails by the other party (not the user)
 */
export function groupEmailsByPerson(
  emails: EmailMessage[],
  userEmail: string,
  config: ExtractionConfig = DEFAULT_EXTRACTION_CONFIG
): Map<string, EmailMessage[]> {
  const grouped = new Map<string, EmailMessage[]>();
  const normalizedUserEmail = userEmail.toLowerCase();
  
  for (const email of emails) {
    // Determine the "other" party
    let otherParty: string;
    
    if (email.isFromUser) {
      // User sent this - get the primary recipient
      const recipients = [...email.to, ...email.cc];
      const nonUserRecipients = recipients
        .map(r => extractEmail(r))
        .filter(r => r !== normalizedUserEmail);
      
      if (nonUserRecipients.length === 0) continue;
      otherParty = nonUserRecipients[0];  // Primary recipient
    } else {
      // User received this - get the sender
      otherParty = extractEmail(email.from);
    }
    
    // Skip excluded emails
    if (shouldExcludeEmail(otherParty, config)) {
      continue;
    }
    
    // Skip self-emails
    if (otherParty === normalizedUserEmail) {
      continue;
    }
    
    // Add to group
    if (!grouped.has(otherParty)) {
      grouped.set(otherParty, []);
    }
    grouped.get(otherParty)!.push(email);
  }
  
  return grouped;
}

/**
 * Calculates days between two dates
 */
export function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculates minutes between two dates
 */
export function minutesBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffTime / (1000 * 60));
}

/**
 * Gets the start of a week for bucketing
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);  // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Generates week buckets between two dates
 */
export function generateWeekBuckets(startDate: Date, endDate: Date): Array<{ start: Date; end: Date }> {
  const buckets: Array<{ start: Date; end: Date }> = [];
  let current = getWeekStart(startDate);
  
  while (current <= endDate) {
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    buckets.push({
      start: new Date(current),
      end: weekEnd,
    });
    
    current.setDate(current.getDate() + 7);
  }
  
  return buckets;
}

/**
 * Generates a unique ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Clamps a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculates the average of an array of numbers
 */
export function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * Calculates the median of an array of numbers
 */
export function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

