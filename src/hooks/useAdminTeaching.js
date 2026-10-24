import { useCallback, useEffect, useMemo, useState } from 'react';
import { canUseAdminTeaching, createAdminTeachingProfile } from '../utils/adminTeachingAccess.js';

export default function useAdminTeaching({ isAdmin, accessScope, sessionToken, uid, scoped, identity, setRole, setLoginRole, resetWorkspace }) {
  const [schoolCode, setSchoolCode] = useState('');
  const allowed = canUseAdminTeaching({ isAdmin, accessScope, sessionToken, uid, scoped, identity });
  const profile = useMemo(() => allowed ? createAdminTeachingProfile({ schoolCode, uid }) : null, [allowed, schoolCode, uid]);
  const open = useCallback((campus = 'NAN') => {
    if (!allowed || !createAdminTeachingProfile({ schoolCode: campus, uid })) return false;
    resetWorkspace(); setSchoolCode(campus); setRole('teacher'); setLoginRole('teacher');
    return true;
  }, [allowed, uid, resetWorkspace, setRole, setLoginRole]);
  const close = useCallback(() => {
    resetWorkspace(); setSchoolCode(''); setRole(isAdmin ? 'admin' : null); setLoginRole(null);
  }, [isAdmin, resetWorkspace, setRole, setLoginRole]);
  useEffect(() => { if (schoolCode && !allowed) close(); }, [schoolCode, allowed, close]);
  return { allowed, active: Boolean(profile), schoolCode: profile?.schoolCode || '', profile, open, close };
}
