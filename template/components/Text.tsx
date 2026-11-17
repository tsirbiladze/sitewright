import { Fragment, type ReactNode } from 'react';
import { withLari } from './Lari';

/**
 * A text from the content, ready for a page: every `[[…]]` in it is drawn as the dashed placeholder
 * (a fact the person has not given yet), and ₾ is set in a face that has it.
 */
export function rich(text: string): ReactNode {
  const parts = text.split(/(\[\[[^\]]+\]\])/);
  if (parts.length === 1) return withLari(text);
  return parts.map((part, i) => (i % 2 ? <span className="ph" key={i}>{part}</span> : <Fragment key={i}>{withLari(part)}</Fragment>));
}

/** Whether a whole value is a placeholder: `[[LinkedIn URL]]`. */
export const isPlaceholder = (value: string) => /^\[\[[^\]]+\]\]$/.test(value.trim());

/** A text with `{name}` slots filled by elements: fillNodes('{project} marked it', { project: <a/> }). */
export function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = part.match(/^\{(\w+)\}$/)?.[1];
    return <Fragment key={i}>{key && key in values ? values[key] : rich(part)}</Fragment>;
  });
}
