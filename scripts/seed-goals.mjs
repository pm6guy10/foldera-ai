#!/usr/bin/env node

console.error(
  [
    'scripts/seed-goals.mjs has been retired.',
    'Goal creation should happen through the supported onboarding and app flows so encrypted signals are handled consistently.',
  ].join('\n'),
);

process.exit(1);
