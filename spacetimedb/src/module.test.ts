// In-process integration tests for the Dispatch Ledger module. Each `describe` is one guardrail
// from docs/CONTRACT.md, run against the real reducers through the SDK's module test harness.
//
// How a reducer is called here: `h.withReducerTx(auth, ctx => mod.approvePayment(ctx, { txnRef, callbackNote }))`.
// The body runs inside one transaction; a thrown SenderError aborts it (nothing is written) and the
// error propagates to the test. Procedures take `h.procedureContext(auth)` instead and commit their
// own transactions, so a refusal there leaves an audit row and returns `{ ok: false, message }`.
import { beforeEach, describe, expect, it } from 'vitest';
import { makeWorld, cardRow, jwt, EL_PASO, SCHULENBURG, type World } from './test_helpers';

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
    expect(w.rows.tasks('INV-1077').map(t => t.kind)).toEqual(['investigate', 'vendor_check']); // Task 16: a bank-change hold is also vetted
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

describe('7. settlement: record_settlement writes a bank id onto an existing payment and nothing else', () => {
  // Task 17 acceptance: "record_settlement with no matching payment is refused in a test".
  it('agent only: controller, seed and anonymous are refused by role', () => {
    const w = makeWorld();
    w.stepTo(41); // T1041 auto-pays on day 41
    const { run, mod } = w;
    const args = { txnRef: 'T1041', bankTxnId: 'nessie-1' };
    expect(() => run(w.anon, ctx => mod.recordSettlement(ctx, args))).toThrow('anonymous may not do this (needs agent)');
    expect(() => run(w.controller, ctx => mod.recordSettlement(ctx, args))).toThrow('controller may not do this (needs agent)');
    expect(() => run(w.publisher, ctx => mod.recordSettlement(ctx, args))).toThrow('seed may not do this (needs agent)');
    expect(w.rows.payment('T1041')?.bankTxnId).toBeUndefined();
  });

  it('no payment row: refused, so there is no path from a settlement to a payment (G3)', () => {
    const w = makeWorld();
    w.stepTo(41);
    expect(w.rows.payment('2231')).toBeFalsy(); // 2231 is a hold, not a payment
    expect(() => w.run(w.agent, ctx => w.mod.recordSettlement(ctx, { txnRef: '2231', bankTxnId: 'nessie-2' }))).toThrow('no payment to settle');
    expect(() => w.run(w.agent, ctx => w.mod.recordSettlement(ctx, { txnRef: 'NOPE', bankTxnId: 'nessie-3' }))).toThrow('no payment to settle');
    expect(w.rows.payment('2231')).toBeFalsy();
  });

  it('a successful call writes bank_txn_id once and an audit row with action settle', () => {
    const w = makeWorld();
    w.stepTo(41);
    const before = w.rows.payment('T1041')!;
    expect(before.bankTxnId).toBeUndefined();
    w.run(w.agent, ctx => w.mod.recordSettlement(ctx, { txnRef: 'T1041', bankTxnId: 'nessie-abc-123' }));
    const after = w.rows.payment('T1041')!;
    expect(after.bankTxnId).toBe('nessie-abc-123');
    expect(after.cents).toBe(before.cents);
    expect(after.releasedRole).toBe(before.releasedRole);
    const settles = [...w.h.db.auditEvent.iter()].filter(a => a.action === 'settle');
    expect(settles).toHaveLength(1);
    expect(settles[0].ref).toBe('T1041');
    expect(settles[0].actorRole).toBe('agent');
    expect(settles[0].detail).toContain('nessie-abc-123');
    // a second settlement of the same payment is refused and leaves the first id in place
    expect(() => w.run(w.agent, ctx => w.mod.recordSettlement(ctx, { txnRef: 'T1041', bankTxnId: 'nessie-other' })))
      .toThrow('already settled as nessie-abc-123');
    expect(w.rows.payment('T1041')?.bankTxnId).toBe('nessie-abc-123');
    expect([...w.h.db.auditEvent.iter()].filter(a => a.action === 'settle')).toHaveLength(1);
  });

  it('an empty or over-long bank id is refused', () => {
    const w = makeWorld();
    w.stepTo(41);
    expect(() => w.run(w.agent, ctx => w.mod.recordSettlement(ctx, { txnRef: 'T1041', bankTxnId: '   ' }))).toThrow('bank transaction id must be 1 to 120 characters');
    expect(() => w.run(w.agent, ctx => w.mod.recordSettlement(ctx, { txnRef: 'T1041', bankTxnId: 'x'.repeat(121) }))).toThrow('bank transaction id must be 1 to 120 characters');
    w.run(w.agent, ctx => w.mod.recordSettlement(ctx, { txnRef: 'T1041', bankTxnId: 'x'.repeat(120) }));
    expect(w.rows.payment('T1041')?.bankTxnId).toHaveLength(120);
  });
});

