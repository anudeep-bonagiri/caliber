import { describe, expect, it } from 'vitest';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import { ConnectionId, Identity } from 'spacetimedb';
import spacetimedb from './schema';
import * as mod from './index';

describe('spike', () => {
  it('boots', () => {
    const h = createModuleTestHarness(spacetimedb, mod);
    const internal = TestAuth.internal();
    h.withReducerTx(internal, ctx => { mod.init(ctx, {}); });
    const roles = [...h.db.role.iter()];
    console.log('roles', roles.map(r => [r.identity.toHexString(), r.role]), 'module', h.moduleIdentity.toHexString());
    const a1 = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'agent-1' }), new ConnectionId(1n));
    const a1b = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'agent-1' }), new ConnectionId(2n));
    const c1 = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'controller-1' }), new ConnectionId(3n));
    const s1 = h.withReducerTx(a1, ctx => [ctx.sender.toHexString(), ctx.identity.toHexString(), ctx.identity.isEqual(h.moduleIdentity)]);
    const s1b = h.withReducerTx(a1b, ctx => ctx.sender.toHexString());
    const s2 = h.withReducerTx(c1, ctx => ctx.sender.toHexString());
    console.log(s1, s1b, s2);
    expect(s1[0]).toBe(s1b);
    expect(s1[0]).not.toBe(s2);
    expect(s1[2]).toBe(true);
    // refusal path rolls back the audit row
    const before = [...h.db.auditEvent.iter()].length;
    expect(() => h.withReducerTx(a1, ctx => mod.approvePayment(ctx, { txnRef: 'x', callbackNote: undefined }))).toThrow(/anonymous may not do this/);
    expect([...h.db.auditEvent.iter()].length).toBe(before);
    // procedure path
    const out = mod.tryApprovePayment(h.procedureContext(a1), { txnRef: 'x', callbackNote: undefined });
    console.log('proc', out, [...h.db.auditEvent.iter()].map(e => [e.action, e.actorRole, e.detail]));
    expect(out.ok).toBe(false);
  });
});
