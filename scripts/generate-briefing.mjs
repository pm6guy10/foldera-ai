#!/usr/bin/env node

console.error(
  [
    'scripts/generate-briefing.mjs has been retired.',
    'Use the supported app flow instead:',
    '- POST /api/conviction/generate for directive generation',
    '- GET /api/conviction/latest for the latest pending directive',
    '- GET /api/briefing/latest for legacy briefing reads',
  ].join('\n'),
);

process.exit(1);
