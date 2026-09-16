#!/usr/bin/env node
// Operator CLI. Usage: npm run pool -- <command> [args]

import { loadDotEnv } from '../apps/context.js';
import { loadConfig } from '../packages/config/index.js';
import { openDatabase } from '../packages/db/index.js';
import { syncSponsors } from '../packages/billing/index.js';
import { addLedgerEntry } from '../packages/accounting/index.js';
import { periodOf, previousPeriod, isPeriod } from '../packages/allocation/index.js';
import { getPoolAllocation } from '../packages/allocation/pool.js';
import { buildReport, closePeriod } from '../packages/transparency/index.js';
import { revokeKey } from '../packages/auth/index.js';

const HELP = `Commands:
  migrate                                  apply database migrations
  sync-sponsors                            reconcile memberships with GitHub Sponsors
  allocation                               show this month's allocation and its inputs
  report [YYYY-MM]                         print a (live) transparency report
  close-period [YYYY-MM] [--force]         freeze a finished month into transparency/ (default: previous month)
  ledger add <YYYY-MM> <kind> <usd> [note] record infrastructure costs or adjustments
                                           kinds: infrastructure, income_adjustment, provider_adjustment, reserve_adjustment
  revoke-key <github-login>                immediately revoke a member's API key`;

loadDotEnv();
const [command, ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const print = (value) => console.log(JSON.stringify(value, null, 2));

try {
  const config = loadConfig();
  const db = openDatabase();
  const now = new Date();

  switch (command) {
    case 'migrate':
      console.log('Database is up to date.');
      break;
    case 'sync-sponsors':
      print(await syncSponsors(db, config, { token: process.env.GITHUB_SPONSORS_TOKEN }, now));
      break;
    case 'allocation':
      print(getPoolAllocation(db, config, now));
      break;
    case 'report': {
      const period = positional[0] ?? periodOf(now);
      if (!isPeriod(period)) throw new Error('Expected YYYY-MM');
      print(buildReport(db, config, period, now));
      break;
    }
    case 'close-period': {
      const report = closePeriod(db, config, positional[0] ?? previousPeriod(periodOf(now)), { now, force: flags.has('--force') });
      console.log(`Closed ${report.period}: transparency/${report.period}.json`);
      console.log('Commit that file so the ledger is part of the repository history.');
      break;
    }
    case 'ledger': {
      const [sub, period, kind, amount, ...note] = positional;
      if (sub !== 'add' || !isPeriod(period ?? '')) throw new Error('Usage: ledger add <YYYY-MM> <kind> <usd> [note]');
      addLedgerEntry(db, { period, kind, amountUsd: Number(amount), note: note.join(' ') || null }, now);
      console.log('Ledger entry recorded.');
      break;
    }
    case 'revoke-key': {
      const user = db.prepare('SELECT id FROM users WHERE lower(login) = lower(?)').get(positional[0] ?? '');
      if (!user) throw new Error(`Unknown user ${positional[0]}`);
      console.log(revokeKey(db, user.id, now) ? 'Key revoked.' : 'No active key.');
      break;
    }
    default:
      console.log(HELP);
      process.exitCode = command ? 1 : 0;
  }
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
}