describe('8. the reader role: the identity that explains cannot pay', () => {
  // Task 18. The investigator agent holds a `reader` identity. It reads public views and the stored
  // finding; every money, rule and worker reducer refuses it on the role check, before anything else.
  let w: World;
  let reader: ReturnType<typeof jwt>;
  beforeEach(() => {
    w = makeWorld();
    reader = jwt('investigator-1');
    w.grant(reader, 'reader');
    w.stepTo(41); // hold 2231 and its open task exist
  });

  it('grant_role accepts reader and records it', () => {
    expect(w.h.db.role.identity.find(w.identityOf(reader))?.role).toBe('reader');
    expect(w.rows.audits('grant_role').map(e => e.detail)).toContain('reader');
  });

  it('every controller reducer refuses the reader on the role check', () => {
    const { run, mod } = w;
    expect(() => run(reader, ctx => mod.approvePayment(ctx, { txnRef: '2231', callbackNote: undefined }))).toThrow('reader may not do this (needs controller)');
    expect(() => run(reader, ctx => mod.answerQuestion(ctx, { txnRef: '2231', text: 'Ortiz drove truck 22 that day.' }))).toThrow('reader may not do this (needs controller)');
    expect(() => run(reader, ctx => mod.approveRule(ctx, { id: 1n }))).toThrow('reader may not do this (needs controller)');
    expect(() => run(reader, ctx => mod.rejectPayment(ctx, { txnRef: '2231', reason: 'card was cloned' }))).toThrow('reader may not do this (needs controller)');
    expect(w.rows.hold('2231')?.status).toBe('open');
    expect(w.rows.payment('2231')).toBeFalsy();
  });

  it('every agent reducer refuses the reader on the role check', () => {
    const { run, mod } = w;
    const task = w.rows.tasks('2231')[0];
    expect(() => run(reader, ctx => mod.claimTask(ctx, { id: task.id, version: task.version }))).toThrow('reader may not do this (needs agent)');
    expect(() => run(reader, ctx => mod.recordInvestigation(ctx, {
      id: task.id, stepsJson: '[]', findingJson: '{}', recommendation: 'clear', question: undefined, source: 'live',
    }))).toThrow('reader may not do this (needs agent)');
    expect(() => run(reader, ctx => mod.createRule(ctx, {
      sourceTxnRef: '2231', scopeJson: '{"driverId":23}', condition: 'location_mismatch', backtestJson: '{}',
      uses: 'one_time', validFromDay: 41, validToDay: 46, reason: 'driver swapped trucks',
    }))).toThrow('reader may not do this (needs agent)');
    expect(w.h.db.agentTask.id.find(task.id)?.status).toBe('open');
    expect(w.rows.rules()).toHaveLength(0);
  });

  it('try_approve_payment by the reader returns [false, message] and leaves an audit row with actor_role reader', () => {
    const before = w.rows.audits('refused').length;
    const out = w.mod.tryApprovePayment(w.h.procedureContext(reader), { txnRef: '2231', callbackNote: undefined });
    expect(out).toEqual({ ok: false, message: 'reader may not do this (needs controller)' });
    const refused = w.rows.audits('refused');
    expect(refused).toHaveLength(before + 1);
    const row = refused[refused.length - 1];
    expect(row.actorRole).toBe('reader');
    expect(row.ref).toBe('2231');
    expect(row.detail).toBe('reader may not do this (needs controller)');
    expect(row.actor.isEqual(w.identityOf(reader))).toBe(true);
    expect(w.rows.hold('2231')?.status).toBe('open');
    expect(w.rows.payment('2231')).toBeFalsy();
  });
});

