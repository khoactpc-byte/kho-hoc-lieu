const getSchoolYearStart = (schoolYear = '') => {
  const year = String(schoolYear || '').match(/\d{4}/)?.[0];
  return year ? Number(year) : Number.MAX_SAFE_INTEGER;
};

export const findDropoutContinuation = (records = []) => {
  const yearlyRecords = (Array.isArray(records) ? records : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => getSchoolYearStart(a.schoolYear) - getSchoolYearStart(b.schoolYear));

  for (let index = 0; index < yearlyRecords.length - 1; index += 1) {
    const droppedRecord = yearlyRecords[index];
    if (droppedRecord.status !== 'dropped') continue;

    const continuedRecord = yearlyRecords.slice(index + 1).find(record => record.status !== 'dropped');
    if (!continuedRecord) continue;

    return {
      droppedSchoolYear: droppedRecord.schoolYear || '',
      continuedSchoolYear: continuedRecord.schoolYear || '',
      className: continuedRecord.className || ''
    };
  }

  return null;
};
