// Vocabulary test (Task 29): renders each customer screen with fixture rows and scans its text for words
// that belong to the machine room. Run with `npm run test:vocab` (an SSR build of this file, then node).
// Fixture rows mirror what the module writes: match_result evidence from kernel.ts plus the enrichment in
// index.ts, the stored investigation for 2231 (seed/fixtures/investigations/2231.json), one audit row per action.
import { renderToStaticMarkup } from 'react-dom/server';
import { Identity, Timestamp } from 'spacetimedb';
import type { AgentTask, AuditEvent, Hold, IngestLog, MatchResult, Payment, Rule } from '../../../module_bindings/types';
import { ActivityScreen, CustomerPage, Footer, Header, LearnedScreen, TodayScreen, type LedgerRows } from './Screens';
import { activityLines, activitySentence, forbiddenIn, holdSentence, lookupsFrom, namesFrom, evidenceOf } from './model';

const ts = (n: number) => new Timestamp(BigInt(1_792_900_000_000_000 + n * 1_000_000));
const ME = new Identity('c200156ae89e7de689727fce31542a6474a86db1c60d8a9623f6be2c186d2a1d');
const MOD = new Identity('c200393992e6c48b76d8ed1553914f203b5a9917e3c9cb78119011697c968cb5');

function hold(txnRef: string, code: string, cents: bigint, day: number, status: string, question?: string, kind = 'card'): Hold {
  return { txnRef, kind, code, cents, day, requestedBy: MOD, reason: `kernel: ${code}`, question, answer: undefined, callbackNote: undefined, status, ruleId: undefined, actor: MOD, updatedAt: ts(day) };
}
function match(txnRef: string, code: string, cents: bigint, day: number, ev: Record<string, unknown>, kind = 'card'): MatchResult {
  return { txnRef, kind, code, cents, day, evidenceJson: JSON.stringify(ev), ruleId: undefined, decidedAt: ts(day) };
}

const ev2231 = {
  txnRef: '2231', cardId: 'FC-1017', truckId: 17, driverId: 23, stationName: "Love's 412, Schulenburg TX", stationLat: 29.6816, stationLon: -96.9036,
  gallons: 120, cents: '41200', merchant: 'LOVES #412', day: 41,
  nearestPing: { lat: 29.42388, lon: -98.4935, atMicros: '1787835600000000', deltaMin: 12, engineOn: false, odometer: 193546.3 },
  distanceMiles: 97.3, thresholdMiles: 25, driverName: 'Ramon Ortiz', plate: 'TX-17', atMicros: '1787834826000000', date: '2026-08-26',
};
const finding2231 = {
  finding: 'Evidence supports use of FC-1017 for a different truck.',
  evidence: [
    { source: 'swap_log.txt', ref: 'line 8', quote: '2026-08-26  Ortiz, Ramon (drv 23)  17  22  unit 17 in shop' },
    { source: 'receipts/2231.txt', ref: 'lines 8-9', quote: 'FLEET CARD   ****1017   UNIT 17   DRIVER 23\nAUTH 07CEF1   REF 2231' },
  ],
  recommendation: 'hold_and_ask',
  question_for_controller: 'Can Ramon Ortiz confirm he fueled truck 22?',
  confidence: 0.97,
  status: 'replayed',
  model: 'droid',
};
const Q2231 = 'Can Ramon Ortiz or the San Antonio dispatcher confirm that Ortiz used FC-1017 to fuel truck 22 for transaction 2231 while truck 17 was in the shop under PO-1026?';

