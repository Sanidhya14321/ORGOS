#!/usr/bin/env node
import { hierarchicalAgent } from '../packages/agent-core/dist/index.js';

async function main() {
  console.log('Running local hierarchicalAgent smoke test');

  const input = {
    task: {
      id: 'smoke-1',
      goal_id: 'goal-smoke-1',
      title: 'Increase customer onboarding completion',
      description: 'Improve onboarding completion rate by 10% this quarter',
      depth: 0,
      success_criteria: '10% increase in completion',
      is_agent_task: true,
      status: 'pending'
    },
    current_position: {
      id: 'position:ceo',
      name: 'CEO',
      level: 100,
      power_level: 100,
      max_task_depth: 10,
      can_create_goals: true
    },
    org_chart: [],
    org_structure: 'hierarchical',
    team_capacity: {}
  };

  try {
    const out = await hierarchicalAgent(input);
    console.log('hierarchicalAgent output:');
    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error('hierarchicalAgent failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
