export const CONVERSATION_COLLECTION = 'student_conversations';
export const CONVERSATION_MESSAGE_LIMIT = 4000;

const requireValue = (condition, message, status = 400) => {
  if (!condition) throw Object.assign(new Error(message), { status });
};
export function conversationId(accessCode) {
  const code = String(accessCode || '').trim().toUpperCase();
  requireValue(/^HS\d{3,15}$/.test(code), 'Học sinh chưa có mã hợp lệ để nhắn tin.');
  return code;
}
export const conversationUnread = (thread, role) => Number(thread?.[role === 'admin' ? 'lastStudentSequence' : 'lastAdminSequence'] || 0)
  > Number(thread?.[role === 'admin' ? 'adminReadSequence' : 'studentReadSequence'] || 0);

export function resolveConversationStudent(thread, students = []) {
  if (!thread?.accessCode) return null;
  const matches = students.filter(profile => profile.accessCode === thread.accessCode
    && String(profile.schoolCode || '') === String(thread.schoolCode || ''));
  return matches.find(profile => profile.id === thread.studentId)
    || matches.sort((a, b) => String(b.schoolYear || '').localeCompare(String(a.schoolYear || '')))[0] || null;
}

// The same transactional protocol is used by the legacy client and verified server API.
export function createConversationService({ store, root, now = Date.now }) {
  const threadRef = id => store.doc(`${root}/${CONVERSATION_COLLECTION}/${conversationId(id)}`);
  const authorized = (actor, thread) => {
    requireValue(actor?.role === 'admin' || actor?.role === 'student' && thread.accessCode === actor.accessCode
      && thread.schoolCode === actor.schoolCode, 'Chỉ được mở cuộc trao đổi của chính mình.', 403);
  };
  async function send(actor, { studentId, messageId, body, replyTo }) {
    requireValue(['student', 'admin'].includes(actor?.role), 'Chỉ học sinh và admin được trao đổi.', 403);
    requireValue(typeof studentId === 'string' && studentId && !studentId.includes('/'), 'Thiếu hồ sơ người nhận.');
    requireValue(actor.role !== 'student' || studentId === actor.studentId, 'Không được gửi thay học sinh khác.', 403);
    requireValue(/^[A-Za-z0-9_-]{8,80}$/.test(messageId || ''), 'Mã tin nhắn không hợp lệ.');
    const text = String(body || '').trim();
    requireValue(text.length > 0 && text.length <= CONVERSATION_MESSAGE_LIMIT, `Nhập nội dung từ 1 đến ${CONVERSATION_MESSAGE_LIMIT} ký tự.`);
    const context = replyTo ? { id: String(replyTo.id || '').slice(0, 160), title: String(replyTo.title || '').slice(0, 200) } : null;
    return store.runTransaction(async tx => {
      const profile = (await tx.get(store.doc(`${root}/students/${studentId}`))).data();
      requireValue(profile, 'Hồ sơ người nhận không còn tồn tại.', 404);
      if (actor.role === 'student') requireValue(profile.accessCode === actor.accessCode && profile.schoolCode === actor.schoolCode,
        'Hồ sơ đã thay đổi. Vui lòng đăng nhập lại.', 403);
      const id = conversationId(profile.accessCode), target = threadRef(id);
      const messageRef = store.doc(`${target.path}/messages/${messageId}`);
      const thread = (await tx.get(target)).data();
      const previous = (await tx.get(messageRef)).data();
      const settings = (await tx.get(store.doc(`${root}/settings/global`))).data();
      requireValue(!settings?.maintenance?.active, 'Hệ thống đang bảo trì. Giữ nội dung để gửi lại.', 409);
      const studentKey = profile.studentKey || profile.accessCode;
      if (thread) requireValue(thread.studentKey === studentKey && thread.schoolCode === profile.schoolCode,
        'Định danh học sinh đã thay đổi. Cần admin kiểm tra trước khi gửi.', 409);
      const senderId = actor.role === 'student' ? profile.accessCode : actor.uid;
      requireValue(senderId, 'Cần đăng nhập lại để gửi tin.', 401);
      if (previous) {
        requireValue(previous.senderId === senderId && previous.senderRole === actor.role && previous.body === text
          && JSON.stringify(previous.replyTo) === JSON.stringify(context), 'Mã gửi lại không khớp nội dung trước đó.', 409);
        return { threadId: id, messageId, replayed: true };
      }
      const sequence = Number(thread?.lastSequence || 0) + 1, createdAt = now();
      tx.set(messageRef, { body: text, replyTo: context, senderRole: actor.role, senderId,
        senderLabel: actor.role === 'student' ? profile.fullName || 'Học sinh' : 'Admin', sequence, createdAt });
      tx.set(target, { ...(thread || {}), accessCode: profile.accessCode, studentKey, studentId,
        studentName: profile.fullName || 'Học sinh', className: profile.className || '', schoolYear: profile.schoolYear || '',
        schoolCode: profile.schoolCode || '', lastSequence: sequence, lastMessage: text.slice(0, 160), lastSenderRole: actor.role,
        [actor.role === 'admin' ? 'lastAdminSequence' : 'lastStudentSequence']: sequence,
        createdAt: thread?.createdAt || createdAt, updatedAt: createdAt });
      return { threadId: id, messageId, sequence };
    });
  }
  async function markRead(actor, { threadId, throughSequence }) {
    requireValue(['student', 'admin'].includes(actor?.role), 'Không có quyền đọc cuộc trao đổi.', 403);
    requireValue(actor.role !== 'student' || threadId === actor.accessCode, 'Chỉ được mở cuộc trao đổi của chính mình.', 403);
    const target = threadRef(threadId);
    requireValue(Number.isSafeInteger(throughSequence) && throughSequence >= 0, 'Mốc đã đọc không hợp lệ.');
    return store.runTransaction(async tx => {
      const thread = (await tx.get(target)).data();
      if (!thread) return { marked: false };
      authorized(actor, thread);
      const key = actor.role === 'admin' ? 'adminReadSequence' : 'studentReadSequence';
      const sequence = Math.max(Number(thread[key] || 0), Math.min(throughSequence, thread.lastSequence));
      if (sequence > Number(thread[key] || 0)) tx.set(target, { [key]: sequence }, { merge: true });
      return { marked: true, sequence };
    });
  }
  return { send, markRead };
}
