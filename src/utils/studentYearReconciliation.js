import { SCOREBOOK_SOURCE_FILE } from '../config/scorebookDomain.js';
import { resolveScorebookDocument } from './scorebookArchive.js';
import { scorebookYearSummary } from './studentAcademicResults.js';
import { linkedProfileRecords, profileSchoolYear } from './studentProfileHistory.js';
import { getSchoolGrade, getStudentSchoolCode, normalizeSchoolClassName, promoteSchoolClassName } from './schoolClasses.js';

const text = value => String(value ?? '').trim();
const savedClass = value => normalizeSchoolClassName(typeof value === 'object' ? value?.className : value);
const validClass = value => /^[1-9][A-Z][A-Z0-9-]*$/.test(value);

export function academicPromotionOutcome(value) {
  const key = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
  if (['chua dat', 'chua hoan thanh', 'khong dat', 'yeu', 'kem', 'o lai'].includes(key)) return 'repeat';
  if (['tot', 'kha', 'dat', 'hoan thanh', 'hoan thanh tot', 'len lop'].includes(key)) return 'promote';
  return '';
}

// Entry class/year describe admission. Current class is a separate yearly decision.
// A profile import cannot silently replace that decision, including a real repeat.
export function sheetClassConflict(student, sheetStudent, hasCurrentClass = true) {
  return Boolean(hasCurrentClass && text(sheetStudent.className)
    && savedClass(student.className) !== savedClass(sheetStudent.className));
}

export function buildStudentYearReconciliation({ records = [], scorebooks = [], targetSchoolYear = '' } = {}) {
  const targetYear = profileSchoolYear(targetSchoolYear);
  if (!targetYear) return [];
  const start = Number(targetYear.slice(0, 4)) - 1;
  const sourceYear = `${start}-${start + 1}`;
  return records.filter(student => profileSchoolYear(student.schoolYear) === targetYear).map(student => {
    const item = { student, sourceYear, targetYear, currentClass: savedClass(student.className), sourceClass: '',
      savedTargetClass: '', proposedClass: '', academicResult: '', completedCount: 0, requiredCount: 6,
      action: 'blocked', reason: '', sourceStudent: null, scorebook: null };
    const block = reason => ({ ...item, reason });
    if (student.status === 'dropped' || student.status === 'completed') return block('Đã nghỉ/hoàn thành; giữ nguyên hồ sơ.');
    const entryYear = profileSchoolYear(student.enrollmentYear);
    if (!entryYear) return block('Thiếu năm nhập học, cần đối chiếu hồ sơ gốc.');
    if (entryYear > targetYear) return block('Năm nhập học sau năm đang xem.');
    if (entryYear === targetYear) return { ...item, action: 'unchanged', reason: 'Học sinh mới nhập học năm này.' };
    const campus = getStudentSchoolCode(student);
    if (campus === 'UNKNOWN') return block('Chưa xác định cơ sở.');
    const sources = linkedProfileRecords(student, records).filter(record => profileSchoolYear(record.schoolYear) === sourceYear
      && getStudentSchoolCode(record) === campus);
    if (sources.length > 1) return block('Có nhiều hồ sơ năm trước; cần đối chiếu định danh.');
    const promotion = student.promotion || {};
    const hasDecision = profileSchoolYear(promotion.sourceSchoolYear) === sourceYear
      && profileSchoolYear(promotion.targetSchoolYear) === targetYear && ['promote', 'repeat'].includes(promotion.outcome);
    item.sourceStudent = sources[0] || null;
    item.sourceClass = savedClass(sources[0]?.className || (hasDecision ? promotion.sourceClassName : '') || student.classHistory?.[sourceYear]);
    // Legacy records sometimes have just "6"; a saved decision supplies its original suffix.
    if (!validClass(item.sourceClass) && hasDecision && getSchoolGrade(item.sourceClass) === getSchoolGrade(promotion.sourceClassName)) {
      item.sourceClass = savedClass(promotion.sourceClassName);
    }
    if (!validClass(item.sourceClass)) return block('Thiếu lớp năm trước đầy đủ (ví dụ 6A).');
    if (sources[0]?.status === 'dropped' || sources[0]?.status === 'completed') return block('Hồ sơ năm trước đã nghỉ/hoàn thành; cần admin đối chiếu.');
    const grade = getSchoolGrade(item.sourceClass);
    if (Number(grade) < 6) return block('Kết quả tiểu học cần xét theo sổ đánh giá tiểu học.');
    const resolution = resolveScorebookDocument(scorebooks, { schoolYear: sourceYear, schoolCode: campus, grade, sourceFile: SCOREBOOK_SOURCE_FILE });
    if (resolution.needsSelection) return block('Có nhiều phiên bản sổ điểm năm trước; cần chọn sổ chính.');
    item.scorebook = resolution.document || null;
    const summary = scorebookYearSummary(item.scorebook?.edits || {}, { ...(sources[0] || student), className: item.sourceClass, schoolYear: sourceYear });
    item.completedCount = summary.completedCount;
    item.requiredCount = summary.requiredCount;
    item.academicResult = summary.complete ? summary.result : hasDecision ? text(promotion.academicResult) : '';
    const outcome = summary.complete ? academicPromotionOutcome(summary.result) : '';
    const historyTarget = savedClass(student.classHistory?.[targetYear]);
    const decisionTarget = hasDecision ? savedClass(promotion.targetClassName) : '';
    if (decisionTarget && historyTarget && decisionTarget !== historyTarget) return block('Quyết định lên lớp và lịch sử lớp không khớp.');
    item.savedTargetClass = decisionTarget || historyTarget;
    if (hasDecision && savedClass(promotion.sourceClassName) !== item.sourceClass) return block('Quyết định đã lưu khác lớp năm trước.');
    if (hasDecision && decisionTarget !== (promotion.outcome === 'repeat' ? item.sourceClass : promoteSchoolClassName(item.sourceClass))) {
      return block('Lớp đích trong quyết định đã lưu không hợp lệ.');
    }
    if (hasDecision && outcome && promotion.outcome !== outcome) return block('Điểm hiện tại khác quyết định đã lưu; cần admin xét lại.');
    if (item.savedTargetClass) {
      if (!validClass(item.savedTargetClass)) return block('Lớp đã lưu thiếu ký hiệu.');
      if (!hasDecision && outcome && getSchoolGrade(item.savedTargetClass) !== getSchoolGrade(outcome === 'repeat' ? item.sourceClass : promoteSchoolClassName(item.sourceClass))) {
        return block('Lịch sử xếp lớp khác kết quả sổ điểm; cần admin xét lại.');
      }
      item.proposedClass = item.savedTargetClass;
      return { ...item, action: item.currentClass === item.savedTargetClass ? 'unchanged' : 'restore',
        reason: hasDecision ? `Quyết định ${promotion.outcome === 'repeat' ? 'lưu ban' : 'lên lớp'} đã lưu${summary.complete ? '; đã đối chiếu đủ điểm cả năm' : '; sổ điểm hiện chưa đủ dữ liệu'}.`
          : 'Khôi phục lớp đã xếp trong lịch sử năm học.' };
    }
    if (!summary.complete || !outcome) return block(`Chưa đủ điểm cả năm (${summary.completedCount}/${summary.requiredCount} môn); chưa kết luận lên lớp/lưu ban.`);
    if (!sources[0]?.id) return block('Thiếu hồ sơ năm trước để gắn kết quả sổ điểm.');
    item.proposedClass = outcome === 'repeat' ? item.sourceClass : promoteSchoolClassName(item.sourceClass);
    if (!item.proposedClass) return block('Đủ kết quả lớp 9; xét hoàn thành trong chức năng chuyển năm.');
    return { ...item, outcome, action: 'review', reason: `Đủ điểm cả năm: ${summary.result}. Admin duyệt ${outcome === 'repeat' ? 'lưu ban' : 'lên lớp'}.` };
  });
}