const holds: Hold[] = [
  hold('2231', 'location_mismatch', 41200n, 41, 'awaiting_controller', Q2231),
  hold('2240', 'capacity_exceeded', 51000n, 41, 'awaiting_controller', 'Was this fill split across two trucks?'),
  hold('INV-1077', 'vendor_bank_change', 712500n, 39, 'awaiting_controller', 'Call the vendor on a known number and record who confirmed the new account.', 'invoice'),
  hold('INV-1040', 'rate_variance', 98000n, 30, 'awaiting_controller', 'Is the higher unit price agreed anywhere outside the contract?', 'invoice'),
  hold('INV-1051', 'duplicate_invoice', 45000n, 33, 'awaiting_controller', 'Which PO is the real one?', 'invoice'),
  hold('INV-1060', 'short_received', 120000n, 35, 'awaiting_controller', 'Pay the received quantity only, or wait for the rest?', 'invoice'),
  hold('3001', 'limit', 300000n, 40, 'awaiting_controller', 'Approve this payment above the auto-pay limit?'),
  hold('3002', 'mystery_code', 1000n, 40, 'awaiting_controller', 'What is this?'),
  hold('2100', 'location_mismatch', 30000n, 20, 'answered'),
  hold('2050', 'location_mismatch', 25000n, 18, 'rejected'),
  hold('2010', 'location_mismatch', 25000n, 12, 'cleared_by_rule'),
];
const matches: MatchResult[] = [
  match('2231', 'location_mismatch', 41200n, 41, ev2231),
  match('2240', 'capacity_exceeded', 51000n, 41, { ...ev2231, txnRef: '2240', gallons: 190, tankGal: 150, capacityLimitGal: 157.5, nearestPing: undefined, distanceMiles: undefined }),
  match('INV-1077', 'vendor_bank_change', 712500n, 39, { txnRef: 'INV-1077', vendorId: 3, vendorName: 'Gulf Coast Diesel', poId: 'PO-1031', item: 'diesel bulk', qty: 2000, unitCents: '356', cents: '712500', receivedDay: 39, bankChangedDay: 36, daysSinceChange: 3, thresholdDays: 7 }, 'invoice'),
  match('INV-1040', 'rate_variance', 98000n, 30, { txnRef: 'INV-1040', vendorId: 2, vendorName: 'Lone Star Tire', poId: 'PO-1010', item: 'steer tire', qty: 2, unitCents: '49000', cents: '98000', referenceKind: 'contract', contractRateCents: '42000', variancePct: 16.7 }, 'invoice'),
  match('INV-1051', 'duplicate_invoice', 45000n, 33, { txnRef: 'INV-1051', vendorId: 1, vendorName: 'Alamo Fleet Service', duplicateOf: 'INV-1049', daysApart: 2, cents: '45000' }, 'invoice'),
  match('INV-1060', 'short_received', 120000n, 35, { txnRef: 'INV-1060', vendorId: 4, vendorName: 'Metroplex Truck Center', poId: 'PO-1020', item: 'brake kit', qty: 4, poQty: 4, receivedQty: 3, proposedPartialCents: '90000' }, 'invoice'),
  match('3001', 'limit', 300000n, 40, { ...ev2231, txnRef: '3001', limitReason: 'per_transaction' }),
  match('2100', 'location_mismatch', 30000n, 20, { ...ev2231, txnRef: '2100', nearestPing: null, reason: 'no ping within 30 minutes', distanceMiles: undefined }),
  match('T-9', 'duplicate_toll', 650n, 41, { txnRef: 'T-9', plate: 'TX-17', truckId: 17, plazaName: 'Plaza 4', duplicateOf: 'T-8', minutesApart: 2 }, 'toll'),
];
const task2231: AgentTask = {
  id: 7n, txnRef: '2231', kind: 'investigate', status: 'investigated', version: 2, claimedBy: undefined, claimedAt: undefined,
  briefJson: JSON.stringify({ evidence: ev2231 }), stepsJson: '[]', findingJson: JSON.stringify(finding2231), source: 'replayed', createdDay: 41, createdAt: ts(41), updatedAt: ts(41),
};
function rule(id: bigint, status: string, extra: Partial<Rule> = {}): Rule {
  return {
    id, sourceTxnRef: '2231', scopeJson: JSON.stringify({ driverId: 23 }), condition: 'location_mismatch', action: 'clear',
    backtestJson: JSON.stringify({ n: 3, wouldClear: 3, confirmedExceptionsCovered: 0 }), status, uses: 'standing', validFromDay: 41, validToDay: 45,
    createdBy: MOD, approvedBy: status === 'approved' ? ME : undefined, reason: '', createdAt: ts(41), ...extra,
  };
}
const rules: Rule[] = [
  rule(1n, 'approved'),
  rule(2n, 'candidate', { sourceTxnRef: 'INV-1040', condition: 'rate_variance', scopeJson: JSON.stringify({ vendorId: 2 }) }),
  rule(3n, 'expired', { uses: 'one_time', reason: 'one_time rule consumed by 2010' }),
  rule(4n, 'expired', { reason: 'expired on day 30' }),
  rule(5n, 'rejected', { scopeJson: JSON.stringify({ truckIds: [17, 22] }) }),
  rule(6n, 'approved', { condition: 'duplicate_invoice', scopeJson: JSON.stringify({ cardId: 'FC-1017' }), approvedBy: undefined }),
];
const payments: Payment[] = [
  { txnRef: '1000', cents: 10000n, day: 41, releasedBy: MOD, releasedRole: 'kernel', at: ts(41), bankTxnId: 'offline-1000' },
  { txnRef: '2010', cents: 25000n, day: 41, releasedBy: MOD, releasedRole: 'rule', at: ts(41), bankTxnId: 'NESSIE-abc123' },
  { txnRef: 'INV-1001', cents: 50000n, day: 41, releasedBy: ME, releasedRole: 'controller', at: ts(41), bankTxnId: undefined },
];
const ingests: IngestLog[] = [{ id: 1n, at: ts(41), fileName: 'wex_2026-08-26.csv', kind: 'card', rows: 61, skipped: 0, matched: 61, actor: ME }];

