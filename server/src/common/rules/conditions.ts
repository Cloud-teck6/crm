// Condition evaluator shared by lead scoring, assignment rules, and workflows.

export type Operator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts_with'
  | 'in'
  | 'exists'
  | 'not_exists'
  | 'is_empty';

export interface Rule {
  field: string;
  op: Operator;
  value?: unknown;
}

export interface ConditionGroup {
  match?: 'AND' | 'OR';
  rules?: Rule[];
}

/** Resolve a field path from a record, falling back into customFields. */
export function resolveField(record: any, field: string): unknown {
  if (record == null) return undefined;
  if (field in record) return record[field];
  const cf = record.customFields;
  if (cf && typeof cf === 'object' && field in cf) return cf[field];
  // dot path (e.g. customFields.budget, account.name)
  return field.split('.').reduce((acc: any, key) => (acc == null ? undefined : acc[key]), record);
}

function asNumber(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

export function evaluateRule(rule: Rule, record: any): boolean {
  const actual = resolveField(record, rule.field);
  const expected = rule.value;

  switch (rule.op) {
    case 'exists':
      return actual !== undefined && actual !== null && actual !== '';
    case 'not_exists':
      return actual === undefined || actual === null || actual === '';
    case 'is_empty':
      return actual === undefined || actual === null || actual === '' || (Array.isArray(actual) && actual.length === 0);
    case 'eq':
      return String(actual) === String(expected);
    case 'ne':
      return String(actual) !== String(expected);
    case 'gt':
      return asNumber(actual) > asNumber(expected);
    case 'gte':
      return asNumber(actual) >= asNumber(expected);
    case 'lt':
      return asNumber(actual) < asNumber(expected);
    case 'lte':
      return asNumber(actual) <= asNumber(expected);
    case 'contains':
      if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'starts_with':
      return String(actual ?? '').toLowerCase().startsWith(String(expected ?? '').toLowerCase());
    case 'in': {
      const list = Array.isArray(expected) ? expected : String(expected ?? '').split(',').map((s) => s.trim());
      return list.map(String).includes(String(actual));
    }
    default:
      return false;
  }
}

/** Evaluate a group of rules. An empty group matches everything. */
export function evaluateConditions(group: ConditionGroup | null | undefined, record: any): boolean {
  if (!group || !group.rules || group.rules.length === 0) return true;
  const results = group.rules.map((r) => evaluateRule(r, record));
  return group.match === 'OR' ? results.some(Boolean) : results.every(Boolean);
}
