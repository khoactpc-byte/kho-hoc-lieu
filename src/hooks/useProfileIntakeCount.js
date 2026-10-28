import { useEffect,useState } from 'react';
import { PROFILE_INTAKE_ENABLED,requestProfileIntake } from '../services/profileIntake';

// Read the small authenticated count outside the workspace; never fetch pupils' details for a badge.
export function useProfileIntakeCount(enabled,scopeKey,schoolYear,educationLevel){
  const active=Boolean(enabled && PROFILE_INTAKE_ENABLED);
  const key=JSON.stringify([scopeKey,schoolYear,educationLevel]);
  const [snapshot,setSnapshot]=useState({key:null,count:0,pendingCount:0,waitingSyncCount:0,loaded:false,error:''});
  useEffect(()=>{
    if(!active)return undefined;
    const controller=new AbortController();let alive=true,busy=false,again=false,lastRefreshAt=0;
    setSnapshot({key,count:0,pendingCount:0,waitingSyncCount:0,loaded:false,error:''});
    const refresh=async()=>{
      if(!alive || document.visibilityState==='hidden')return;
      if(busy){again=true;return;}
      busy=true;lastRefreshAt=Date.now();
      try{
        const result=await requestProfileIntake('count',{schoolYear,level:educationLevel},{signal:controller.signal});
        if(![result.total,result.pendingCount,result.waitingSyncCount].every(value=>Number.isSafeInteger(value) && value>=0) || result.pendingCount>result.total || result.waitingSyncCount>result.total)throw new Error('Máy chủ chưa trả đúng số yêu cầu sửa.');
        if(alive)setSnapshot({key,count:result.total,pendingCount:result.pendingCount,waitingSyncCount:result.waitingSyncCount,loaded:true,error:''});
      }catch(error){if(alive && !controller.signal.aborted)setSnapshot(previous=>({...previous,error:error.message}));}
      finally{busy=false;if(alive && again){again=false;void refresh();}}
    };
    const resume=()=>{if(Date.now()-lastRefreshAt>=20000)void refresh();};
    const changed=()=>{void refresh();};
    const timer=window.setInterval(changed,60000);
    window.addEventListener('profile-intake-updated',changed);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    void refresh();
    return()=>{alive=false;controller.abort();window.clearInterval(timer);window.removeEventListener('profile-intake-updated',changed);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[active,key,schoolYear,educationLevel]);
  return active && snapshot.key===key?snapshot:{count:0,pendingCount:0,waitingSyncCount:0,loaded:!active,error:''};
}