const ACTIONS: Array<[string, string, string, string]> = [
  ['init', 'module', 'publisher granted seed', 'seed'],
  ['grant_role', 'c200', 'agent', 'seed'],
  ['seed', 'truck', '40 rows', 'seed'],
  ['vendor_bank_change', '3', 'day 36', 'seed'],
  ['reset_sim', 'day', '0', 'seed'],
  ['set_clock', '41', 'paused', 'controller'],
  ['set_clock', '41', 'running', 'controller'],
  ['set_tick', '41', '500000 us', 'controller'],
  ['ingest', 'wex_2026-08-26.csv', 'card: 61 rows, 0 skipped (already on file), 61 matched now, 0 waiting for their day; file connector', 'controller'],
  ['auto_pay', '1000', '10000 cents', 'seed'],
  ['hold', '2231', 'location_mismatch', 'seed'],
  ['hold_recoded', '2240', 'location_mismatch -> capacity_exceeded', 'seed'],
  ['auto_reject', 'T-9', 'duplicate_toll of T-8', 'seed'],
  ['claim_task', '7', '2231', 'agent'],
  ['record_investigation', '7', '2231 hold_and_ask (replayed)', 'agent'],
  ['answer_question', '2231', 'Yes. Ortiz drove unit 22 that week.', 'controller'],
  ['create_rule', '1', 'location_mismatch {"driverId":23} days 41-45; backtest n=3 confirmed=0', 'agent'],
  ['approve_rule', '1', 'location_mismatch {"driverId":23}', 'controller'],
  ['reject_rule', '5', 'too broad', 'controller'],
  ['cleared_by_rule', '2010', 'rule 3', 'seed'],
  ['approve_payment', 'INV-1001', '', 'controller'],
  ['reject_payment', '2050', 'not ours', 'controller'],
  ['settle', '1000', 'bank id offline-1000', 'agent'],
  ['settle', '2010', 'bank id NESSIE-abc123', 'agent'],
  ['refused', '2231', 'agent may not do this (needs controller)', 'agent'],
  ['refused', '5', 'reader may not do this (needs controller)', 'reader'],
  ['refused', 'INV-1077', 'call-back note required for a bank change', 'controller'],
  ['refused', '9999', 'requester cannot approve', 'controller'],
  ['refused', '2231', 'hold already released', 'controller'],
  ['seat_refused', 'controller seat', 'not authorised for this seat: agent1qxyz', 'controller'],
  ['rematch', '2231', '', 'controller'],
  ['inject', '9999', 'truck 17 300 gal', 'controller'],
  ['some_future_action', 'x', 'kernel reducer actor seed finding MCP stand-in FACTS', 'agent'],
];
const events: AuditEvent[] = ACTIONS.map(([action, ref, detail, role], i) => ({
  id: BigInt(i + 1), at: ts(i), day: 41, actor: role === 'seed' ? MOD : ME, actorRole: role, action, ref, detail,
}));

