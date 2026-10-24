// In-process integration tests for the Dispatch Ledger module. Each `describe` is one guardrail
// from docs/CONTRACT.md, run against the real reducers through the SDK's module test harness.
//
// How a reducer is called here: `h.withReducerTx(auth, ctx => mod.approvePayment(ctx, { txnRef, callbackNote }))`.
// The body runs inside one transaction; a thrown SenderError aborts it (nothing is written) and the
// error propagates to the test. Procedures take `h.procedureContext(auth)` instead and commit their
// own transactions, so a refusal there leaves an audit row and returns `{ ok: false, message }`.
import { beforeEach, describe, expect, it } from 'vitest';
import { makeWorld, cardRow, jwt, type World } from './test_helpers';

const DB_REQUESTED = 'requested by the database identity';

describe('1. roles: who may call what', () => {
  let w: World;
  beforeEach(() => {
    w = makeWorld();
    w.stepTo(41); // so there is a hold (2231) and an open task to act on
  });

  it('approve_payment: controller only, and the clock-raised hold is approvable by a controller', () => {
    const { run, mod, anon, agent, controller, publisher } = w;
    const args = { txnRef: '2231', callbackNote: undefined };
    expect(() => run(anon, ctx => mod.approvePayment(ctx, args))).toThrow('anonymous may not do this (needs controller)');
    expect(() => run(agent, ctx => mod.approvePayment(ctx, args))).toThrow('agent may not do this (needs controller)');
    expect(() => run(publisher, ctx => mod.approvePayment(ctx, args))).toThrow('seed may not do this (needs controller)');
    run(controller, ctx => mod.approvePayment(ctx, args));
    expect(w.rows.hold('2231')?.status).toBe('released');
    expect(w.rows.payment('2231')?.releasedRole).toBe('controller');
  });

  it('answer_question: controller only', () => {
    const { run, mod, anon, agent, controller, publisher } = w;
    const args = { txnRef: '2231', text: 'Ortiz drove truck 22 that day.' };
    expect(() => run(anon, ctx => mod.answerQuestion(ctx, args))).toThrow('anonymous may not do this (needs controller)');
    expect(() => run(agent, ctx => mod.answerQuestion(ctx, args))).toThrow('agent may not do this (needs controller)');
    expect(() => run(publisher, ctx => mod.answerQuestion(ctx, args))).toThrow('seed may not do this (needs controller)');
    run(controller, ctx => mod.answerQuestion(ctx, args));
    expect(w.rows.hold('2231')?.status).toBe('answered');
  });

  it('set_clock: seed or controller', () => {
    const { run, mod, anon, agent, controller, publisher } = w;
    expect(() => run(anon, ctx => mod.setClock(ctx, { paused: false }))).toThrow('anonymous may not do this (needs seed or controller)');
    expect(() => run(agent, ctx => mod.setClock(ctx, { paused: false }))).toThrow('agent may not do this (needs seed or controller)');
    run(controller, ctx => mod.setClock(ctx, { paused: false }));
    expect(w.h.db.businessDay.id.find(1)?.paused).toBe(false);
    run(publisher, ctx => mod.setClock(ctx, { paused: true }));
    expect(w.h.db.businessDay.id.find(1)?.paused).toBe(true);
  });

  it('claim_task: agent only', () => {
    const { run, mod, anon, agent, controller, publisher } = w;
    const task = w.rows.tasks('2231')[0];
    const args = { id: task.id, version: task.version };
    expect(() => run(anon, ctx => mod.claimTask(ctx, args))).toThrow('anonymous may not do this (needs agent)');
    expect(() => run(controller, ctx => mod.claimTask(ctx, args))).toThrow('controller may not do this (needs agent)');
    expect(() => run(publisher, ctx => mod.claimTask(ctx, args))).toThrow('seed may not do this (needs agent)');
    run(agent, ctx => mod.claimTask(ctx, args));
    const after = w.h.db.agentTask.id.find(task.id)!;
    expect(after.status).toBe('claimed');
    expect(after.claimedBy?.isEqual(w.identityOf(agent))).toBe(true);
  });

  it('create_rule: agent only', () => {
    const { run, mod, anon, agent, controller, publisher } = w;
    const args = { sourceTxnRef: '2231', scopeJson: '{"driverId":23}', condition: 'location_mismatch', backtestJson: '{}',
      uses: 'one_time', validFromDay: 41, validToDay: 46, reason: 'driver swapped trucks' };
    expect(() => run(anon, ctx => mod.createRule(ctx, args))).toThrow('anonymous may not do this (needs agent)');
    expect(() => run(controller, ctx => mod.createRule(ctx, args))).toThrow('controller may not do this (needs agent)');
    expect(() => run(publisher, ctx => mod.createRule(ctx, args))).toThrow('seed may not do this (needs agent)');
    run(agent, ctx => mod.createRule(ctx, args));
    expect(w.rows.rules()).toHaveLength(1);
    expect(w.rows.rules()[0].status).toBe('candidate');
  });

  it('seed_trucks: seed only (the publisher ran init and holds seed)', () => {
    const { run, mod, anon, agent, controller, publisher } = w;
    const args = { rows: [{ id: 31, plate: 'TX-1031', tankGal: 120, fuelCardId: 'FC-1031', terminalId: 1 }] };
    expect(() => run(anon, ctx => mod.seedTrucks(ctx, args))).toThrow('anonymous may not do this (needs seed)');
    expect(() => run(agent, ctx => mod.seedTrucks(ctx, args))).toThrow('agent may not do this (needs seed)');
    expect(() => run(controller, ctx => mod.seedTrucks(ctx, args))).toThrow('controller may not do this (needs seed)');
    run(publisher, ctx => mod.seedTrucks(ctx, args));
    expect(w.h.db.truck.id.find(31)?.plate).toBe('TX-1031');
  });

  it('grant_role: seed only, and unknown roles are refused', () => {
    const { run, mod, anon, agent, controller, publisher } = w;
    const newcomer = w.identityOf(jwt('newcomer'));
    const args = { identity: newcomer, role: 'controller' };
    expect(() => run(anon, ctx => mod.grantRole(ctx, args))).toThrow('anonymous may not do this (needs seed)');
    expect(() => run(agent, ctx => mod.grantRole(ctx, args))).toThrow('agent may not do this (needs seed)');
    expect(() => run(controller, ctx => mod.grantRole(ctx, args))).toThrow('controller may not do this (needs seed)');
    expect(() => run(publisher, ctx => mod.grantRole(ctx, { identity: newcomer, role: 'admin' }))).toThrow('unknown role admin');
    run(publisher, ctx => mod.grantRole(ctx, args));
    expect(w.h.db.role.identity.find(newcomer)?.role).toBe('controller');
  });

  it('a refusal on the reducer path writes nothing, not even the audit row', () => {
    const { run, mod, agent } = w;
    const before = w.rows.audits().length;
    expect(() => run(agent, ctx => mod.approvePayment(ctx, { txnRef: '2231', callbackNote: undefined }))).toThrow();
    expect(w.rows.audits().length).toBe(before);
  });
});

