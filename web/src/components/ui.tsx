import type { ReactNode } from 'react';

export function Panel({
  title,
  aside,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-md border border-edge bg-panel ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-edge px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
        {aside ? <div className="flex items-center gap-2 text-[11px] text-muted">{aside}</div> : null}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export type Tone = 'neutral' | 'hold' | 'release' | 'refused' | 'candidate';

const toneClass: Record<Tone, string> = {
  neutral: 'border-edge-2 text-muted',
  hold: 'border-hold/50 bg-hold-dim text-hold',
  release: 'border-release/50 bg-release-dim text-release',
  refused: 'border-refused/50 bg-refused-dim text-refused',
  candidate: 'border-candidate/50 bg-candidate-dim text-candidate',
};

export function Pill({ tone = 'neutral', title, children, dot }: { tone?: Tone; title?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-[1px] text-[10.5px] font-medium uppercase tracking-wider ${toneClass[tone]}`}
    >
      {dot ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Wraps a figure with its source row id (guardrail G17). */
export function Src({ id, children, className = '', mono = true }: { id: string; children: ReactNode; className?: string; mono?: boolean }) {
  return (
    <span className={`src ${mono ? 'num' : ''} ${className}`} title={id} aria-label={`${id}`}>
      {children}
    </span>
  );
}

export function Empty({ children, grow = true }: { children: ReactNode; grow?: boolean }) {
  return (
    <div className={`flex ${grow ? 'h-full' : ''} min-h-[72px] items-center justify-center px-4 py-6 text-center text-[12px] text-faint`}>{children}</div>
  );
}

export function Kv({ k, v, title }: { k: string; v: ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-edge/60 py-1 last:border-0">
      <span className="text-[11px] text-muted">{k}</span>
      <span className="num text-right text-[12px] text-text" title={title}>
        {v}
      </span>
    </div>
  );
}

export function JsonBlock({ value, label, defaultOpen = false }: { value: unknown; label: string; defaultOpen?: boolean }) {
  let text: string;
  if (typeof value === 'string') {
    try {
      text = JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      text = value;
    }
  } else {
    try {
      text = JSON.stringify(value, null, 2) ?? '';
    } catch {
      text = String(value);
    }
  }
  return (
    <details open={defaultOpen} className="group">
      <summary className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-text">
        <span className="inline-block w-3 text-faint group-open:rotate-90">&#9656;</span>
        {label}
      </summary>
      <pre className="scroll mt-1 max-h-56 overflow-auto rounded-sm border border-edge bg-bg px-2 py-1.5 font-mono text-[11px] leading-snug text-muted">
        {text}
      </pre>
    </details>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case 'released':
    case 'cleared_by_rule':
    case 'approved':
    case 'investigated':
      return 'release';
    case 'rejected':
    case 'timeout':
    case 'expired':
      return 'refused';
    case 'candidate':
    case 'claimed':
      return 'candidate';
    case 'open':
    case 'awaiting_controller':
    case 'answered':
      return 'hold';
    default:
      return 'neutral';
  }
}
