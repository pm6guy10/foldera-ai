import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { text } = await request.json()
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1200,
        temperature: 0,
        system: `You are a deterministic grant compliance extraction engine.

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
   No commentary.`,
        messages: [{ role: 'user', content: `DOCUMENT:\n${text}` }],
      }),
    })

    const rawText = await response.text()
    
    if (!response.ok) {
      return NextResponse.json({ error: rawText }, { status: 502 })
    }

    const data = JSON.parse(rawText)
    const modelText = data.content?.[0]?.text ?? ''
    const cleaned = modelText.replace(/```json\n?|\n?```/g, '').trim()
    const result = JSON.parse(cleaned)
    return NextResponse.json(result)

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