describe('2. the clock and the kernel', () => {
  it('publisher init: the publisher holds seed, the database identity is its own role, day 0, paused', () => {
    const w = makeWorld();
    expect(w.day()).toBe(0);
    expect(w.h.db.businessDay.id.find(1)?.paused).toBe(true);
    expect(w.h.db.role.identity.find(w.identityOf(w.publisher))?.role).toBe('seed');
    // ctx.identity is the database identity, which the harness exposes as moduleIdentity
    const dbIdentity = w.run(w.publisher, ctx => ctx.identity);
    expect(dbIdentity.isEqual(w.h.moduleIdentity)).toBe(true);
    expect(w.identityOf(w.internal).isEqual(w.h.moduleIdentity)).toBe(true);
    expect(w.h.db.role.identity.find(w.h.moduleIdentity)).toBeFalsy();
    expect(w.rows.audits('init')).toHaveLength(1);
  });

  it('day 41: location mismatch becomes a hold and a task, the second toll is auto-rejected, totals add up', () => {
    const w = makeWorld();
    for (let i = 0; i < 41; i++) w.run(w.publisher, ctx => w.mod.stepDay(ctx, {}));
    expect(w.day()).toBe(41);

    const m = w.rows.match('2231')!;
    expect(m.code).toBe('location_mismatch');
    expect(m.kind).toBe('card');
    const ev = JSON.parse(m.evidenceJson);
    expect(ev.driverName).toBe('Ramon Ortiz');
    expect(ev.plate).toBe('TX-1017');
    expect(ev.distanceMiles).toBeGreaterThan(25);
    expect(ev.nearestPing.engineOn).toBe(false);

    const hold = w.rows.hold('2231')!;
    expect(hold.status).toBe('open');
    expect(hold.code).toBe('location_mismatch');
    expect(hold.requestedBy.isEqual(w.h.moduleIdentity), DB_REQUESTED).toBe(true);
    expect(w.rows.payment('2231')).toBeFalsy();

    const tasks = w.rows.tasks('2231');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe('investigate');
    expect(tasks[0].status).toBe('open');
    expect(JSON.parse(tasks[0].briefJson).questionHint).toMatch(/different truck or driver/);

    // tolls: the earlier one pays, the later one 3 minutes apart is a duplicate with no hold and no task
    expect(w.rows.match('T1041')?.code).toBe('matched');
    expect(w.rows.payment('T1041')?.releasedRole).toBe('kernel');
    const dup = w.rows.match('T1042')!;
    expect(dup.code).toBe('duplicate_toll');
    expect(JSON.parse(dup.evidenceJson).duplicateOf).toBe('T1041');
    expect(w.rows.hold('T1042')).toBeFalsy();
    expect(w.rows.tasks('T1042')).toHaveLength(0);
    expect(w.rows.payment('T1042')).toBeFalsy();

    const total = w.rows.dayTotal(41)!;
    expect(total.txnCount).toBe(3);
    expect(total.autoPaidCount).toBe(1);
    expect(total.autoPaidCents).toBe(350n);
    expect(total.holdCount).toBe(1);
    expect(total.rejectedCount).toBe(1);
    expect(total.autoPaidCount + total.holdCount + total.rejectedCount).toBe(total.txnCount);
  });

  it('stepping again never re-settles day 41 (idempotent), and day 44 flags the bank change', () => {
    const w = makeWorld();
    w.stepTo(41);
    const snapshot = () => ({
      match: [w.rows.match('2231'), w.rows.match('T1041'), w.rows.match('T1042')],
      hold: w.rows.hold('2231'),
      tasks: w.rows.tasks('2231'),
      payments: [...w.h.db.payment.iter()],
      total: w.rows.dayTotal(41),
      rules: w.rows.rules(),
    });
    const before = snapshot();
    w.run(w.publisher, ctx => w.mod.stepDay(ctx, {}));
    expect(w.day()).toBe(42);
    expect(snapshot()).toEqual(before);
    expect(w.rows.dayTotal(42)).toBeFalsy(); // nothing happened on day 42

    w.stepTo(44);
    const inv = w.rows.match('INV-1077')!;
    expect(inv.code).toBe('vendor_bank_change');
    expect(inv.kind).toBe('invoice');
    expect(JSON.parse(inv.evidenceJson).daysSinceChange).toBe(2);
    const hold = w.rows.hold('INV-1077')!;
    expect(hold.status).toBe('open');
    expect(hold.cents).toBe(980_000n);
    expect(hold.requestedBy.isEqual(w.h.moduleIdentity), DB_REQUESTED).toBe(true);
    expect(w.rows.tasks('INV-1077').map(t => t.kind)).toEqual(['investigate']);
    expect(snapshot()).toEqual(before); // day 41 still untouched
  });

  it('the scheduled advance_day reducer is for the database only', () => {
    // The harness has no scheduler, so the timer is invoked directly: any JWT caller is refused,
    // the internal identity is allowed. (The paused clock makes it a no-op, which is what we want.)
    const w = makeWorld();
    const timer = [...w.h.db.dayTimer.iter()][0];
    expect(() => w.run(w.controller, ctx => w.mod.advanceDay(ctx, { timer }))).toThrow('scheduled only');
    expect(() => w.run(w.publisher, ctx => w.mod.advanceDay(ctx, { timer }))).toThrow('scheduled only');
    w.run(w.internal, ctx => w.mod.advanceDay(ctx, { timer }));
    expect(w.day()).toBe(0); // paused: a no-op
    w.run(w.publisher, ctx => w.mod.setClock(ctx, { paused: false }));
    w.run(w.internal, ctx => w.mod.advanceDay(ctx, { timer }));
    expect(w.day()).toBe(1);
  });
});

