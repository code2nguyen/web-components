/** Shape of `test-results/ai-readiness/agent.json`, written by `readiness/agent.ts` and read by the report. */
export interface AgentTaskResult {
  id: string
  requirement: string
  /** The code used one of the task's expected tags. */
  found: boolean
  /** `validate_markup` found no error in the code. */
  valid: boolean
  /** Found, valid, and uses every attribute or slot the task requires. */
  correct: boolean
  /** MCP tools the agent called, in order. */
  tools: string[]
  tags: string[]
  notes: string[]
  costUsd?: number
}

export interface AgentReport {
  date: string
  model?: string
  /** 0–100: found 40%, valid 30%, correct 30%, averaged over tasks. */
  score: number
  passed: number
  tasks: AgentTaskResult[]
}
