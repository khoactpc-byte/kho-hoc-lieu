// A completed request may update only the identity/view that started it.
export function createAsyncScope() {
  let scope;
  let generation = 0;
  const pending = new Map();
  const invalidate = () => { generation += 1; pending.clear(); };
  const isCurrent = ticket => Boolean(ticket && ticket.generation === generation && pending.get(ticket.kind) === ticket);
  return {
    invalidate,
    setScope(nextScope) {
      if (nextScope !== scope) { scope = nextScope; invalidate(); }
    },
    begin(kind) {
      if (pending.has(kind)) return null;
      const ticket = { kind, generation };
      pending.set(kind, ticket);
      return ticket;
    },
    isCurrent,
    finish(ticket) {
      const current = isCurrent(ticket);
      if (current) pending.delete(ticket.kind);
      return current;
    }
  };
}
