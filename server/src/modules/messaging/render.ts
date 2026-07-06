// {{variable}} merge rendering for message/email templates.

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function extractVariables(body: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(body)) !== null) set.add(m[1]);
  return Array.from(set);
}

/** Replace {{var}} with context values; unknown vars render as empty string. */
export function renderTemplate(body: string, context: Record<string, unknown>): string {
  return body.replace(VAR_RE, (_full, key: string) => {
    const v = context[key];
    return v === undefined || v === null ? '' : String(v);
  });
}
