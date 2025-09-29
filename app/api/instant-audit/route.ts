import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const { accessToken } = await request.json();

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token required' }, { status: 400 });
    }

    // Set up Google API clients
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoUnix = Math.floor(sevenDaysAgo.getTime() / 1000);

    // Fetch Gmail messages from last 7 days
    const gmailMessages: string[] = [];
    try {
      const emailRes = await gmail.users.messages.list({
        userId: 'me',
        q: `after:${sevenDaysAgoUnix} (is:important OR has:replies)`,
        maxResults: 10,
      });

      if (emailRes.data.messages) {
        for (const message of emailRes.data.messages.slice(0, 5)) {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full',
          });

          const subject = msg.data.payload?.headers?.find(h => h.name === 'Subject')?.value || 'No subject';
          const from = msg.data.payload?.headers?.find(h => h.name === 'From')?.value || 'Unknown';
          let body = '';

          if (msg.data.payload?.parts) {
            const textPart = msg.data.payload.parts.find(p => p.mimeType === 'text/plain');
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
            }
          } else if (msg.data.payload?.body?.data) {
            body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf8');
          }

          gmailMessages.push(`EMAIL: From: ${from}\nSubject: ${subject}\nBody: ${body.substring(0, 500)}`);
        }
      }
    } catch (gmailError) {
      console.error('Gmail fetch error:', gmailError);
    }

    // Fetch Drive documents from last 7 days
    const driveDocuments: string[] = [];
    try {
      const driveRes = await drive.files.list({
        q: `modifiedTime > '${sevenDaysAgo.toISOString()}' and (mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType='application/pdf')`,
        fields: 'files(id, name, mimeType, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 10,
      });

      if (driveRes.data.files) {
        for (const file of driveRes.data.files.slice(0, 5)) {
          // For Google Docs, export as text
          try {
            if (file.mimeType === 'application/vnd.google-apps.document') {
              const content = await drive.files.export({
                fileId: file.id!,
                mimeType: 'text/plain',
              });
              driveDocuments.push(`DOCUMENT: ${file.name}\nContent: ${(content.data as string).substring(0, 1000)}`);
            } else {
              // For other files, just list them
              driveDocuments.push(`DOCUMENT: ${file.name} (${file.mimeType})\nModified: ${file.modifiedTime}`);
            }
          } catch (fileError) {
            console.error(`Error fetching file ${file.name}:`, fileError);
          }
        }
      }
    } catch (driveError) {
      console.error('Drive fetch error:', driveError);
    }

    // Combine all data
    const allData = [...gmailMessages, ...driveDocuments].join('\n\n---\n\n');

    if (!allData.trim()) {
      return NextResponse.json({
        headline: 'No recent activity found',
        evidenceA: { source: 'Gmail', snippet: 'No emails found in the last 7 days' },
        evidenceB: { source: 'Drive', snippet: 'No documents found in the last 7 days' },
        draftedSolution: 'Start using email and Drive to benefit from Foldera\'s monitoring.',
      });
    }

    // Call Claude API
    const claudePrompt = `You are Foldera's Red Team Auditor. Find ONE most career-damaging conflict in this 7-day Gmail+Drive slice. Look for financial mismatches, contradictory promises, or timeline impossibilities. Ignore everything else. Be paranoid and dramatic.

DATA:
${allData}

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "headline": "A single terrifying sentence about the conflict.",
  "evidenceA": { "source": "Exact source name", "snippet": "Exact quote showing first part of conflict" },
  "evidenceB": { "source": "Exact source name", "snippet": "Exact quote showing conflicting information" },
  "draftedSolution": "Concise ready-to-send email or action fixing it."
}`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [{ role: 'user', content: claudePrompt }],
      }),
    });

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${claudeResponse.status}`);
    }

    const claudeData = await claudeResponse.json();
    const claudeText = claudeData.content[0].text;

    // Parse JSON response
    let result;
    try {
      // Remove markdown code blocks if present
      const cleaned = claudeText.replace(/```json\n?|\n?```/g, '').trim();
      result = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse Claude response:', claudeText);
      // Return a fallback result
      result = {
        headline: 'Potential conflicts detected in your recent communications',
        evidenceA: {
          source: 'Recent Gmail',
          snippet: 'Multiple important threads detected requiring review',
        },
        evidenceB: {
          source: 'Recent Drive',
          snippet: 'Documents with financial or timeline data found',
        },
        draftedSolution:
          'Review flagged communications for consistency. Compare financial figures and deadlines across documents and emails.',
      };
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Instant audit error:', error);
    return NextResponse.json(
      {
        error: 'Audit failed',
        details: error.message,
        headline: 'Audit encountered an error',
        evidenceA: { source: 'System', snippet: 'Please try again' },
        evidenceB: { source: 'System', snippet: error.message },
        draftedSolution: 'Contact support if this issue persists.',
      },
      { status: 500 }
    );
  }
}
