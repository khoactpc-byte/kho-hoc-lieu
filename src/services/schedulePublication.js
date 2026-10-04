import { collection, doc, getDocFromServer, getDocsFromServer, query, runTransaction, where } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { scheduleScopeKey } from '../utils/scheduleScope';
import { stableRecordId } from '../utils/idempotency';
import { sameData as same } from '../utils/dataEquality';

const dataCollection = name => collection(db, 'artifacts', appId, 'public', 'data', name);
const refFor = (name, id) => doc(dataCollection(name), id);
const withoutId = value => value && Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id'));

export async function saveSchedulePublication(id, payload, newsPayload, expectedSchedule) {
  if (payload.status === 'published' && !newsPayload) throw new Error('Thiếu bản tin cho thời khóa biểu công bố.');
  const targetRef = refFor('class_schedules', id);
  const pointerRef = refFor('schedule_publications', scheduleScopeKey(payload));
  const previousPointer = (await getDocFromServer(pointerRef)).data();
  const schedules = payload.status === 'published' ? (await getDocsFromServer(dataCollection('class_schedules'))).docs : [];
  const retired = schedules.filter(item => item.id !== id && item.data().status === 'published' &&
    scheduleScopeKey(item.data(), payload.schoolYear) === scheduleScopeKey(payload));
  const retiredIds = new Set(retired.map(item => item.id));
  const linkedNews = payload.status === 'published'
    ? (await getDocsFromServer(query(dataCollection('news'), where('type', '==', 'class_schedule')))).docs
      .filter(item => item.data().scheduleId === id || retiredIds.has(item.data().scheduleId)) : [];
  const previousNewsLinks = new Map(linkedNews.map(item => [item.id, item.data().scheduleId]));
  const canonicalNewsRef = refFor('news', stableRecordId('schedule-news', id));
  if (retired.length + linkedNews.length > 350) throw new Error('Có quá nhiều bản thời khóa biểu cũ cần đối soát. Chưa công bố bản mới.');
  await runTransaction(db, async transaction => {
    const target = await transaction.get(targetRef);
    const pointer = await transaction.get(pointerRef);
    const oldSchedules = await Promise.all(retired.map(item => transaction.get(item.ref)));
    const oldNews = await Promise.all(linkedNews.map(item => transaction.get(item.ref)));
    const canonical = newsPayload ? await transaction.get(canonicalNewsRef) : null;
    if (!same(withoutId(target.data()), withoutId(expectedSchedule))) throw new Error('Bản thời khóa biểu vừa được sửa hoặc lượt lưu trước đã hoàn tất. Bản nháp được giữ; hãy đối chiếu trước khi lưu.');
    if (target.data() && scheduleScopeKey(target.data(), payload.schoolYear) !== scheduleScopeKey(payload)) throw new Error('Hãy lưu thành bản mới khi đổi năm học, cơ sở hoặc học kỳ.');
    if (payload.status !== 'published' && pointer.data()?.activeScheduleId === id) throw new Error('Bản này đang được công bố; cần lưu cùng bản tin thời khóa biểu.');
    if (payload.status === 'published' && !same(pointer.data(), previousPointer)) throw new Error('Một bản thời khóa biểu khác vừa được công bố. Hãy kiểm tra rồi thử lại.');
    oldSchedules.forEach((item, index) => {
      if (!same(item.data(), retired[index].data())) throw new Error('Thời khóa biểu cũ vừa thay đổi. Chưa hạ bản đang công bố.');
    });
    if (canonical?.data() && (canonical.data().type !== 'class_schedule' || canonical.data().scheduleId !== id)) throw new Error('Bản tin đích có nội dung khác; cần đối soát.');
    const aliases = oldNews.filter(item => item.data()?.scheduleId === id);
    const oldOwnNews = canonical?.data() || aliases.find(item => item.data()?.pinSource === 'manual')?.data() || aliases[0]?.data() || {};
    transaction.set(targetRef, payload, { merge: true });
    if (payload.status === 'published') {
      oldSchedules.forEach(item => transaction.set(item.ref, { status: 'draft', publishedAt: null, updatedAt: payload.updatedAt }, { merge: true }));
      oldNews.forEach(item => {
        const data = item.data();
        if (!data) return;
        if (data.type !== 'class_schedule' || previousNewsLinks.get(item.id) !== data.scheduleId) {
          throw new Error('Bản tin liên quan vừa được đổi. Chưa công bố.');
        }
        if (data.scheduleId === id && item.ref.path !== canonicalNewsRef.path) transaction.delete(item.ref);
        else if (data.scheduleId !== id) transaction.set(item.ref, { isHidden: true, isScheduleActive: false, updatedAt: payload.updatedAt }, { merge: true });
      });
      transaction.set(pointerRef, { activeScheduleId: id, schoolYear: payload.schoolYear, schoolCode: payload.schoolCode,
        semester: payload.semester, revision: Number(pointer.data()?.revision || 0) + 1, updatedAt: payload.updatedAt });
      transaction.set(canonicalNewsRef, { ...oldOwnNews, ...newsPayload, isHidden: false, isScheduleActive: true,
        isPinned: oldOwnNews.pinSource === 'manual' ? Boolean(oldOwnNews.isPinned) : false,
        pinSource: oldOwnNews.pinSource === 'manual' ? 'manual' : 'auto', isHot: Boolean(oldOwnNews.isHot),
        createdAt: oldOwnNews.createdAt || payload.updatedAt, sortOrder: oldOwnNews.sortOrder || payload.updatedAt });
    }
  });
}

export async function deleteSchedulePublication(id, expectedSchedule) {
  const targetRef = refFor('class_schedules', id);
  const pointerRef = refFor('schedule_publications', scheduleScopeKey(expectedSchedule));
  const linked = (await getDocsFromServer(query(dataCollection('news'), where('scheduleId', '==', id)))).docs
    .filter(item => item.data().type === 'class_schedule');
  if (linked.length > 350) throw new Error('Có quá nhiều bản tin liên quan cần đối soát trước khi xóa.');
  await runTransaction(db, async transaction => {
    const target = await transaction.get(targetRef);
    const pointer = await transaction.get(pointerRef);
    const news = await Promise.all(linked.map(item => transaction.get(item.ref)));
    if (!same(withoutId(target.data()), withoutId(expectedSchedule))) throw new Error('Thời khóa biểu vừa thay đổi. Chưa xóa.');
    if (news.some(item => item.data() && (item.data().scheduleId !== id || item.data().type !== 'class_schedule'))) throw new Error('Bản tin liên quan vừa thay đổi. Chưa xóa.');
    transaction.delete(targetRef);
    news.forEach(item => transaction.delete(item.ref));
    if (pointer.data()?.activeScheduleId === id) transaction.set(pointerRef, { activeScheduleId: null, updatedAt: Date.now() }, { merge: true });
  });
}