describe('3. segregation of duties', () => {
  let w: World;
  beforeEach(() => {
    w = makeWorld();
    w.stepTo(44); // 2231 (location_mismatch) and INV-1077 (vendor_bank_change) are both on hold
  });

  it('an agent that recommends release becomes the requester and still cannot approve', () => {
    const { run, mod, agent } = w;
    const task = w.rows.tasks('2231')[0];
    run(agent, ctx => mod.claimTask(ctx, { id: task.id, version: task.version }));
    expect(() => run(agent, ctx => mod.claimTask(ctx, { id: task.id, version: task.version }))).toThrow('task unavailable or already claimed');
    run(agent, ctx => mod.recordInvestigation(ctx, {
      id: task.id, stepsJson: '[]', findingJson: '{"finding":"card swap"}', recommendation: 'clear', question: undefined, source: 'replayed',
    }));
    const hold = w.rows.hold('2231')!;
    expect(hold.status).toBe('awaiting_controller');
    expect(hold.requestedBy.isEqual(w.identityOf(agent))).toBe(true);
    expect(w.h.db.agentTask.id.find(task.id)?.status).toBe('investigated');
    expect(() => run(agent, ctx => mod.approvePayment(ctx, { txnRef: '2231', callbackNote: undefined }))).toThrow('agent may not do this');
    expect(w.rows.payment('2231')).toBeFalsy();
  });

  it('record_investigation needs the claim to be the caller\'s own', () => {
    const { run, mod, agent } = w;
    const task = w.rows.tasks('2231')[0];
    const payload = { id: task.id, stepsJson: '[]', findingJson: '{}', recommendation: 'hold', question: undefined, source: 'none' };
    expect(() => run(agent, ctx => mod.recordInvestigation(ctx, payload))).toThrow('task not claimed by caller');
    run(agent, ctx => mod.claimTask(ctx, { id: task.id, version: task.version }));
    const other = jwt('worker-2');
    w.grant(other, 'agent');
    expect(() => run(other, ctx => mod.recordInvestigation(ctx, payload))).toThrow('task not claimed by caller');
    expect(() => run(agent, ctx => mod.recordInvestigation(ctx, { ...payload, recommendation: 'pay' }))).toThrow('bad recommendation pay');
  });

  it('a bank-change hold needs a call-back note of 8+ characters; one payment; no double release', () => {
    const { run, mod, controller } = w;
    expect(() => run(controller, ctx => mod.approvePayment(ctx, { txnRef: 'INV-1077', callbackNote: undefined })))
      .toThrow('call-back note required for a bank change');
    expect(() => run(controller, ctx => mod.approvePayment(ctx, { txnRef: 'INV-1077', callbackNote: 'ok      ' })))
      .toThrow('call-back note required for a bank change');
    expect(w.rows.payment('INV-1077')).toBeFalsy();

    run(controller, ctx => mod.approvePayment(ctx, { txnRef: 'INV-1077', callbackNote: 'Called M. Reyes on the number on file; confirmed.' }));
    const hold = w.rows.hold('INV-1077')!;
    expect(hold.status).toBe('released');
    expect(hold.callbackNote).toMatch(/Reyes/);
    const paid = w.rows.payments('INV-1077');
    expect(paid).toHaveLength(1);
    expect(paid[0].cents).toBe(980_000n);
    expect(paid[0].releasedRole).toBe('controller');
    expect(paid[0].releasedBy.isEqual(w.identityOf(controller))).toBe(true);

    expect(() => run(controller, ctx => mod.approvePayment(ctx, { txnRef: 'INV-1077', callbackNote: 'Called again, still confirmed.' })))
      .toThrow('hold is released');
    expect(w.rows.payments('INV-1077')).toHaveLength(1);
  });

  it('a rejected hold stays rejected', () => {
    const { run, mod, controller } = w;
    run(controller, ctx => mod.rejectPayment(ctx, { txnRef: '2231', reason: 'card misuse confirmed' }));
    expect(w.rows.hold('2231')?.status).toBe('rejected');
    expect(() => run(controller, ctx => mod.approvePayment(ctx, { txnRef: '2231', callbackNote: undefined }))).toThrow('hold is rejected');
    expect(() => run(controller, ctx => mod.rejectPayment(ctx, { txnRef: '2231', reason: 'again' }))).toThrow('hold is rejected');
    expect(() => run(controller, ctx => mod.answerQuestion(ctx, { txnRef: '2231', text: 'late' }))).toThrow('hold already rejected');
    expect(w.rows.payment('2231')).toBeFalsy();
  });
});

