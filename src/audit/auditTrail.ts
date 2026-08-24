import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AuditEntry, MoneyActionType, MoneyActionStatus } from '../types.js';
import { config } from '../config.js';

/**
 * AuditTrail — append-only ledger of every money action in a session.
 *
 * Explainability is a core part of the track's bar ("Every money action
 * explainable, bounded and gated. Show the audit trail."). Each entry carries
 * the agent's reasoning, the guard checks applied, the amounts, and who acted —
 * so a reviewer can replay exactly why a charge happened.
 */
export class AuditTrail {
  readonly traceId: string;
  private entries: AuditEntry[] = [];
  private seq = 0;
  private filePath: string;

  constructor(traceId: string = randomUUID()) {
    this.traceId = traceId;
    this.filePath = path.join(config.auditDir, `${traceId}.jsonl`);
  }

  append(
    actor: AuditEntry['actor'],
    type: MoneyActionType,
    status: MoneyActionStatus,
    fields: Partial<AuditEntry> = {},
  ): AuditEntry {
    const entry: AuditEntry = {
      seq: ++this.seq,
      traceId: this.traceId,
      ts: new Date().toISOString(),
      actor,
      type,
      status,
      reasoning: fields.reasoning ?? '',
      ...fields,
    };
    this.entries.push(entry);
    // Best-effort durability: append immediately to the JSONL file.
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // Audit is best-effort; never crash the demo because disk is unwritable.
    }
    return entry;
  }

  all(): AuditEntry[] {
    return this.entries;
  }

  count(): number {
    return this.entries.length;
  }

  /** Snapshot of the trail for the UI / for download. */
  export(): { traceId: string; entries: AuditEntry[] } {
    return { traceId: this.traceId, entries: this.entries };
  }
}