describe('9. ingest_rows: the inbox file connector matches through the same path as the clock (Task 21)', () => {
  let w: World;
  const FILE = 'fuel_card_wex_sample.csv';
  // the batch shape scripts/ingest_watch.py sends: no truck id (resolved from the card), micros as a string
  const far = (w: World) => ({
    id: '7001', cardId: 'FC-1017', driverId: 23, atMicros: w.ts(41, 13, 10).microsSinceUnixEpoch.toString(), day: 41,
    stationName: 'Petro El Paso', stationLat: EL_PASO.lat, stationLon: EL_PASO.lon, gallons: 100, cents: 35000, merchant: 'PETRO',
  });
  const atPump = (w: World) => ({
    id: '7002', cardId: 'FC-1022', driverId: 24, atMicros: w.ts(41, 13, 10).microsSinceUnixEpoch.toString(), day: 41,
    stationName: "Love's 412, Schulenburg TX", stationLat: SCHULENBURG.lat, stationLon: SCHULENBURG.lon, gallons: 80, cents: 30000, merchant: 'LOVES #412',
  });
  const ingest = (auth: Parameters<World['run']>[0], kind: string, rows: object[], fileName = FILE) =>
    w.run(auth, ctx => w.mod.ingestRows(ctx, { fileName, kind, batchJson: JSON.stringify(rows) }));
  const logs = () => [...w.h.db.ingestLog.iter()];
  beforeEach(() => {
    w = makeWorld();
    w.stepTo(41);
  });

  it('seed only: anonymous, agent, controller and reader are refused by role and nothing is written', () => {
    for (const [auth, who] of [[w.anon, 'anonymous'], [w.agent, 'agent'], [w.controller, 'controller']] as const) {
      expect(() => ingest(auth, 'card', [far(w)])).toThrow(`${who} may not do this (needs seed)`);
    }
    expect(w.h.db.cardTxn.id.find('7001')).toBeFalsy();
    expect(logs()).toHaveLength(0);
  });

  it('a batch dropped on the current day raises the expected hold and pays the clean row under the limits', () => {
    ingest(w.publisher, 'card', [far(w), atPump(w)]);
    // the far row: truck 17 sat at San Antonio engine off, the card was used in El Paso
    expect(w.rows.match('7001')?.code).toBe('location_mismatch');
    expect(w.rows.hold('7001')?.status).toBe('open');
    expect(w.rows.tasks('7001').map(t => t.kind)).toEqual(['investigate']);
    expect(w.h.db.cardTxn.id.find('7001')?.truckId).toBe(17); // resolved from FC-1017, never read from the file
    // the clean row: truck 22 pinged at the pump
    expect(w.rows.match('7002')?.code).toBe('matched');
    expect(w.rows.payment('7002')?.releasedRole).toBe('kernel');
    expect(w.rows.hold('7002')).toBeFalsy();
    expect(w.rows.dayTotal(41)?.txnCount).toBe(5); // 3 seeded rows on day 41 plus these two
    const log = logs();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ fileName: FILE, kind: 'card', rows: 2, skipped: 0, matched: 2 });
    expect(log[0].actor.isEqual(w.identityOf(w.publisher))).toBe(true);
    const audit = w.rows.audits('ingest');
    expect(audit).toHaveLength(1);
    expect(audit[0].ref).toBe(FILE);
    expect(audit[0].detail).toBe('card: 2 rows, 0 skipped (already on file), 2 matched now, 0 waiting for their day; file connector');
  });

  it('re-dropping the same batch skips every row and writes nothing new', () => {
    ingest(w.publisher, 'card', [far(w), atPump(w)]);
    const before = { cards: [...w.h.db.cardTxn.iter()].length, payments: [...w.h.db.payment.iter()].length, holds: [...w.h.db.hold.iter()].length, tasks: [...w.h.db.agentTask.iter()].length };
    ingest(w.publisher, 'card', [far(w), atPump(w)]);
    expect([...w.h.db.cardTxn.iter()].length).toBe(before.cards);
    expect([...w.h.db.payment.iter()].length).toBe(before.payments);
    expect([...w.h.db.hold.iter()].length).toBe(before.holds);
    expect([...w.h.db.agentTask.iter()].length).toBe(before.tasks);
    expect(logs()[logs().length - 1]).toMatchObject({ rows: 2, skipped: 2, matched: 0 });
  });

  it('a row dated after today waits for its day and is matched by the clock, in order', () => {
    const later = { ...far(w), id: '7003', atMicros: w.ts(44, 9, 0).microsSinceUnixEpoch.toString(), day: 44 };
    ingest(w.publisher, 'card', [later]);
    expect(w.h.db.cardTxn.id.find('7003')?.day).toBe(44);
    expect(w.rows.match('7003')).toBeFalsy();
    expect(logs()[logs().length - 1]).toMatchObject({ rows: 1, skipped: 0, matched: 0 });
    w.stepTo(43);
    expect(w.rows.match('7003')).toBeFalsy();
    w.stepTo(44);
    expect(w.rows.match('7003')?.code).toBe('location_mismatch');
    expect(w.rows.hold('7003')?.day).toBe(44);
  });

  it('a row dated before today is matched at once against its own day', () => {
    const earlier = { ...atPump(w), id: '7004', atMicros: w.ts(40, 13, 10).microsSinceUnixEpoch.toString(), day: 40 };
    ingest(w.publisher, 'card', [earlier]);
    expect(w.rows.match('7004')?.code).toBe('location_mismatch'); // no truck 22 ping on day 40
    expect(w.rows.hold('7004')?.day).toBe(40);
    expect(w.rows.dayTotal(40)?.txnCount).toBe(1);
  });

  it('an unknown card, plate or vendor refuses the whole batch and nothing in it is written', () => {
    expect(() => ingest(w.publisher, 'card', [atPump(w), { ...far(w), cardId: 'FC-9999' }])).toThrow('unknown card FC-9999');
    expect(w.h.db.cardTxn.id.find('7002')).toBeFalsy();
    const toll = { id: 'T7001', plate: 'TX-0000', atMicros: w.ts(41, 9, 0).microsSinceUnixEpoch.toString(), day: 41, plazaId: 'P-7', plazaName: 'SH-130 Plaza 7', cents: 350 };
    expect(() => ingest(w.publisher, 'toll', [toll], 'toll_statement_sample.csv')).toThrow('unknown plate TX-0000');
    const inv = { id: 'INV-7001', vendorId: 99, poId: null, receivedDay: 41, item: 'brake_job', qty: 1, unitCents: 24500, cents: 24500, docRef: 'invoices/INV-7001.txt' };
    expect(() => ingest(w.publisher, 'invoice', [inv], 'maintenance_invoices_sample.csv')).toThrow('unknown vendor 99');
    expect(() => ingest(w.publisher, 'fuel', [far(w)])).toThrow('unknown kind fuel');
    expect(() => w.run(w.publisher, ctx => w.mod.ingestRows(ctx, { fileName: FILE, kind: 'card', batchJson: 'not json' }))).toThrow('batch is not JSON');
    expect(() => ingest(w.publisher, 'card', [{ ...far(w), day: 93 }])).toThrow('day 93 is outside 1 to 92');
    expect(() => ingest(w.publisher, 'card', [{ ...far(w), cents: 12.5 }])).toThrow('cents is not an integer');
    expect(logs()).toHaveLength(0);
  });

  it('tolls and invoices take the same path: the second toll minutes after the first is auto-rejected, the invoice is matched', () => {
    const t1 = { id: 'T7001', plate: 'TX-1022', atMicros: w.ts(41, 10, 0).microsSinceUnixEpoch.toString(), day: 41, plazaId: 'P-9', plazaName: 'SH-130 Plaza 9', cents: 350 };
    const t2 = { ...t1, id: 'T7002', atMicros: w.ts(41, 10, 3).microsSinceUnixEpoch.toString() };
    ingest(w.publisher, 'toll', [t2, t1], 'toll_statement_sample.csv'); // out of order in the file; matched in time order
    expect(w.h.db.tollTxn.id.find('T7001')?.truckId).toBe(22);
    expect(w.rows.match('T7001')?.code).toBe('matched');
    expect(w.rows.match('T7002')?.code).toBe('duplicate_toll');
    expect(w.rows.payment('T7002')).toBeFalsy();
    expect(w.rows.audits('auto_reject').some(a => a.ref === 'T7002')).toBe(true);
    const inv = { id: 'INV-7001', vendorId: 3, poId: 'PO-3001', receivedDay: 41, item: 'brake_job', qty: 40, unitCents: 24500, cents: 980000, docRef: 'invoices/INV-7001.txt' };
    ingest(w.publisher, 'invoice', [inv], 'maintenance_invoices_sample.csv');
    expect(w.h.db.invoice.id.find('INV-7001')?.poId).toBe('PO-3001');
    expect(w.rows.match('INV-7001')).toBeTruthy();
    expect(w.rows.tasks('INV-7001').map(t => t.kind)).toContain('vendor_check'); // the vendor's first invoice is vetted
    expect(logs().map(l => l.kind)).toEqual(['toll', 'invoice']);
  });
});

