// Two-sentence explanations. A template always exists; with ANTHROPIC_API_KEY the prose comes from
// claude-haiku-4-5 and is thrown away if it contains any digit sequence absent from the evidence (G13).
import { centsToDollars, type Brief } from './brief.js';
import { STAND_IN_PREFIX } from './replay.js';
import type { Finding } from './finding.js';

export const EXPLAIN_MODEL = 'claude-haiku-4-5';

export function digitSequences(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? []);
}

// True when every digit run in `text` also appears somewhere in the evidence JSON.
export function digitsAreGrounded(text: string, evidenceJson: string): boolean {
  const allowed = digitSequences(evidenceJson);
  for (const d of digitSequences(text)) if (!allowed.has(d)) return false;
  return true;
}

export function templateExplanation(brief: Brief): string {
  const ev = brief.evidence;
  const amount = centsToDollars(brief.cents);
  switch (brief.code) {
    case 'location_mismatch':
      if (ev.nearestPing && ev.distanceMiles !== undefined) {
        return `Card ${ev.cardId ?? ''} assigned to truck ${ev.truckId ?? '?'} bought ${ev.gallons ?? '?'} gallons at ${ev.stationName ?? 'a station'} while the truck's nearest ping was ${ev.distanceMiles} miles away, above the ${ev.thresholdMiles ?? '?'} mile threshold. The hold stays until dispatch says whether another unit or driver used the card.`;
      }
      return `Card ${ev.cardId ?? ''} assigned to truck ${ev.truckId ?? '?'} was used at ${ev.stationName ?? 'a station'} with no telematics ping for that truck nearby. The hold stays until dispatch says whether another unit or driver used the card.`;
    case 'capacity_exceeded':
      return `The ticket shows ${ev.gallons ?? '?'} gallons on truck ${ev.truckId ?? '?'}, whose tank holds ${ev.tankGal ?? '?'} gallons (limit ${ev.capacityLimitGal ?? '?'}). No rule may clear a fill above tank capacity, so the ${amount} stays held.`;
    case 'rate_variance':
      return `The invoice unit price differs from the contracted rate for vendor ${ev.vendorId ?? '?'} by more than the allowed variance. The ${amount} stays held until someone shows where the higher price was agreed.`;
    case 'duplicate_invoice':
      return `This invoice from vendor ${ev.vendorId ?? '?'} looks like an earlier one for the same item and amount within the duplicate window. The ${amount} stays held until the real purchase order is named.`;
    case 'vendor_bank_change':
      return `Vendor ${ev.vendorId ?? '?'} changed bank details shortly before this ${amount} invoice. Payment waits for a call-back to a known number recorded by the controller.`;
    case 'short_received':
      return `The invoice bills more than the receiving record shows for vendor ${ev.vendorId ?? '?'}. The ${amount} stays held until the controller chooses to pay the received quantity or wait for the rest.`;
    default:
      return `The kernel raised ${brief.code} on ${brief.kind} ${brief.txnRef} for ${amount}. The hold stays until a person decides.`;
  }
}

export interface Explanation {
  text: string;
  source: 'template' | 'model';
}

export interface ExplainDeps {
  apiKey?: string;
  // injectable for tests; defaults to the Anthropic SDK
  ask?: (prompt: string) => Promise<string>;
  log?: (msg: string) => void;
}

async function askHaiku(apiKey: string, prompt: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create(
    {
      model: EXPLAIN_MODEL,
      max_tokens: 300,
      system: 'You write exactly two plain sentences for an accounts-payable reviewer. Use only numbers that appear in the evidence JSON you are given. No bullet points, no headings, no em dashes.',
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout: 15_000 },
  );
  return res.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map(b => b.text)
    .join(' ')
    .trim();
}

// Explain from evidence. Model prose is accepted only when every digit run in it is in the evidence JSON.
export async function explain(brief: Brief, deps: ExplainDeps = {}): Promise<Explanation> {
  const template = templateExplanation(brief);
  const apiKey = deps.apiKey ?? '';
  if (!apiKey && !deps.ask) return { text: template, source: 'template' };
  const evidenceJson = JSON.stringify({ txnRef: brief.txnRef, code: brief.code, cents: brief.cents, day: brief.day, date: brief.date, evidence: brief.evidence });
  const prompt = `Kernel code: ${brief.code}. Evidence JSON: ${evidenceJson}\nWrite two sentences explaining the exception and why the payment is held.`;
  try {
    const ask = deps.ask ?? ((p: string) => askHaiku(apiKey, p));
    const text = (await ask(prompt)).replace(/\s+/g, ' ').trim();
    if (!text || text.length > 900) throw new Error('model text empty or too long');
    if (!digitsAreGrounded(text, evidenceJson)) {
      deps.log?.(`explanation for ${brief.txnRef} rejected: digits not in evidence`);
      return { text: template, source: 'template' };
    }
    return { text, source: 'model' };
  } catch (err) {
    deps.log?.(`explanation for ${brief.txnRef} fell back to template: ${(err as Error).message}`);
    return { text: template, source: 'template' };
  }
}

// Stand-in findings carry the explanation sentence; the label stays in front of it.
export function withExplanation(finding: Finding, explanation: Explanation): Finding {
  if (finding.status !== 'no_fixture') return finding;
  const text = `${STAND_IN_PREFIX} ${explanation.text}`.slice(0, 1000);
  return { ...finding, finding: text };
}
