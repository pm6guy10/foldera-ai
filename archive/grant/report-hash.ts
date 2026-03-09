import { createHash } from 'crypto'
import type { ExtractedConstraints, ValidationResult } from './types'

export function generateReportHash(
  constraints: ExtractedConstraints,
  budgetCsv: string,
  result: ValidationResult
): string {
  const payload = JSON.stringify({
    constraints,
    budgetCsv,
    violations: result.violations,
    warnings: result.warnings,
  })
  return createHash('sha256').update(payload).digest('hex')
}