const full: LedgerRows = { today: 41, date: '2026-08-26', holds, tasks: [task2231], rules, events, matches, payments, ingests };
const quiet: LedgerRows = { ...full, holds: holds.filter(h => h.status !== 'awaiting_controller'), rules: [], events: [] };

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}

const now = new Date(2026, 7, 26, 9, 0);
const screens: Array<[string, string]> = [
  ['Header', renderToStaticMarkup(<Header now={now} date="2026-08-26" connected={true} />)],
  ['Today (every code)', renderToStaticMarkup(<TodayScreen rows={full} />)],
  ['Today (quiet)', renderToStaticMarkup(<TodayScreen rows={quiet} />)],
  ['What Caliber has learned', renderToStaticMarkup(<LearnedScreen rows={full} />)],
  ['What Caliber has learned (empty)', renderToStaticMarkup(<LearnedScreen rows={quiet} />)],
  ['Activity (every action)', renderToStaticMarkup(<ActivityScreen rows={{ ...full, events: [...events, ...events.map(e => ({ ...e, id: e.id + 1000n }))] }} />)],
  ['Footer', renderToStaticMarkup(<Footer />)],
  ['Whole page', renderToStaticMarkup(<CustomerPage rows={full} now={now} connected={false} />)],
];
for (const [name, html] of screens) {
  const hits = forbiddenIn(text(html));
  check(`vocabulary: ${name}`, hits.length === 0, hits.length ? `found ${hits.join(', ')}` : '');
}

// The scanner itself catches each word (whole word, any case), and does not trip on longer words.
for (const w of ['Kernel', 'reducers', 'ACTOR', 'seed', 'Finding', 'mcp', 'stand-in', 'facts']) {
  const hit = forbiddenIn(`a ${w} b`).length > 0;
  check(`scanner on "${w}"`, w === 'reducers' ? !hit : hit);
}
check('scanner ignores "seeded" and "findings"', forbiddenIn('seeded findings factsheet').length === 0);

