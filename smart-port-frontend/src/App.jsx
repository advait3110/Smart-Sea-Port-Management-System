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

import MyProfile from "views/admin/MyProfile";
import AccountSettings from "views/admin/AccountSettings";
import Security from "views/admin/Security";

import Navbar from "components/navbar";
import Sidebar from "components/sidebar";
import Footer from "components/footer/Footer";

// =========================================================
// PROTECTED ADMIN ROUTE
// =========================================================

const ProtectedAdminRoute = () => {
  const location = useLocation();

  if (!authService.isAuthenticated()) {
    return (
      <Navigate
        to="/auth/login"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  return <AdminLayout />;
};

// =========================================================
// ACCOUNT PAGE LAYOUT
// =========================================================

const AccountPageLayout = ({ children, title }) => {
  const [open, setOpen] = React.useState(
    window.innerWidth >= 1200
  );

  React.useEffect(() => {
    const handleResize = () => {
      setOpen(window.innerWidth >= 1200);
    };

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.dir = "ltr";
  }, []);

  return (
    <div className="flex h-full w-full">

      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
      />

      <div className="h-full w-full bg-lightPrimary dark:!bg-navy-900">

        <main className="mx-[12px] h-full flex-none transition-all md:pr-2 xl:ml-[313px]">

          <div className="h-full">

            <Navbar
              onOpenSidenav={() =>
                setOpen(true)
              }
              logoText="Karwar Port Smart Sea Port Management System"
              brandText={title}
            />

            <div className="mx-auto mb-auto h-full min-h-[84vh] p-2 pt-5 md:pr-2">
              {children}
            </div>

            <div className="p-3">
              <Footer />
            </div>

          </div>

        </main>

      </div>

    </div>
  );
};

// =========================================================
// PROTECTED ACCOUNT PAGE
// =========================================================

const ProtectedAccountPage = ({
  title,
  children,
}) => {
  if (!authService.isAuthenticated()) {
    return (
      <Navigate
        to="/auth/login"
        replace
      />
    );
  }

  return (
    <AccountPageLayout title={title}>
      {children}
    </AccountPageLayout>
  );
};

// =========================================================
// APP
// =========================================================

const App = () => {
  React.useEffect(() => {
    authService.initializeAuth();
  }, []);

  return (
    <Routes>

      {/* =====================================================
          AUTHENTICATION
          ===================================================== */}

      <Route
        path="/auth/*"
        element={<AuthLayout />}
      />

      {/* =====================================================
          MY PROFILE
          ===================================================== */}

      <Route
        path="/admin/profile"
        element={
          <ProtectedAccountPage title="My Profile">
            <MyProfile />
          </ProtectedAccountPage>
        }
      />

      {/* =====================================================
          ACCOUNT SETTINGS
          ===================================================== */}

      <Route
        path="/admin/account-settings"
        element={
          <ProtectedAccountPage title="Account Settings">
            <AccountSettings />
          </ProtectedAccountPage>
        }
      />

      {/* =====================================================
          SECURITY
          ===================================================== */}

      <Route
        path="/admin/security"
        element={
          <ProtectedAccountPage title="Security">
            <Security />
          </ProtectedAccountPage>
        }
      />

      {/* =====================================================
          MAIN ADMIN APPLICATION
          ===================================================== */}

      <Route
        path="/admin/*"
        element={<ProtectedAdminRoute />}
      />

      {/* =====================================================
          RTL
          ===================================================== */}

      <Route
        path="/rtl/*"
        element={<RtlLayout />}
      />

      {/* =====================================================
          ROOT
          ===================================================== */}

      <Route
        path="/"
        element={
          <Navigate
            to="/auth/login"
            replace
          />
        }
      />

      {/* =====================================================
          UNKNOWN ROUTES
          ===================================================== */}

      <Route
        path="*"
        element={
          <Navigate
            to="/auth/login"
            replace
          />
        }
      />

    </Routes>
  );
};

export default App;