describe('4. the try_ procedures: refusals that leave a trace', () => {
  it('try_approve_payment as the agent returns ok:false and commits an audit row', () => {
    const w = makeWorld();
    w.stepTo(41);
    expect(w.rows.audits('refused')).toHaveLength(0);

    const out = w.mod.tryApprovePayment(w.h.procedureContext(w.agent), { txnRef: '2231', callbackNote: undefined });
    expect(out).toEqual({ ok: false, message: 'agent may not do this (needs controller)' });

    const refused = w.rows.audits('refused');
    expect(refused).toHaveLength(1);
    expect(refused[0].actorRole).toBe('agent');
    expect(refused[0].ref).toBe('2231');
    expect(refused[0].detail).toBe('agent may not do this (needs controller)');
    expect(refused[0].actor.isEqual(w.identityOf(w.agent))).toBe(true);
    expect(w.rows.hold('2231')?.status).toBe('open');
  });

  it('the reducer path rolls the audit row back with the transaction', () => {
    const w = makeWorld();
    w.stepTo(41);
    expect(() => w.run(w.agent, ctx => w.mod.approvePayment(ctx, { txnRef: '2231', callbackNote: undefined })))
      .toThrow('agent may not do this (needs controller)');
    expect(w.rows.audits('refused')).toHaveLength(0);
  });

  it('the same check on the success path commits the change and returns ok', () => {
    const w = makeWorld();
    w.stepTo(41);
    const out = w.mod.tryApprovePayment(w.h.procedureContext(w.controller), { txnRef: '2231', callbackNote: undefined });
    expect(out).toEqual({ ok: true, message: 'ok' });
    expect(w.rows.hold('2231')?.status).toBe('released');
    expect(w.rows.payments('2231')).toHaveLength(1);
    expect(w.rows.audits('approve_payment')).toHaveLength(1);
  });

  it('try_step_day and try_set_clock refuse anonymous callers on the record', () => {
    const w = makeWorld();
    expect(w.mod.tryStepDay(w.h.procedureContext(w.anon), {})).toEqual({ ok: false, message: 'anonymous may not do this (needs seed or controller)' });
    expect(w.mod.trySetClock(w.h.procedureContext(w.anon), { paused: false })).toEqual({ ok: false, message: 'anonymous may not do this (needs seed or controller)' });
    expect(w.day()).toBe(0);
    expect(w.rows.audits('refused').map(e => e.actorRole)).toEqual(['anonymous', 'anonymous']);
    expect(w.mod.tryStepDay(w.h.procedureContext(w.controller), {})).toEqual({ ok: true, message: 'ok' });
    expect(w.day()).toBe(1);
  });
});

