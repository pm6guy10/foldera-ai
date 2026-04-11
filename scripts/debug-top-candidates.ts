import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
process.env.ALLOW_PAID_LLM = 'false';

async function main() {
  const { scoreOpenLoops } = await import('../lib/briefing/scorer');
  const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  const result = await scoreOpenLoops(OWNER) as any;

  console.log('\n=== RESULT KEYS ===', Object.keys(result));

  console.log('\n=== WINNER ===');
  const w = result.winner;
  if (w) {
    console.log('type:', w.type);
    console.log('entityName:', w.entityName);
    console.log('title:', (w.title ?? '').slice(0, 120));
    console.log('action:', w.suggestedActionType ?? w.actionType ?? w.recommended_action);
    console.log('score:', w.score);
  } else {
    console.log('NO WINNER');
  }

  console.log('\n=== TOP CANDIDATES ===');
  const tops = result.topCandidates ?? [];
  console.log('topCandidates count:', tops.length);
  for (const c of tops) {
    console.log(' ', {
      type: c.type,
      entityName: c.entityName,
      action: c.suggestedActionType ?? c.actionType,
      score: typeof c.score === 'number' ? c.score.toFixed(2) : c.score,
      title: (c.title ?? '').slice(0, 80),
    });
  }

  console.log('\n=== DIVERGENCES ===');
  const divs = result.divergences ?? [];
  console.log('divergences count:', divs.length);
  for (const d of divs.slice(0, 5)) {
    console.log(' ', (d.title ?? '').slice(0, 100), '| score:', d.score?.toFixed(2));
  }
}

main().catch(console.error);
