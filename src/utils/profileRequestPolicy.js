export const PROFILE_REQUEST_PENDING_MESSAGE = 'Yêu cầu chỉnh sửa hồ sơ của bạn đang chờ quản trị viên duyệt. Vui lòng chờ duyệt xong, sau đó kiểm tra lại hồ sơ trước khi gửi chỉnh sửa mới.';

export const isPendingProfileRequest = request => Boolean(request) && (request.status || 'pending') === 'pending';
