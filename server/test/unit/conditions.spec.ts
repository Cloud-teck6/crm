import { evaluateRule, evaluateConditions, resolveField } from '../../src/common/rules/conditions';

describe('rules engine', () => {
  const lead = { campaign: 'CampaignX', status: 'NEW', tags: ['hot'], customFields: { budget: 200000 } };

  it('resolves fields including the customFields fallback and dot paths', () => {
    expect(resolveField(lead, 'campaign')).toBe('CampaignX');
    expect(resolveField(lead, 'budget')).toBe(200000); // falls back into customFields
    expect(resolveField(lead, 'customFields.budget')).toBe(200000);
    expect(resolveField(lead, 'missing')).toBeUndefined();
  });

  it('evaluates comparison operators', () => {
    expect(evaluateRule({ field: 'budget', op: 'gt', value: 50000 }, lead)).toBe(true);
    expect(evaluateRule({ field: 'budget', op: 'lt', value: 50000 }, lead)).toBe(false);
    expect(evaluateRule({ field: 'campaign', op: 'eq', value: 'CampaignX' }, lead)).toBe(true);
    expect(evaluateRule({ field: 'campaign', op: 'ne', value: 'Other' }, lead)).toBe(true);
    expect(evaluateRule({ field: 'tags', op: 'contains', value: 'hot' }, lead)).toBe(true);
    expect(evaluateRule({ field: 'status', op: 'in', value: ['NEW', 'CONTACTED'] }, lead)).toBe(true);
    expect(evaluateRule({ field: 'email', op: 'not_exists' }, lead)).toBe(true);
  });

  it('combines rules with AND / OR', () => {
    const and = { match: 'AND' as const, rules: [{ field: 'campaign', op: 'eq' as const, value: 'CampaignX' }, { field: 'budget', op: 'gt' as const, value: 50000 }] };
    expect(evaluateConditions(and, lead)).toBe(true);

    const andFail = { match: 'AND' as const, rules: [{ field: 'campaign', op: 'eq' as const, value: 'CampaignX' }, { field: 'budget', op: 'gt' as const, value: 500000 }] };
    expect(evaluateConditions(andFail, lead)).toBe(false);

    const or = { match: 'OR' as const, rules: [{ field: 'campaign', op: 'eq' as const, value: 'Nope' }, { field: 'budget', op: 'gt' as const, value: 50000 }] };
    expect(evaluateConditions(or, lead)).toBe(true);
  });

  it('treats an empty condition group as a match', () => {
    expect(evaluateConditions(undefined, lead)).toBe(true);
    expect(evaluateConditions({ rules: [] }, lead)).toBe(true);
  });
});
