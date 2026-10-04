import { randomUUID } from 'node:crypto';

// Audit pages commit with the score changes, without exceeding one Firestore document.
export function writeScoreAudit(tx, { store, appId, actor, bookId, scope, before, after, keys, createdAt, reason }) {
  if (!keys.length) return;
  const auditId = randomUUID(); let rows = [], bytes = 0, page = 0;
  const flush = () => {
    if (!rows.length) return;
    tx.create(store.doc(`artifacts/${appId}/server_score_audit/${auditId}--${page++}`), { auditId, bookId, actorId: actor.uid,
      role: actor.role, schoolYear: scope.schoolYear, schoolCode: scope.schoolCode, grade: String(scope.grade), createdAt, reason, changes: rows });
    rows = []; bytes = 0;
  };
  for (const key of keys) {
    const row = { key, before: before.edits?.[key] ?? null, after: after.edits?.[key] ?? null,
      beforeSource: before.scoreSources?.[key] ?? null, afterSource: after.scoreSources?.[key] ?? null };
    const cost = Buffer.byteLength(JSON.stringify(row));
    if (rows.length && (bytes + cost > 300000 || rows.length >= 500)) flush();
    rows.push(row); bytes += cost;
  }
  flush();
}
