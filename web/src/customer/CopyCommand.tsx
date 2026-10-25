import { useEffect, useRef, useState } from 'react';

// Puts the exact ASI:One command on the clipboard. Falls back to a hidden textarea and execCommand
// where the async clipboard is unavailable (plain http on a LAN address, older browsers).
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyCommand({ command, label }: { command: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onClick = async () => {
    const ok = await copyText(command);
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1800);
  };
  return (
    <button type="button" className="cv-copy" onClick={onClick} title={`Copies "${command}" so you can paste it in ASI:One`}>
      <span className="cv-copy-cmd">{command.trim()}</span>
      <span className="cv-copy-state" aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : label ?? 'Copy'}
      </span>
    </button>
  );
}
