import { collection, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';
import { requestPrivateApi } from './serverQuizClient';
import { postAppsScript } from '../utils/helpers';
import { studentUploadMime, readFileBase64 } from '../utils/fileUpload';

export async function submitStudentProfileChange({ activeStudentProfile, isSubmittingProfileRequest, activeStudentIsReadOnly, showNotification, activeStudentReadOnlyReason, studentRequestScopeRef, setIsSubmittingProfileRequest, STUDENT_PROFILE_IMAGE_FIELDS, studentProfileImages, studentProfileDocumentOverrides, activeStudentPendingProfileChanges, studentProfileImageAppendModes, studentProfileEditableFields, normalizeStudentResultRating, studentProfileDraft, activeStudentPendingProfileRequests, currentSchoolYear, setShowStudentProfileModal, IMAGE_DRIVE_FOLDER_ID }) {
  const fileToBase64Payload = async (file, field = {}) => {
    const mimeType = studentUploadMime(file);
    const filenameTag = field.filename || field.key || 'anh';
    return {
      filename: `[HS_${activeStudentProfile?.accessCode || activeStudentProfile?.id || 'hoc-sinh'}]_${filenameTag}_${file.name}`,
      mimeType,
      base64: await readFileBase64(file),
      folderId: IMAGE_DRIVE_FOLDER_ID
    };
  };

    if (!activeStudentProfile?.id || isSubmittingProfileRequest) return;
    if (activeStudentIsReadOnly) {
      showNotification(activeStudentReadOnlyReason || 'Hồ sơ này đang ở chế độ chỉ xem.', 'error');
      return;
    }
    const request = studentRequestScopeRef.current.begin('profile');
    if (!request) return;
    setIsSubmittingProfileRequest(true);
    try {
      const uploadedImageChanges = {};
      for (const field of STUDENT_PROFILE_IMAGE_FIELDS) {
        const imageFiles = Array.isArray(studentProfileImages[field.key])
          ? studentProfileImages[field.key]
          : (studentProfileImages[field.key] ? [studentProfileImages[field.key]] : []);
        if (!imageFiles.length) continue;
        if (field.key === 'transcriptUrl') {
          const uploadedUrls = [];
          for (const imageFile of imageFiles) {
            const uploadPayload = await fileToBase64Payload(imageFile, field);
            if (!studentRequestScopeRef.current.isCurrent(request)) return;
            const uploadRes = await postAppsScript(uploadPayload);
            if (!studentRequestScopeRef.current.isCurrent(request)) return;
            if (uploadRes.status !== 'success') throw new Error(uploadRes.message || `Chưa tải được ${field.label.toLowerCase()}`);
            uploadedUrls.push(uploadRes.webViewLink || uploadRes.url || (uploadRes.fileId ? `https://drive.google.com/file/d/${uploadRes.fileId}/view` : ''));
          }
          const hasDocumentOverride = Object.prototype.hasOwnProperty.call(studentProfileDocumentOverrides, field.key);
          const currentDocumentValue = hasDocumentOverride
            ? studentProfileDocumentOverrides[field.key]
            : (activeStudentPendingProfileChanges[field.key] || activeStudentProfile[field.key] || '');
          const existingDocumentUrls = String(currentDocumentValue || '')
            .split(/\s*,\s*|\n+/)
            .map(item => item.trim())
            .filter(Boolean);
          uploadedImageChanges[field.key] = studentProfileImageAppendModes[field.key] && existingDocumentUrls.length
            ? [...existingDocumentUrls, ...uploadedUrls].filter(Boolean).join('\n')
            : uploadedUrls.filter(Boolean).join('\n');
          continue;
        }
        const imageFile = imageFiles[0];
        if (!imageFile) continue;
        const uploadPayload = await fileToBase64Payload(imageFile, field);
        if (!studentRequestScopeRef.current.isCurrent(request)) return;
        const uploadRes = await postAppsScript(uploadPayload);
        if (!studentRequestScopeRef.current.isCurrent(request)) return;
        if (uploadRes.status !== 'success') throw new Error(uploadRes.message || `Chưa tải được ${field.label.toLowerCase()}`);
        uploadedImageChanges[field.key] = uploadRes.webViewLink || uploadRes.url || (uploadRes.fileId ? `https://drive.google.com/file/d/${uploadRes.fileId}/view` : '');
      }
      const changes = {};
      studentProfileEditableFields.forEach(field => {
        const currentValue = field.type === 'select'
          ? normalizeStudentResultRating(activeStudentProfile[field.key] || '')
          : String(activeStudentProfile[field.key] || '').trim();
        const nextValue = field.type === 'select'
          ? normalizeStudentResultRating(studentProfileDraft[field.key] || '')
          : String(studentProfileDraft[field.key] || '').trim();
        if (nextValue !== currentValue) changes[field.key] = nextValue;
      });
      Object.assign(changes, uploadedImageChanges);
      STUDENT_PROFILE_IMAGE_FIELDS.forEach(field => {
        if (!Object.prototype.hasOwnProperty.call(studentProfileDocumentOverrides, field.key) || uploadedImageChanges[field.key]) return;
        const currentValue = String(activeStudentPendingProfileChanges[field.key] || activeStudentProfile[field.key] || '').trim();
        const nextValue = String(studentProfileDocumentOverrides[field.key] || '').trim();
        if (nextValue !== currentValue) changes[field.key] = nextValue;
      });
      if (Object.keys(changes).length === 0) {
        showNotification(activeStudentPendingProfileRequests.length > 0 ? 'Yêu cầu của em đang chờ admin duyệt rồi.' : 'Chưa có thông tin nào thay đổi.', 'error');
        return;
      }
      const requestPayload = {
        studentId: activeStudentProfile.id,
        studentName: activeStudentProfile.fullName || '',
        accessCode: activeStudentProfile.accessCode || '',
        className: activeStudentProfile.className || '',
        schoolYear: activeStudentProfile.schoolYear || currentSchoolYear,
        changes: {
          ...activeStudentPendingProfileChanges,
          ...changes
        },
        status: 'pending',
        updatedAt: Date.now()
      };
      const existingRequest = activeStudentPendingProfileRequests[0];
      if (SCOPED_AUTH_ENABLED) {
        await requestPrivateApi('data', 'profileRequest', { changes: requestPayload.changes }, { signal: request.signal });
      } else if (existingRequest?.id) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests', existingRequest.id), {
          ...requestPayload,
          createdAt: existingRequest.createdAt || Date.now()
        }, { merge: true });
        if (!studentRequestScopeRef.current.isCurrent(request)) return;
        await Promise.all(activeStudentPendingProfileRequests.slice(1).map(request => (
          request.id ? deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests', request.id)) : Promise.resolve()
        )));
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests'), {
          ...requestPayload,
          createdAt: Date.now()
        });
      }
      if (!studentRequestScopeRef.current.isCurrent(request)) return;
      setShowStudentProfileModal(false);
      showNotification(existingRequest?.id ? 'Đã cập nhật yêu cầu đang chờ duyệt.' : 'Đã gửi yêu cầu sửa hồ sơ. Admin duyệt xong mới cập nhật.');
    } catch (error) {
      if (studentRequestScopeRef.current.isCurrent(request)) showNotification(`Chưa gửi được yêu cầu sửa: ${error.message}`, 'error');
    } finally {
      if (studentRequestScopeRef.current.finish(request)) setIsSubmittingProfileRequest(false);
    }
  
}
