import { vi, describe, it, expect } from 'vitest';

// Mock the callLLM router so tests don't call external providers
vi.mock('../src/llm/router', () => ({
  callLLM: async () => `{
    "action": "execute",
    "execution_plan": "Do X, then Y",
    "success_criteria_check": "Metric > 10%",
    "evidence_required": ["logs"],
    "reasoning": "Straightforward execution"
  }`
}));

import { hierarchicalAgent } from '../src/agents/hierarchical-agent';

describe('hierarchicalAgent (mocked LLM)', () => {
  it('returns an execute decision when LLM responds with execute JSON', async () => {
    const input = {
      task: {
        id: 't1',
        goal_id: 'g1',
        title: 'Test task',
        description: 'Test',
        depth: 0,
        success_criteria: 'done',
        is_agent_task: true,
        status: 'pending'
      },
      deadline: new Date().toISOString(),
      current_position: {
        id: 'pos:ceo',
        org_id: 'org:1',
        name: 'CEO',
        slug: 'ceo',
        level: 0,
        power_level: 100,
        can_create_goals: true,
        can_create_tasks: true,
        can_assign_positions: true,
        can_approve_work: true,
        can_delegate: true,
        can_view_org_structure: true,
        max_direct_reports: 10,
        max_task_depth: 10
      },
      org_chart: [],
      org_structure: 'hierarchical',
      team_capacity: {}
    } as any;

    const out = await hierarchicalAgent(input);
    expect(out.action).toBe('execute');
    if (out.action === 'execute') {
      expect(out.execution_plan).toContain('Do X');
    }
  });
});
