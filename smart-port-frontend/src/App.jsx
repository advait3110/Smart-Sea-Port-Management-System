import React from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import RtlLayout from "layouts/rtl";
import AdminLayout from "layouts/admin";
import AuthLayout from "layouts/auth";
import authService from "layouts/auth/authService";

// Require authentication before rendering the admin shell.
//
// Every /admin page is drawn by layouts/admin/index.jsx. That
// includes My Profile (/admin/profile), Account Settings
// (/admin/account-settings) and Security (/admin/security): the
// admin layout hides the side panel on those three pages and shows
// the Port of Singapore logo and a Back button instead.
const ProtectedAdminRoute = () => {
  const location = useLocation();

  if (!authService.isAuthenticated()) {
    return (
      <Navigate
        to="/auth/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <AdminLayout />;
};

const App = () => {
  React.useEffect(() => {
    authService.initializeAuth();
  }, []);

  return (
    <Routes>
      <Route path="/auth/*" element={<AuthLayout />} />

      <Route path="/admin/*" element={<ProtectedAdminRoute />} />
      <Route path="/rtl/*" element={<RtlLayout />} />
      <Route path="/" element={<Navigate to="/auth/login" replace />} />
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  );
};

export default App;