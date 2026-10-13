import { lazy, Suspense, useEffect, useState } from 'react';

const App = lazy(() => import('./App.jsx'));
const RegistrationPage = lazy(() => import('./features/registration/RegistrationPage.jsx'));
const isRegistration = () => /^#\/(?:dang-ky|register)\/?(?:\?|$)/i.test(window.location.hash);

// Keep the public form independent of the signed-in admin/student application.
export default function RootRouter() {
  const [registration, setRegistration] = useState(isRegistration);
  useEffect(() => {
    const syncRoute = () => setRegistration(isRegistration());
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);
  return <Suspense fallback={<div className="app-route-loading" role="status">Đang mở trang…</div>}>{registration ? <RegistrationPage /> : <App />}</Suspense>;
}