// Content checks: the 2231 sentence is built from fields, the question is verbatim, the copy command is exact.
const names = namesFrom(matches);
const s2231 = holdSentence(holds[0], evidenceOf(matches[0]), names);
check(
  '2231 sentence',
  s2231 === "Fuel card FC-1017 (Truck 17) paid $412.00 for 120 gallons at Love's 412, Schulenburg TX on Aug 26. Truck 17's GPS at that time put it 97.3 miles away with the engine off.",
  s2231,
);
const today = text(screens[1][1]);
check('question verbatim', today.includes(Q2231));
check('copy command', screens[1][1].includes('answer 2231'));
check('replay line', today.includes('replay of a recorded investigation'));
check('receipt from stored quote', today.includes('FLEET CARD ****1017 UNIT 17 DRIVER 23'));
check('map labels', today.includes('the pump') && today.includes('97.3 miles'));
check('needs-you tile is brass while something waits', screens[1][1].includes('cv-tile-brass'));
check('quiet state has no brass class', !screens[2][1].includes('cv-tile-brass'));
check('footer text', text(screens[6][1]) === "This screen can't pay anything. Approvals happen from your phone.");
const lk = lookupsFrom(holds, payments, rules, ingests);
const unknown = activitySentence(events[events.length - 1], lk);
check('unknown action is neutral', unknown === 'Something was recorded in the ledger.', unknown);
check('refused, investigator', activitySentence(events.find(e => e.action === 'refused')!, lk) === 'The investigator tried to approve a payment. Only you can.');
check('ingest', activitySentence(events.find(e => e.action === 'ingest')!, lk) === 'A fuel-card file arrived: 61 charges.');
// Feed: claims dropped, one investigation phrased by its outcome, a run of three or more collapsed into one line.
const lines = activityLines(events, lk);
check('feed drops claim rows', !lines.some(l => /started looking into/.test(l.text)));
check('feed: single investigation outcome', lines.some(l => l.text === 'Caliber looked into charge 2231 and is holding it for you with a question.'), lines.map(l => l.text).find(t => t.includes('looked into')) ?? '');
const run: AuditEvent[] = [
  ['INV-1040', 'hold_and_ask'], ['INV-1051', 'clear'], ['INV-1060', 'hold_and_ask'], ['INV-1077', 'hold'],
].map(([ref, rec], i) => ({ id: BigInt(500 + i), at: ts(500 + i), day: 41, actor: MOD, actorRole: 'agent', action: 'record_investigation', ref: String(10 + i), detail: `${ref} ${rec} (replayed)` }));
const claims: AuditEvent[] = run.map(r => ({ ...r, id: r.id + 100n, action: 'claim_task', detail: r.detail.split(' ')[0] }));
const collapsed = activityLines([...run, ...claims, events[9]], lk);
check('feed: run of 4 collapses to one line', collapsed.length === 2 && collapsed[0].text === 'Caliber looked into 4 invoices; 2 asked you a question.' && collapsed[0].id === 603n - 100n, collapsed.map(l => `${l.id}:${l.text}`).join(' | '));
check('feed: automatic payments and their settlement are one line', lines.some(l => l.text === 'Paid 1 charge automatically ($100.00); recorded offline, no bank called.') && !lines.some(l => /charge 1000 recorded offline/.test(l.text)), lines.map(l => l.text).filter(t => /Paid|offline|bank/.test(t)).join(' | '));
check('feed: a rule payment settlement stays its own line', lines.some(l => l.text === 'The bank sent payment for charge 2010, transfer NESSIE-abc123.'));
const many: AuditEvent[] = [];
const manyPay: Payment[] = [];
for (let k = 0; k < 5; k++) {
  const ref = `C${k}`;
  manyPay.push({ txnRef: ref, cents: 1000n, day: 41, releasedBy: MOD, releasedRole: 'kernel', at: ts(41), bankTxnId: k < 3 ? `NES-${k}` : `offline-${ref}` });
  many.push({ id: BigInt(800 + k), at: ts(800 + k), day: 41, actor: MOD, actorRole: 'seed', action: 'auto_pay', ref, detail: '1000 cents' });
  many.push({ id: BigInt(900 + k), at: ts(900 + k), day: 41, actor: ME, actorRole: 'agent', action: 'settle', ref, detail: `bank id ${manyPay[k].bankTxnId}` });
}
const mixed = activityLines(many, lookupsFrom([], manyPay, [], []));
check('feed: mixed settlement counts', mixed.length === 1 && mixed[0].text === 'Paid 5 charges automatically ($50.00); 3 paid through the bank, 2 recorded offline, no bank called.' && mixed[0].id === 904n, mixed.map(l => `${l.id}:${l.text}`).join(' | '));
const two = activityLines(run.slice(0, 2), lk);
check('feed: run of 2 stays as lines', two.length === 2 && two[0].text === 'Caliber looked into invoice INV-1051 and found nothing wrong.', two.map(l => l.text).join(' | '));

const learned = text(screens[3][1]);
check('learned: approved rule', learned.includes('When Ramon Ortiz fuels a truck other than the one on the card, pay the charge. Good from Aug 26 to Sep 1.'), learned.slice(0, 300));
check('learned: approved on', learned.includes('You approved this on Aug 26.'));
check('learned: candidate', learned.includes('Proposed from your answer') && learned.includes('approve rule 2'));
check('learned: used once', learned.includes('Used once on Aug 26.'));
check('learned: expired', learned.includes('Expired Aug 11.'));
check('learned: answered, drafting', learned.includes('You answered the question about charge 2100'));
check('learned: backtest', learned.includes('It would have cleared 3 earlier charges.'));

for (const [name, html] of screens.slice(1, 2)) console.log(`\n--- ${name} text ---\n${text(html)}\n`);
if (failures) {
  throw new Error(`${failures} check(s) failed`);
}
console.log('\nall vocabulary and wording checks passed');
