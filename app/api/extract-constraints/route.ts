import { NextResponse } from 'next/server'
import { ExtractedConstraintsSchema } from '@/lib/grant/types'

const MAX_INPUT_CHARS = 40000

const BASE_SYSTEM_PROMPT = `You are a deterministic grant compliance extraction engine.

Extract structured constraints from the grant award letter.

Return ONLY valid JSON matching this exact shape:

{
  "total_award": number,
  "category_caps": {
    "[Exact Category Name]": {
      "amount": number,
      "percentage": number (only if explicitly stated)
    }
  },
  "kpi_targets": {},
  "reporting_deadlines": [],
  "restricted_categories": [],
  "amendments": []
}

Rules:

1. Extract EVERY explicitly prohibited activity into restricted_categories.
   Examples: lobbying, political activity, religious instruction, worship.
   Use short lowercase terms only.
   Do NOT omit restrictions.

2. For category_caps:
   - Use short canonical category names.
   - Strip parenthetical qualifiers.
   Example:
     "Personnel (salaries and benefits)" → "Personnel"
   - Do not include parentheses in keys.

3. If a percentage cap is stated, include it.
   If not stated, omit the percentage field.

4. Return only raw JSON.
   No markdown.
   No commentary.`

async function callClaude(systemPrompt: string, userContent: string): Promise<{ modelText: string; result: unknown }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: `DOCUMENT:\n${userContent}` }],
    }),
  })

  clearTimeout(timeout)

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(rawText || `HTTP ${response.status}`)
  }

  const data = JSON.parse(rawText) as { content?: { text?: string }[] }
  const modelText = data.content?.[0]?.text ?? ''
  const cleaned = modelText.replace(/```json\n?|\n?```/g, '').trim()
  const result = JSON.parse(cleaned) as unknown
  return { modelText, result }
}

export async function POST(request: Request) {
  try {
    const { text } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const sanitized = text
      .replace(/[^\x20-\x7E\x0A\x0D]/g, '')
      .trim()

    if (sanitized.length === 0) {
      return NextResponse.json(
        { code: 'INPUT_EMPTY', message: 'Award letter text is empty after sanitization' },
        { status: 400 }
      )
    }

    if (sanitized.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        { code: 'INPUT_TOO_LONG', message: `Award letter exceeds ${MAX_INPUT_CHARS} character limit` },
        { status: 400 }
      )
    }

    let modelText: string
    let result: unknown

    try {
      const out = await callClaude(BASE_SYSTEM_PROMPT, sanitized)
      modelText = out.modelText
      result = out.result
    } catch (fetchErr) {
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        return NextResponse.json(
          { code: 'EXTRACTION_TIMEOUT', message: 'Claude extraction timed out' },
          { status: 504 }
        )
      }
      throw fetchErr
    }

    let validation = ExtractedConstraintsSchema.safeParse(result)
    if (validation.success) {
      return NextResponse.json(validation.data)
    }

    console.error('Constraint extraction schema mismatch:', JSON.stringify(validation.error.flatten()))
    console.error('Raw Claude response was:', modelText)

    const strictSystemPrompt =
      'STRICT MODE: Your previous response failed schema validation.\nReturn ONLY raw JSON. No markdown. No commentary. No extra fields.\nThe response must be valid JSON matching the exact schema provided.\n\n' +
      BASE_SYSTEM_PROMPT

    try {
      const retryOut = await callClaude(strictSystemPrompt, sanitized)
      const retryResult = retryOut.result
      validation = ExtractedConstraintsSchema.safeParse(retryResult)
      if (validation.success) {
        return NextResponse.json(validation.data)
      }
      return NextResponse.json(
        {
          code: 'EXTRACTION_SCHEMA_FAILURE',
          message: 'Constraint extraction failed validation after retry',
          details: validation.error.flatten(),
        },
        { status: 422 }
      )
    } catch (retryErr) {
      if (retryErr instanceof Error && retryErr.name === 'AbortError') {
        return NextResponse.json(
          { code: 'EXTRACTION_TIMEOUT', message: 'Claude extraction timed out' },
          { status: 504 }
        )
      }
      throw retryErr
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