describe('5. rules and memory', () => {
  const RULE = { sourceTxnRef: '2231', scopeJson: '{"driverId":23}', condition: 'location_mismatch', backtestJson: '{"n":1}',
    uses: 'one_time', validFromDay: 41, validToDay: 46, reason: 'Ortiz drove truck 22 on day 41' };
  let w: World;
  beforeEach(() => {
    w = makeWorld();
    w.stepTo(41);
  });

  it('answering the controller\'s question opens a draft_rule task', () => {
    w.run(w.controller, ctx => w.mod.answerQuestion(ctx, { txnRef: '2231', text: 'Yes, Ortiz was in truck 22 while 17 was in the shop.' }));
    expect(w.rows.hold('2231')?.status).toBe('answered');
    expect(w.rows.hold('2231')?.answer).toMatch(/truck 22/);
    const kinds = w.rows.tasks('2231').map(t => t.kind).sort();
    expect(kinds).toEqual(['draft_rule', 'investigate']);
    const draft = w.rows.tasks('2231').find(t => t.kind === 'draft_rule')!;
    expect(draft.status).toBe('open');
    expect(JSON.parse(draft.briefJson).answer).toMatch(/truck 22/);
  });

  it('the module computes the backtest itself and keeps the worker\'s numbers as a preview', () => {
    w.run(w.agent, ctx => w.mod.createRule(ctx, RULE));
    const r = w.rows.rules()[0];
    expect(r.status).toBe('candidate');
    expect(r.scopeJson).toBe('{"driverId":23}');
    expect(r.createdBy.isEqual(w.identityOf(w.agent))).toBe(true);
    const bt = JSON.parse(r.backtestJson);
    expect(bt.n).toBe(1);
    expect(bt.confirmedExceptionsCovered).toBe(0);
    expect(bt.trueExceptionsCleared).toBe(0);
    expect(bt.openHoldsCovered).toBe(1);
    expect(bt.sampleRefs).toEqual(['2231']);
    expect(bt.computedBy).toBe('module');
    expect(bt.workerPreview).toEqual({ n: 1 });
  });

  it('refuses conditions outside the allowlist, unscoped rules and bad windows', () => {
    const { run, mod, agent } = w;
    expect(() => run(agent, ctx => mod.createRule(ctx, { ...RULE, condition: 'capacity_exceeded' }))).toThrow('rules may not target capacity_exceeded');
    expect(() => run(agent, ctx => mod.createRule(ctx, { ...RULE, condition: 'vendor_bank_change' }))).toThrow('rules may not target vendor_bank_change');
    expect(() => run(agent, ctx => mod.createRule(ctx, { ...RULE, scopeJson: '{}' }))).toThrow('rule must be scoped to a driver, truck, card or vendor');
    expect(() => run(agent, ctx => mod.createRule(ctx, { ...RULE, scopeJson: '{"truckIds":[]}' }))).toThrow('rule must be scoped');
    expect(() => run(agent, ctx => mod.createRule(ctx, { ...RULE, scopeJson: 'not json' }))).toThrow('rule must be scoped');
    expect(() => run(agent, ctx => mod.createRule(ctx, { ...RULE, uses: 'forever' }))).toThrow('uses must be one_time or standing');
    expect(() => run(agent, ctx => mod.createRule(ctx, { ...RULE, validFromDay: 46, validToDay: 41 }))).toThrow('rule window is empty');
    expect(() => run(agent, ctx => mod.createRule(ctx, { ...RULE, validToDay: 41 + 93 }))).toThrow('rule window too long');
    expect(w.rows.rules()).toHaveLength(0);
  });

  it('refuses a rule that would have cleared an exception the controller confirmed', () => {
    w.run(w.controller, ctx => w.mod.rejectPayment(ctx, { txnRef: '2231', reason: 'card misuse confirmed' }));
    expect(() => w.run(w.agent, ctx => w.mod.createRule(ctx, RULE))).toThrow('rule would clear 1 confirmed exception(s)');
    // a scope that does not reach the rejected hold is still fine
    w.run(w.agent, ctx => w.mod.createRule(ctx, { ...RULE, scopeJson: '{"driverId":24}' }));
    expect(JSON.parse(w.rows.rules()[0].backtestJson).n).toBe(0);
  });

  it('the author cannot approve; another controller can, and the hold clears at once', () => {
    const { run, mod, agent, controller } = w;
    run(controller, ctx => mod.answerQuestion(ctx, { txnRef: '2231', text: 'Confirmed swap.' }));
    run(agent, ctx => mod.createRule(ctx, RULE));
    const id = w.rows.rules()[0].id;

    // The author holds the agent role, so the role check fires first. To reach the author check the
    // publisher promotes the same identity to controller for one call, then restores it.
    expect(() => run(agent, ctx => mod.approveRule(ctx, { id }))).toThrow('agent may not do this (needs controller)');
    w.grant(agent, 'controller');
    expect(() => run(agent, ctx => mod.approveRule(ctx, { id }))).toThrow('author cannot approve own rule');
    expect(w.mod.tryApproveRule(w.h.procedureContext(agent), { id })).toEqual({ ok: false, message: 'author cannot approve own rule' });
    w.grant(agent, 'agent');
    expect(w.rows.rule(id)?.status).toBe('candidate');

    run(controller, ctx => mod.approveRule(ctx, { id }));
    const rule = w.rows.rule(id)!;
    expect(rule.approvedBy?.isEqual(w.identityOf(controller))).toBe(true);
    expect(rule.status).toBe('expired'); // one_time: consumed by the immediate rematch
    expect(rule.reason).toBe('one_time rule consumed by 2231');

    const hold = w.rows.hold('2231')!;
    expect(hold.status).toBe('cleared_by_rule');
    expect(hold.ruleId).toBe(id);
    const m = w.rows.match('2231')!;
    expect(m.code).toBe('matched');
    expect(m.ruleId).toBe(id);
    expect(JSON.parse(m.evidenceJson).clearedBy).toBe('rule');
    const paid = w.rows.payments('2231');
    expect(paid).toHaveLength(1);
    expect(paid[0].releasedRole).toBe('rule');
    expect(paid[0].cents).toBe(41_200n);
    expect(w.rows.audits('cleared_by_rule')).toHaveLength(1);

    expect(() => run(controller, ctx => mod.approveRule(ctx, { id }))).toThrow('rule is expired');
    expect(() => run(controller, ctx => mod.approvePayment(ctx, { txnRef: '2231', callbackNote: undefined }))).toThrow('hold is cleared_by_rule');
  });

  it('a rule whose window ended before the day does not apply, and expires on the next tick', () => {
    const { run, mod, agent, controller } = w;
    run(agent, ctx => mod.createRule(ctx, { ...RULE, uses: 'standing', validFromDay: 30, validToDay: 40 }));
    const id = w.rows.rules()[0].id;
    expect(JSON.parse(w.rows.rule(id)!.backtestJson).n).toBe(0);
    run(controller, ctx => mod.approveRule(ctx, { id }));
    expect(w.rows.rule(id)?.status).toBe('approved');
    expect(w.rows.match('2231')?.code).toBe('location_mismatch');
    expect(w.rows.hold('2231')?.status).toBe('open');
    expect(w.rows.payment('2231')).toBeFalsy();

    w.stepTo(42);
    expect(w.rows.rule(id)?.status).toBe('expired');
    expect(w.rows.rule(id)?.reason).toBe('expired on day 42');
  });

  it('a standing rule inside its window clears the hold and stays approved', () => {
    const { run, mod, agent, controller } = w;
    run(agent, ctx => mod.createRule(ctx, { ...RULE, uses: 'standing' }));
    const id = w.rows.rules()[0].id;
    run(controller, ctx => mod.approveRule(ctx, { id }));
    expect(w.rows.hold('2231')?.status).toBe('cleared_by_rule');
    expect(w.rows.rule(id)?.status).toBe('approved');
    w.stepTo(47); // validToDay 46 passed
    expect(w.rows.rule(id)?.status).toBe('expired');
  });
});

