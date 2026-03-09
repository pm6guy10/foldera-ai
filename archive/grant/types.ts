import { z } from 'zod'

export const CategoryCapSchema = z.object({
  amount: z.number().nonnegative(),
  percentage: z.number().min(0).max(100).optional(),
})

export const ExtractedConstraintsSchema = z.object({
  total_award: z.number().positive(),
  category_caps: z.record(z.string(), CategoryCapSchema).optional().default({}),
  kpi_targets: z.record(z.string(), z.object({
    target: z.number(),
    deadline: z.string().optional(),
  })).optional().default({}),
  reporting_deadlines: z.array(z.object({
    report_type: z.string(),
    due_date: z.string(),
  })).optional().default([]),
  restricted_categories: z.array(z.string()).optional().default([]),
  amendments: z.array(z.unknown()).optional().default([]),
})

export type ExtractedConstraints = z.infer<typeof ExtractedConstraintsSchema>

export interface Violation {
  code: string
  message: string
  category?: string
  constraintId: string
  computedValue: number
  threshold: number
  comparisonOperator: 'gt' | 'lt' | 'eq'
  calculationInputs: {
    label: string
    value: number
  }[]
}

export interface Warning {
  code: string
  message: string
  category?: string
  constraintId: string
  computedValue: number
  threshold: number
  percentUsed?: number
}

export interface ValidationResult {
  compliant: boolean
  violations: Violation[]
  warnings: Warning[]
}
