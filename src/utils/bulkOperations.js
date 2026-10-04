// Keep successful IDs and failures separately: Promise.all cannot describe partial commits.
export async function processRecords(records, execute, onProgress) {
  const succeeded = [], failed = [];
  for (const record of records) {
    try { succeeded.push({ record, value: await execute(record) }); }
    catch (error) { failed.push({ record, error }); }
    onProgress?.({ completed: succeeded.length + failed.length, total: records.length, succeeded: succeeded.length, failed: failed.length });
  }
  return { succeeded, failed };
}
