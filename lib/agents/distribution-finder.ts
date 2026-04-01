import type { SupabaseClient } from '@supabase/supabase-js';
import { insertAgentDraft } from '@/lib/agents/draft-queue';
import { runAgentSonnet } from '@/lib/agents/anthropic-runner';
import { buildSkipAvoidanceBlock } from '@/lib/agents/skip-patterns';

async function duckSeedHints(): Promise<string> {
  const q = encodeURIComponent('productivity newsletter podcast ADHD executive function email management');
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1`, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'FolderaDist/1.0' },
    });
    if (!res.ok) return '';
    const j = (await res.json()) as {
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      AbstractURL?: string;
      AbstractText?: string;
    };
    const parts: string[] = [];
    if (j.AbstractText) parts.push(j.AbstractText);
    (j.RelatedTopics ?? []).slice(0, 12).forEach((t) => {
      if (t.Text) parts.push(`${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ''}`);
    });
    return parts.join('\n');
  } catch {
    return '';
  }
}

export async function runDistributionFinderAgent(supabase: SupabaseClient): Promise<{
  staged: number;
  summary: string;
}> {
  const avoid = await buildSkipAvoidanceBlock(supabase, 'distribution_finder');
  const seed = await duckSeedHints();

  const sonnet = await runAgentSonnet({
    job: 'distribution_finder',
    system: [
      'You are a GTM researcher. Given rough web hints, propose 5 distribution targets (newsletters, podcasts, YouTube, or writers) relevant to productivity, ADHD tools, AI assistants, executive function, or email management.',
      'For each target output JSON object: { "name": "", "channel_type": "", "contact_hint": "", "pitch": "" }',
      'contact_hint should be a plausible homepage URL, /contact page, or submission phrase — never fabricate private emails.',
      'pitch must be exactly one sentence starting with: I built an AI that reads your email overnight and hands you one finished action every morning.',
      'Return JSON array of exactly 5 items.',
      avoid,
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: `Search hints (may be incomplete):\n${seed || '(no hints — use your knowledge of well-known channels in this space)'}`,
      },
    ],
  });

  if ('error' in sonnet) {
    return { staged: 0, summary: sonnet.error };
  }

  let items: Array<Record<string, string>> = [];
  try {
    const raw = sonnet.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    items = JSON.parse(raw) as typeof items;
  } catch {
    return { staged: 0, summary: 'json parse failed' };
  }

  let staged = 0;
  for (let i = 0; i < Math.min(5, items.length); i++) {
    const it = items[i];
    const name = String(it.name ?? `Target ${i + 1}`);
    const pitch = String(it.pitch ?? '');
    const contact = String(it.contact_hint ?? '');
    const ch = String(it.channel_type ?? 'channel');

    const body = [
      `**Channel type:** ${ch}`,
      `**Contact / discovery:** ${contact}`,
      '',
      '**One-line pitch:**',
      pitch,
    ].join('\n');

    const ins = await insertAgentDraft(supabase, 'distribution_finder', {
      title: `Distribution: ${name}`,
      directiveLine: `Cold pitch draft — ${name}`,
      body,
      fixPrompt: `Research and verify contact info for "${name}". If the pitch is accurate, personalize one sentence and reach out via their public submission path.\n\nPitch:\n${pitch}`,
    });
    if (!('error' in ins)) staged++;
  }

  return { staged, summary: `staged ${staged}` };
}