describe('10. try_record_seat_refusal: the controller records a refused ASI:One sender (Task 28 item 3)', () => {
  const SENDER = 'agent1qtly3w7yc4exampleexampleexampleexampleexampleexample';
  let w: World;
  beforeEach(() => { w = makeWorld(); });

  it('controller records one seat_refused row with the sender in detail and nothing else', () => {
    const before = w.rows.audits().length;
    const out = w.mod.tryRecordSeatRefusal(w.h.procedureContext(w.controller), { sender: SENDER });
    expect(out).toEqual({ ok: true, message: 'recorded' });
    expect(w.rows.audits()).toHaveLength(before + 1);
    const rows = w.rows.audits('seat_refused');
    expect(rows).toHaveLength(1);
    expect(rows[0].actorRole).toBe('controller');
    expect(rows[0].ref).toBe('controller seat');
    expect(rows[0].detail).toBe(`not authorised for this seat: ${SENDER}`);
    expect(rows[0].actor.isEqual(w.identityOf(w.controller))).toBe(true);
  });

  it('agent, reader, seed and anonymous are refused by role with the normal refused row', () => {
    const reader = jwt('investigator-1');
    w.grant(reader, 'reader');
    const callers = [[w.agent, 'agent'], [reader, 'reader'], [w.publisher, 'seed'], [w.anon, 'anonymous']] as const;
    for (const [auth, who] of callers) {
      expect(w.mod.tryRecordSeatRefusal(w.h.procedureContext(auth), { sender: SENDER }))
        .toEqual({ ok: false, message: `${who} may not do this (needs controller)` });
    }
    expect(w.rows.audits('seat_refused')).toHaveLength(0);
    const refused = w.rows.audits('refused');
    expect(refused.map(e => e.actorRole)).toEqual(['agent', 'reader', 'seed', 'anonymous']);
    expect(refused.every(e => e.ref === 'controller seat')).toBe(true);
  });

  it('an over-long sender is trimmed, stripped of control characters and bounded to 120 characters', () => {
    const long = `  agent1q\n\u0007${'x'.repeat(300)}  `;
    w.mod.tryRecordSeatRefusal(w.h.procedureContext(w.controller), { sender: long });
    const detail = w.rows.audits('seat_refused')[0].detail;
    const kept = detail.slice('not authorised for this seat: '.length);
    expect(kept).toHaveLength(120);
    expect(kept.startsWith('agent1qx')).toBe(true);
    expect(/[\u0000-\u001f\u007f]/.test(detail)).toBe(false);
  });
});
