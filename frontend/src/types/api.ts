/**
 * types/api.ts — Interfaces TypeScript que espelham os schemas do backend
 *
 * TypeScript usa interfaces para garantir que os dados da API
 * tenham a forma correta em tempo de compilação.
 * Se o backend mudar um campo, o TypeScript avisa onde o frontend precisa ser atualizado.
 */

export interface User {
  id: string
  email: string
  username: string
  is_active: boolean
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: User
}

// ── Programs ──────────────────────────────────────────────────────────────────

export type ProgramStatus = 'active' | 'paused' | 'closed'

export interface Program {
  id: string
  name: string
  platform: string
  url: string | null
  status: ProgramStatus
  scope_notes: string | null
  max_bounty: number | null
  tags: string[]
  created_at: string
}

// ── Targets ───────────────────────────────────────────────────────────────────

export interface Target {
  id: string
  program_id: string | null
  value: string
  type: 'domain' | 'wildcard' | 'ip_range' | 'mobile_app'
  is_in_scope: boolean
  notes: string | null
  last_recon_at: string | null
  created_at: string
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export type JobType = 'recon' | 'dir_fuzz' | 'param_fuzz' | 'sub_fuzz' | 'idor' | 'port_scan' | 'dns_recon'
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Job {
  id: string
  program_id: string | null
  target_id: string | null
  type: JobType
  status: JobStatus
  config: Record<string, unknown>
  result_summary: Record<string, number> | null
  logs: string[]
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface JobCreate {
  program_id?: string
  target_id?: string
  type: JobType
  config: Record<string, unknown>
}

// ── Findings ──────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational'
export type FindingStatus = 'new' | 'triaging' | 'accepted' | 'resolved' | 'duplicate' | 'not_applicable'
export type FindingType = 'idor' | 'xss' | 'sqli' | 'ssrf' | 'lfi' | 'open_redirect' | 'info_disclosure' | 'other'

export interface Finding {
  id: string
  program_id: string | null
  target_id: string | null
  job_id: string | null
  title: string
  type: FindingType
  severity: Severity
  status: FindingStatus
  cvss_score: number | null
  description: string
  steps_to_reproduce: string
  impact: string
  affected_url: string
  parameter: string | null
  payload: string | null
  bounty_amount: number | null
  created_at: string
  updated_at: string
}

export interface FindingCreate {
  program_id?: string
  target_id?: string
  title: string
  type: FindingType
  severity: Severity
  description?: string
  steps_to_reproduce?: string
  impact?: string
  affected_url: string
  parameter?: string
  payload?: string
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface Report {
  id: string
  finding_id: string
  content_markdown: string | null
  model_used: string
  version: number
  is_ready: boolean
  created_at: string
}
