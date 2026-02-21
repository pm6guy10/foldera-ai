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
        system: `You are a grant compliance analyst. Read the following grant award letter or amendment and extract structured constraints. Return strictly valid JSON in this exact format. No markdown. No explanation. No backticks.

{
  "total_award": null,
  "category_caps": {},
  "kpi_targets": {},
  "reporting_deadlines": [],
  "restricted_categories": [],
  "amendments": []
}

If a field is not present, return null or empty arrays. Do not invent values.`,
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
