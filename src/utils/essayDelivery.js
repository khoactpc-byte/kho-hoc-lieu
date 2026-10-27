// A saved review and delivery to the mailbox are separate confirmations.
export function essayDeliveryState(submission={}, {changed=false}={}) {
  const reviewed=!!submission.reviewedAt;
  const returned=submission.returnedReview;
  const samePaper=!returned || returned.fileId===submission.fileId && Number(returned.submittedAt || 0)===Number(submission.submittedAt || 0);
  const confirmed=reviewed && submission.feedbackSentReviewAt===submission.reviewedAt && samePaper;
  if(confirmed)return {confirmed:true,state:changed?'previous':'sent',label:changed?'Đã gửi bản đã lưu · thay đổi mới chưa gửi':'Đã gửi học sinh'};
  if(reviewed)return {confirmed:false,state:submission.feedbackSentReviewAt?'previous':'unconfirmed',label:submission.feedbackSentReviewAt?'Đã gửi bản trước · bản hiện tại chưa xác nhận gửi':'Đã lưu · chưa xác nhận gửi học sinh'};
  return {confirmed:false,state:'draft',label:'Chưa gửi học sinh'};
}

export function essaySaveErrorMessage(error, {sending=false,reviewSaved=false}={}) {
  if(sending && reviewSaved){
    if(error?.status===401)return 'Bài chấm đã lưu. Lần gửi này bị từ chối vì phiên đăng nhập đã hết hạn hoặc không hợp lệ. Đăng nhập lại rồi bấm “Đồng ý và gửi học sinh”.';
    return 'Bài chấm đã lưu. Chưa xác nhận gửi hộp thư; kiểm tra trạng thái gửi trên bài trước khi thử lại. '+(error?.message || 'Chưa kết nối được máy chủ.');
  }
  return 'Chưa lưu được bài chấm: '+(error?.message || 'Hãy thử lại.');
}
