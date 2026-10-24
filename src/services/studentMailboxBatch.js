export async function sendStudentMailboxBatch(messages, sendMessage) {
  const validMessages = (Array.isArray(messages) ? messages : []).filter(message => message?.student && message?.title && message?.body);
  if (!validMessages.length) throw new Error('Chưa có học sinh hoặc nội dung thư để gửi.');
  let sentCount = 0;
  const failedMessages = [];
  const failureReasons = [];
  for (const message of validMessages) {
    try {
      await sendMessage(message);
      sentCount += 1;
    } catch (error) {
      failedMessages.push(message);
      const reason = String(error?.message || error || 'Máy chủ không trả lý do lỗi.').trim();
      failureReasons.push({
        studentId: message.student.id,
        studentName: message.student.fullName || message.student.accessCode || 'Học sinh',
        message: /^(Failed to fetch|NetworkError|Load failed)$/i.test(reason)
          ? 'Không nhận được phản hồi từ máy chủ Google. Kiểm tra kết nối mạng; thư có thể đã được xử lý, cần kiểm tra hộp thư trước khi gửi lại.'
          : reason
      });
    }
  }
  return { sentCount, failedMessages, failedNames: failureReasons.map(item => item.studentName), failureReasons };
}

export function studentMailboxFailureSummary(failureReasons = []) {
  const counts = new Map();
  failureReasons.forEach(item => {
    const reason = String(item.message || '').trim();
    if (reason) counts.set(reason, (counts.get(reason) || 0) + 1);
  });
  return [...counts].slice(0, 3).map(([reason, count]) => `${count} thư: ${reason}`).join('\n');
}
