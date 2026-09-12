import React from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import Navbar from "components/navbar";
import Sidebar from "components/sidebar";
import Footer from "components/footer/Footer";

import routes from "routes.js";

import MyProfile from "views/admin/MyProfile";
import AccountSettings from "views/admin/AccountSettings";
import Security from "views/admin/Security";

import authService from "layouts/auth/authService";
import { userHasPermission } from "layouts/auth/permissions";

export default function Admin(props) {
  const { ...rest } = props;
  const location = useLocation();

  const [open, setOpen] = React.useState(
    () => window.innerWidth >= 1200
  );

  // =========================================================
  // RESPONSIVE SIDEBAR
  // =========================================================

  React.useEffect(() => {
    const handleResize = () => {
      setOpen(window.innerWidth >= 1200);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // =========================================================
  // CHECK ROUTE PERMISSION
  // =========================================================

  const hasRoutePermission = (route) => {
    if (!route.permission) {
      return true;
    }

    const user = authService.getCurrentUser();

    if (!user) {
      return false;
    }

    return userHasPermission(user, route.permission);
  };

  // =========================================================
  // CURRENT PAGE TITLE
  // =========================================================

  const getCurrentRouteName = () => {
    const path = location.pathname;

    if (path === "/admin/profile") {
      return "My Profile";
    }

    if (path === "/admin/account-settings") {
      return "Account Settings";
    }

    if (path === "/admin/security") {
      return "Security";
    }

    for (const route of routes) {
      if (route.type === "section" && route.children) {
        const match = route.children.find(
          (child) =>
            child.layout === "/admin" &&
            path === `/admin/${child.path}`
        );

        if (match) {
          return match.name;
        }
      }
    }

    return "Port Dashboard";
  };

  // =========================================================
  // PORT SYSTEM ROUTES
  // =========================================================

  const getRoutes = () => {
    const routeElements = [];

    routes.forEach((route) => {
      if (route.type === "section" && route.children) {
        route.children.forEach((child) => {
          if (child.layout !== "/admin") {
            return;
          }

          routeElements.push(
            <Route
              key={child.path}
              path={child.path}
              element={
                hasRoutePermission(child) ? (
                  child.component
                ) : (
                  <Navigate
                    to="/admin/default"
                    replace
                  />
                )
              }
            />
          );
        });
      }
    });

    return routeElements;
  };

  // =========================================================
  // DOCUMENT DIRECTION
  // =========================================================

  React.useEffect(() => {
    document.documentElement.dir = "ltr";
  }, []);

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="flex h-full w-full">

      {/* SIDEBAR */}

      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
      />

      {/* MAIN CONTENT AREA */}

      <div className="h-full w-full bg-lightPrimary dark:!bg-navy-900">

        <main className="mx-[12px] h-full flex-none transition-all md:pr-2 xl:ml-[313px]">

          <div className="h-full">

            {/* NAVBAR */}

            <Navbar
              onOpenSidenav={() => setOpen(true)}
              logoText="Karwar Port Smart Sea Port Management System"
              brandText={getCurrentRouteName()}
              {...rest}
            />

            {/* PAGE CONTENT */}

            <div className="mx-auto mb-auto h-full min-h-[84vh] p-2 pt-5 md:pr-2">

              <Routes>

                {/* PORT MODULE ROUTES */}

                {getRoutes()}

                {/* ACCOUNT & SECURITY */}

                <Route
                  path="profile"
                  element={<MyProfile />}
                />

                <Route
                  path="account-settings"
                  element={<AccountSettings />}
                />

                <Route
                  path="security"
                  element={<Security />}
                />

                {/* ADMIN ROOT */}

                <Route
                  path="/"
                  element={
                    <Navigate
                      to="default"
                      replace
                    />
                  }
                />

                {/* UNKNOWN ADMIN PAGE */}

                <Route
                  path="*"
                  element={
                    <Navigate
                      to="default"
                      replace
                    />
                  }
                />

              </Routes>

            </div>

            {/* FOOTER */}

            <div className="p-3">
              <Footer />
            </div>

          </div>

        </main>

      </div>

    </div>
  );
}