export function reconciledStudentRecord(item) {
  if (!['restore', 'review'].includes(item.action) || !validClass(item.proposedClass)) throw new Error('Hồ sơ chưa đủ căn cứ để sửa lớp.');
  const history = Object.fromEntries(Object.entries(item.student.classHistory || {}).filter(([year]) => {
    const key = profileSchoolYear(year);
    return key && key >= profileSchoolYear(item.student.enrollmentYear);
  }));
  return { ...item.student, className: item.proposedClass, grade: getSchoolGrade(item.proposedClass),
    classHistory: { ...history, [item.sourceYear]: item.sourceClass, [item.targetYear]: item.proposedClass },
    ...(item.action === 'review' ? { promotion: { sourceSchoolYear: item.sourceYear, targetSchoolYear: item.targetYear,
      sourceClassName: item.sourceClass, targetClassName: item.proposedClass, academicResult: item.academicResult,
      outcome: item.outcome, source: 'so_diem', processedAt: Date.now() } } : {}) };
}

// Recovery uses a prior roster, not a new promotion calculation. Requiring the
// observed class as well as the saved class prevents applying a stale repair.
export function restoreClassesFromPriorRoster(rows, records, input) {
  const entries = text(input).split(/\r?\n/).filter(line => line.trim()).map(line => line.trim().split(/[\t,;]+/).map(text));
  if (!entries.length || entries.some(parts => parts.length !== 3)) throw new Error('Mỗi dòng cần: mã học sinh, lớp đang sai, lớp đã lưu trước cập nhật.');
  const seen = new Set();
  const repairs = new Map();
  for (const [accessCode, observed, restored] of entries) {
    const key = accessCode.toUpperCase();
    if (seen.has(key)) throw new Error(`Mã ${key} bị lặp trong bản đối chiếu.`);
    seen.add(key);
    const matches = rows.filter(row => text(row.student.accessCode).toUpperCase() === key);
    if (matches.length !== 1) throw new Error(`Mã ${key} chưa khớp duy nhất với năm đang xem.`);
    const row = matches[0];
    const expectedClass = savedClass(observed), targetClass = savedClass(restored);
    if (!validClass(expectedClass) || !validClass(targetClass)) throw new Error(`Mã ${key}: tên lớp không hợp lệ.`);
    if (row.currentClass !== expectedClass) throw new Error(`Mã ${key}: lớp hiện tại đã thay đổi, cần đối chiếu lại.`);
    if (row.savedTargetClass && row.savedTargetClass !== targetClass) throw new Error(`Mã ${key}: lớp trong bản đối chiếu khác lịch sử/quyết định đã lưu.`);
    const sources = linkedProfileRecords(row.student, records).filter(record => profileSchoolYear(record.schoolYear) === row.sourceYear
      && getStudentSchoolCode(record) === getStudentSchoolCode(row.student));
    const sourceClass = row.sourceClass || (sources.length === 1 ? savedClass(sources[0].className) : '');
    if (!validClass(sourceClass) || ![getSchoolGrade(sourceClass), String(Number(getSchoolGrade(sourceClass)) + 1)].includes(getSchoolGrade(targetClass))) {
      throw new Error(`Mã ${key}: lớp trước cập nhật chưa khớp lịch sử năm trước.`);
    }
    repairs.set(row.student.id, { ...row, sourceClass, proposedClass: targetClass, action: 'restore',
      reason: `Khôi phục từ bản danh sách trước cập nhật: ${expectedClass} → ${targetClass}.` });
  }
  return rows.map(row => repairs.get(row.student.id) || row);
}
