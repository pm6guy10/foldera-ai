import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type CronRule = {
  path: string;
  schedule: string;
};

function getCronRules() {
  const configPath = path.join(process.cwd(), 'vercel.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as { crons?: CronRule[] };
  return parsed.crons ?? [];
}

describe('vercel.json morning cron config', () => {
  it('schedules a single orchestrated morning pipeline entry', () => {
    expect(getCronRules()).toEqual([
      {
        path: '/api/cron/morning-pipeline',
        schedule: '0 11 * * *',
      },
    ]);
  });
});
