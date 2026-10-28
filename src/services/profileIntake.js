import { ADMIN_SERVER_SESSION_STORAGE_KEY, STAFF_SERVER_SESSION_STORAGE_KEY } from '../config/sessionKeys.js';
export const PROFILE_INTAKE_ENABLED=import.meta.env?.VITE_PROFILE_INTAKE_ENABLED==='true';
export async function requestProfileIntake(action,payload={}, {signal,fetchImpl=fetch,storage=window.sessionStorage}={}){
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(abort,35000);
  try{
    const response=await fetchImpl('/.site/profile-intake',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({...payload,action,adminSessionToken:storage.getItem(ADMIN_SERVER_SESSION_STORAGE_KEY) || '',staffSessionToken:storage.getItem(STAFF_SERVER_SESSION_STORAGE_KEY) || '',studentSessionToken:storage.getItem('khl-student-server-session-v1') || ''})});
    let result;try{result=await response.json();}catch{throw new Error('Máy chủ tiếp nhận chưa phản hồi đúng. Giữ trang mở để thử lại.');}
    if(!response.ok)throw Object.assign(new Error(result.error || 'Chưa tiếp nhận được hồ sơ. Nội dung đang nhập vẫn được giữ.'),{status:response.status});
    if(['submit','review','applied'].includes(action) && typeof window!=='undefined')window.dispatchEvent(new window.Event('profile-intake-updated'));
    return result;
  }catch(error){
    if(signal?.aborted)throw new DOMException('Đã đóng hồ sơ.','AbortError');
    if(error.name==='AbortError' || error instanceof TypeError)throw new Error('Kết nối bị gián đoạn. Nội dung vẫn được giữ; bấm gửi lại để kiểm tra cùng yêu cầu.',{cause:error});
    throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function observeOwnProfileIntake(onChange,onError){
  const controller=new AbortController();let active=true,busy=false,again=false;
  const refresh=async()=>{
    if(busy){again=true;return;}busy=true;
    try{const result=await requestProfileIntake('mine',{}, {signal:controller.signal});if(active)onChange(result.requests || []);}
    catch(error){if(active && error.name!=='AbortError')onError(error);}
    finally{busy=false;if(active && again){again=false;void refresh();}}
  };
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  window.addEventListener('profile-intake-updated',refresh);document.addEventListener('visibilitychange',visible);void refresh();
  return ()=>{active=false;controller.abort();window.removeEventListener('profile-intake-updated',refresh);document.removeEventListener('visibilitychange',visible);};
}
