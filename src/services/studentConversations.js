import { collection, doc, onSnapshot, orderBy, query, limitToLast, runTransaction } from 'firebase/firestore';
import { appId, auth, db } from '../config/firebase';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';
import { requestPrivateApi } from './serverQuizClient';
import { CONVERSATION_COLLECTION, conversationId, createConversationService } from '../utils/studentConversations';

const root = `artifacts/${appId}/public/data`;
const records = collection(db, `${root}/${CONVERSATION_COLLECTION}`);
const service = createConversationService({ root, store: {
  doc: path => doc(db, path), runTransaction: callback => runTransaction(db, callback)
} });
export function subscribeConversations({ role, accessCode }, next, error) {
  if (role === 'student') return onSnapshot(doc(records, conversationId(accessCode)), snapshot =>
    next(snapshot.exists() ? [{ ...snapshot.data(), id: snapshot.id }] : []), error);
  if (role !== 'admin') throw new Error('Không có quyền mở tin nhắn học sinh.');
  return onSnapshot(query(records, orderBy('updatedAt', 'desc')), snapshot =>
    next(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))), error);
}
export function subscribeConversationMessages(threadId, count, next, error) {
  return onSnapshot(query(collection(records, conversationId(threadId), 'messages'), orderBy('sequence', 'asc'), limitToLast(count)), snapshot =>
    next(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))), error);
}
const actor = context => ({ role: context.role, uid: auth.currentUser?.uid, studentId: context.student?.id,
  accessCode: context.student?.accessCode, schoolCode: context.student?.schoolCode || '' });
export async function sendConversationMessage(context, payload) {
  if (!auth.currentUser) throw new Error('Cần đăng nhập lại để gửi tin.');
  if (SCOPED_AUTH_ENABLED) return requestPrivateApi('data', 'sendConversationMessage', payload);
  return service.send(actor(context), payload);
}
export async function markConversationRead(context, payload) {
  if (!auth.currentUser) throw new Error('Cần đăng nhập lại để mở tin nhắn.');
  if (SCOPED_AUTH_ENABLED) return requestPrivateApi('data', 'markConversationRead', payload);
  return service.markRead(actor(context), payload);
}