describe('6. injection: the injecting controller cannot approve its own hold', () => {
  it('inject_card_txn records the caller as requester', () => {
    const w = makeWorld();
    w.stepTo(41);
    const { run, mod, controller } = w;
    expect(() => run(w.agent, ctx => mod.injectCardTxn(ctx, { row: cardRow() }))).toThrow('agent may not do this (needs controller)');
    expect(() => run(w.publisher, ctx => mod.injectCardTxn(ctx, { row: cardRow() }))).toThrow('seed may not do this (needs controller)');

    run(controller, ctx => mod.injectCardTxn(ctx, { row: cardRow({ day: 7 }) }));
    expect(w.h.db.cardTxn.id.find('9001')?.day).toBe(41); // the day is overwritten with the current day
    expect(w.rows.match('9001')?.code).toBe('location_mismatch');
    const hold = w.rows.hold('9001')!;
    expect(hold.status).toBe('open');
    expect(hold.requestedBy.isEqual(w.identityOf(controller))).toBe(true);
    expect(w.rows.tasks('9001').map(t => t.kind)).toEqual(['investigate']);
    expect(w.rows.dayTotal(41)?.txnCount).toBe(4);
    expect(w.rows.dayTotal(41)?.holdCount).toBe(2);

    expect(() => run(controller, ctx => mod.approvePayment(ctx, { txnRef: '9001', callbackNote: undefined }))).toThrow('requester cannot approve');
    expect(w.mod.tryApprovePayment(w.h.procedureContext(controller), { txnRef: '9001', callbackNote: undefined }))
      .toEqual({ ok: false, message: 'requester cannot approve' });
    expect(w.rows.payment('9001')).toBeFalsy();
    expect(() => run(controller, ctx => mod.injectCardTxn(ctx, { row: cardRow() }))).toThrow('txn id exists');

    // a second controller is not the requester and may release it
    const second = jwt('controller-2');
    w.grant(second, 'controller');
    run(second, ctx => mod.approvePayment(ctx, { txnRef: '9001', callbackNote: undefined }));
    expect(w.rows.hold('9001')?.status).toBe('released');
    expect(w.rows.payment('9001')?.releasedBy.isEqual(w.identityOf(second))).toBe(true);
  });

  it('an injected transaction at the pump matches and auto-pays', () => {
    const w = makeWorld();
    w.stepTo(41);
    // truck 22 pinged at Schulenburg at 13:00 on day 41
    w.run(w.controller, ctx => w.mod.injectCardTxn(ctx, { row: cardRow({
      id: '9002', cardId: 'FC-1022', truckId: 22, driverId: 24, stationName: "Love's 412",
      stationLat: 29.6816, stationLon: -96.9036, cents: 30_000n,
    }) }));
    expect(w.rows.match('9002')?.code).toBe('matched');
    expect(w.rows.payment('9002')?.releasedRole).toBe('kernel');
    expect(w.rows.hold('9002')).toBeFalsy();
  });
});
