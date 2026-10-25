import React from "react";

import {
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";

import { MdArrowBack } from "react-icons/md";

import singaporeHarborLogo from "assets/img/port/singapore-harbor.png";

import Navbar from "components/navbar";
import Sidebar from "components/sidebar";
import Footer from "components/footer/Footer";

import routes from "routes.js";

import MyProfile from "views/admin/MyProfile";
import AccountSettings from "views/admin/AccountSettings";
import Security from "views/admin/Security";

import authService from "layouts/auth/authService";

import {
  userHasPermission,
  hasModuleAccess,
} from "layouts/auth/permissions";

const THEME_STORAGE_KEY = "karwarPortTheme";
const LOGIN_TRANSITION_KEY =
  "karwarPortLoginTransition";

const PERMISSION_REFRESH_INTERVAL = 10000;

// =========================================================
// PERSONAL PAGES (shown without the side panel)
// =========================================================

const ACCOUNT_PAGE_PATHS = [
  "/admin/profile",
  "/admin/account-settings",
  "/admin/security",
];

// =========================================================
// BACKEND MODULE PERMISSION KEYS
// =========================================================

const SIDEBAR_PERMISSION_MAP = {
  dashboard: "dashboard",
  portMap: "port_map",
  weather: "weather",
  vessels: "vessels",
  berths: "berths",
  cargo: "cargo",
  gateTrucks: "gate_trucks",
  portCommunication: "port_communication",
  notifications: "notifications",
  portAlerts: "port_alerts",
  incidents: "incidents",
  assetMaintenance: "asset_maintenance",
  analytics: "analytics",
  documents: "documents",
  auditLogs: "audit_logs",
  userRoleManagement:
    "user_role_management",
};

export default function Admin(props) {
  const { ...rest } = props;
  const location = useLocation();

  // My Profile, Account Settings and Security are personal
  // pages. The side panel slides out of the way on them (for
  // every account, whatever its role) and the Port of Singapore
  // logo with a "Back" button is shown instead. It slides back in
  // on every other page.
  const isAccountPage = ACCOUNT_PAGE_PATHS.includes(
    location.pathname.replace(/\/+$/, "")
  );

  // The last normal page the employee was on, so "Back" returns
  // there (see "WHERE BACK GOES" below).
  const lastPagePathRef = React.useRef(null);

  React.useEffect(() => {
    const path = location.pathname.replace(/\/+$/, "");

    if (!isAccountPage && path.startsWith("/admin/")) {
      lastPagePathRef.current = path;
    }
  }, [isAccountPage, location.pathname]);

  // =======================================================
  // SIDEBAR
  // =======================================================

  const [open, setOpen] = React.useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.innerWidth >= 1200;
  });

  // The side panel can be made wider or narrower by dragging its
  // right edge. It publishes its width as the CSS value
  // "--sidebar-width" (and tells us through onWidthChange), and the
  // page content below uses that value as its left margin, so the
  // content always starts exactly where the side panel ends.
  //
  // While the edge is being dragged the content must follow the
  // mouse at once, so the little slide is switched off for a moment.
  // (It stays on for the menu button, which opens and closes the
  // side panel.)
  const [sidebarResizing, setSidebarResizing] =
    React.useState(false);

  const sidebarResizeTimerRef = React.useRef(null);

  const handleSidebarWidth = React.useCallback(() => {
    setSidebarResizing(true);

    window.clearTimeout(sidebarResizeTimerRef.current);

    sidebarResizeTimerRef.current = window.setTimeout(
      () => setSidebarResizing(false),
      150
    );
  }, []);

  React.useEffect(() => {
    return () => {
      window.clearTimeout(sidebarResizeTimerRef.current);
    };
  }, []);

  // =======================================================
  // LOGIN TRANSITION
  // =======================================================

  const [isEntering, setIsEntering] =
    React.useState(() => {
      if (typeof window === "undefined") {
        return false;
      }

      return (
        sessionStorage.getItem(
          LOGIN_TRANSITION_KEY
        ) === "true"
      );
    });

  // =======================================================
  // CURRENT USER
  // =======================================================

  const [currentUser, setCurrentUser] =
    React.useState(() =>
      authService.getCurrentUser()
    );

  // =======================================================
  // LOGIN TRANSITION
  // =======================================================

  React.useEffect(() => {
    const cameFromLogin =
      sessionStorage.getItem(
        LOGIN_TRANSITION_KEY
      ) === "true";

    if (!cameFromLogin) {
      return undefined;
    }

    sessionStorage.removeItem(
      LOGIN_TRANSITION_KEY
    );

    const frame =
      window.requestAnimationFrame(() => {
        setIsEntering(false);
      });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  // =======================================================
  // RESPONSIVE SIDEBAR
  // =======================================================

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

  // =======================================================
  // THEME PERSISTENCE
  // =======================================================

  React.useEffect(() => {
    const getCurrentTheme = () => {
      const htmlIsDark =
        document.documentElement.classList.contains(
          "dark"
        );

      const bodyIsDark =
        document.body.classList.contains(
          "dark"
        );

      return htmlIsDark || bodyIsDark
        ? "dark"
        : "light";
    };

    const saveCurrentTheme = () => {
      try {
        localStorage.setItem(
          THEME_STORAGE_KEY,
          getCurrentTheme()
        );
      } catch (error) {
        console.error(
          "Unable to save theme preference:",
          error
        );
      }
    };

    saveCurrentTheme();

    const observer =
      new MutationObserver(() => {
        saveCurrentTheme();
      });

    observer.observe(
      document.documentElement,
      {
        attributes: true,
        attributeFilter: ["class"],
      }
    );

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // =======================================================
  // REFRESH USER FROM BACKEND
  // =======================================================
  //
  // FastAPI/PostgreSQL is the source of truth for:
  // - active status
  // - role
  // - permissions
  //
  // This allows RBAC changes to appear without logout/login.
  // =======================================================

  const refreshCurrentUser =
    React.useCallback(async () => {
      try {
        const latestUser =
          await authService.refreshCurrentUser();

        const storedUser =
          latestUser ||
          authService.getCurrentUser();

        setCurrentUser((previousUser) => {
          if (
            !storedUser &&
            !previousUser
          ) {
            return previousUser;
          }

          if (!storedUser) {
            return null;
          }

          if (!previousUser) {
            return storedUser;
          }

          const previousPermissions =
            JSON.stringify(
              previousUser.permissions || []
            );

          const latestPermissions =
            JSON.stringify(
              storedUser.permissions || []
            );

          const userChanged =
            previousUser.id !==
              storedUser.id ||
            previousUser.username !==
              storedUser.username ||
            previousUser.role !==
              storedUser.role ||
            previousUser.status !==
              storedUser.status ||
            previousUser.is_active !==
              storedUser.is_active ||
            previousPermissions !==
              latestPermissions;

          return userChanged
            ? storedUser
            : previousUser;
        });
      } catch (error) {
        /*
         * Do not destroy the current UI session
         * because of a temporary network failure.
         */
        console.error(
          "Unable to refresh current user:",
          error
        );
      }
    }, []);

  // =======================================================
  // INITIAL + PERIODIC PERMISSION REFRESH
  // =======================================================

  React.useEffect(() => {
    refreshCurrentUser();

    const interval =
      window.setInterval(() => {
        refreshCurrentUser();
      }, PERMISSION_REFRESH_INTERVAL);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshCurrentUser]);

  // =======================================================
  // STORAGE EVENT
  // =======================================================

  React.useEffect(() => {
    const handleStorage = (event) => {
      if (
        event.key ===
          "karwarPortAuthenticated" ||
        event.key ===
          "karwarPortCurrentUser" ||
        event.key ===
          "karwarPortAccessToken"
      ) {
        refreshCurrentUser();
      }
    };

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage
      );
    };
  }, [refreshCurrentUser]);

  // =======================================================
  // MODULE RBAC
  // =======================================================
  //
  // IMPORTANT:
  // PostgreSQL role_permissions is authoritative.
  //
  // Do NOT infer module access from:
  // - username
  // - role name
  // - frontend static roles
  // - granular action permissions
  //
  // Example:
  // cargo permission => Cargo module access
  // cargo.edit alone => NOT Cargo module access
  //
  // [] => NO module access.
  // =======================================================

  const hasModulePermission =
    React.useCallback(
      (moduleKey) => {
        if (
          !currentUser ||
          !moduleKey
        ) {
          return false;
        }

        return Boolean(
          hasModuleAccess(
            currentUser,
            moduleKey
          )
        );
      },
      [currentUser]
    );

  // =======================================================
  // ROUTE RBAC
  // =======================================================
  //
  // IMPORTANT:
  // Every real port module route in routes.js now has
  // a moduleKey matching PostgreSQL.
  //
  // Therefore:
  //
  // route.moduleKey
  //       ↓
  // hasModuleAccess()
  //       ↓
  // PostgreSQL role_permissions
  //
  // Legacy "permission" is used ONLY when moduleKey
  // does not exist.
  // =======================================================

  const hasRoutePermission =
    React.useCallback(
      (route) => {
        if (!currentUser) {
          return false;
        }

        /*
         * PUBLIC ROUTES
         */
        if (
          route?.public === true ||
          route?.requiresPermission === false
        ) {
          return true;
        }

        /*
         * PRIMARY RBAC CHECK
         *
         * moduleKey is authoritative.
         */
        if (
          typeof route?.moduleKey ===
            "string" &&
          route.moduleKey.trim()
        ) {
          return hasModulePermission(
            route.moduleKey
          );
        }

        /*
         * No moduleKey and no permission:
         * allow non-protected routes.
         */
        if (!route?.permission) {
          return true;
        }

        /*
         * Legacy fallback only.
         *
         * This is NOT used by routes that have
         * moduleKey.
         */
        return userHasPermission(
          currentUser,
          route.permission
        );
      },
      [
        currentUser,
        hasModulePermission,
      ]
    );

  // =======================================================
  // CURRENT PAGE TITLE
  // =======================================================

  const getCurrentRouteName =
    React.useCallback(() => {
      const path = location.pathname;

      if (path === "/admin/profile") {
        return "My Profile";
      }

      if (
        path ===
        "/admin/account-settings"
      ) {
        return "Account Settings";
      }

      if (path === "/admin/security") {
        return "Security";
      }

      for (const route of routes) {
        if (
          route?.type === "section" &&
          Array.isArray(route.children)
        ) {
          const match =
            route.children.find((child) => {
              if (
                child?.layout !== "/admin"
              ) {
                return false;
              }

              return (
                path ===
                  `/admin/${child.path}` ||
                path === child.path
              );
            });

          if (match) {
            return match.name;
          }
        }
      }

      return "Port Dashboard";
    }, [location.pathname]);

  // =======================================================
  // PORT SYSTEM ROUTES
  // =======================================================

  const getRoutes =
    React.useCallback(() => {
      const routeElements = [];

      routes.forEach((route) => {
        if (
          route?.type !== "section" ||
          !Array.isArray(route.children)
        ) {
          return;
        }

        route.children.forEach((child) => {
          /*
           * Only /admin routes.
           */
          if (child?.layout !== "/admin") {
            return;
          }

          /*
           * Ignore malformed routes.
           */
          if (!child?.path) {
            return;
          }

          /*
           * Do not render undefined components.
           */
          if (!child?.component) {
            return;
          }

          /*
           * React Router routes inside <Routes>
           * are relative to /admin.
           */
          routeElements.push(
            <Route
              key={`admin-${child.path}`}
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
      });

      return routeElements;
    }, [hasRoutePermission]);

  // =======================================================
  // WHERE "BACK" GOES
  // =======================================================
  //
  // The last normal page the employee was on. If there is none
  // yet (the page was opened directly or refreshed), the first
  // page this account is allowed to open: the Dashboard for most
  // accounts, another page for an account without the Dashboard.

  const firstAllowedPath = React.useMemo(() => {
    for (const route of routes) {
      if (
        route?.type !== "section" ||
        !Array.isArray(route.children)
      ) {
        continue;
      }

      for (const child of route.children) {
        if (
          child?.layout === "/admin" &&
          child?.path &&
          child?.component &&
          hasRoutePermission(child)
        ) {
          return `/admin/${child.path}`;
        }
      }
    }

    return "/admin/default";
  }, [hasRoutePermission]);

  const backPath =
    lastPagePathRef.current || firstAllowedPath;

  // =======================================================
  // DOCUMENT DIRECTION
  // =======================================================

  React.useEffect(() => {
    document.documentElement.dir = "ltr";
  }, []);

  // =======================================================
  // AUTHENTICATION GUARD
  // =======================================================

  if (!currentUser) {
    return (
      <Navigate
        to="/auth/login"
        replace
      />
    );
  }

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div
      className="
        flex
        h-screen
        w-full
        overflow-hidden
        bg-lightPrimary
        dark:bg-navy-900
      "
    >
      {/* =====================================================
          SIDEBAR
          ===================================================== */}

      {/* On My Profile, Account Settings and Security the side
          panel is closed, so it slides out (the same slide as
          the menu button) and the page moves left with it. */}

      <Sidebar
        open={open && !isAccountPage}
        onClose={() => setOpen(false)}
        currentUser={currentUser}
        permissions={
          currentUser?.permissions || []
        }
        permissionMap={
          SIDEBAR_PERMISSION_MAP
        }
        hasModulePermission={
          hasModulePermission
        }
        onWidthChange={handleSidebarWidth}
      />

      {/* =====================================================
          MAIN APPLICATION SHELL
          ===================================================== */}

      <div
        className={`
          h-screen
          min-w-0
          flex-1
          overflow-y-auto
          overflow-x-hidden
          bg-lightPrimary
          dark:bg-navy-900
          ${
            sidebarResizing
              ? ""
              : "transition-[margin-left] duration-200 ease-in-out"
          }
          ${
            open && !isAccountPage
              ? "xl:ml-[var(--sidebar-width,300px)]"
              : "ml-0"
          }
        `}
      >
        {/* =================================================
            MAIN CONTENT WRAPPER
            ================================================= */}

        <main
          className={`
            mx-[12px]
            min-h-screen
            pt-3
            md:pr-2
            transition-all
            duration-[400ms]
            ease-out
            ${
              isEntering
                ? "translate-y-[10px] opacity-0"
                : "translate-y-0 opacity-100"
            }
          `}
        >
          <div className="min-h-screen">
            {/* =========================================
                LOGO ROW (only on My Profile, Account
                Settings and Security, where the side
                panel - which normally holds the logo - is
                hidden). The logo and the Back button both
                return to the page the employee came from.
                ========================================= */}

            {isAccountPage && (
              <div
                data-testid="logo-row"
                className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1"
              >
                <Link
                  to={backPath}
                  data-testid="logo-link"
                  title="Back to the port system"
                  className="flex min-w-0 items-center gap-3"
                >
                  <img
                    src={singaporeHarborLogo}
                    alt="Port of Singapore"
                    className="h-[56px] w-[56px] flex-shrink-0 object-contain"
                  />

                  <div className="min-w-0">
                    <div className="font-poppins text-[18px] font-bold uppercase leading-tight text-navy-700 dark:text-white">
                      PORT OF SINGAPORE
                    </div>

                    <div className="mt-0.5 font-poppins text-[10px] font-medium uppercase leading-tight tracking-wide text-gray-500 dark:text-blue-200">
                      SEA PORT MANAGEMENT
                    </div>
                  </div>
                </Link>

                <Link
                  to={backPath}
                  data-testid="back-link"
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-navy-700"
                >
                  <MdArrowBack className="h-4 w-4" />
                  {backPath === "/admin/default"
                    ? "Back to Dashboard"
                    : "Back"}
                </Link>
              </div>
            )}

            {/* =========================================
                NAVBAR
                ========================================= */}

            <Navbar
              onOpenSidenav={
                isAccountPage
                  ? undefined
                  : () =>
                      setOpen(
                        (previousOpen) =>
                          !previousOpen
                      )
              }
              logoText="Port of Singapore Smart Sea Port Management System"
              brandText={getCurrentRouteName()}
              {...rest}
            />

            {/* =========================================
                PAGE CONTENT
                ========================================= */}

            <div
              className="
                mx-auto
                mb-auto
                min-h-[84vh]
                p-2
                pt-5
                md:pr-2
              "
            >
              <Routes>
                {/* =====================================
                    PORT MODULE ROUTES
                    ===================================== */}

                {getRoutes()}

                {/* =====================================
                    ACCOUNT & SECURITY
                    ===================================== */}

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

                {/* =====================================
                    ADMIN ROOT
                    ===================================== */}

                <Route
                  path="/"
                  element={
                    <Navigate
                      to="default"
                      replace
                    />
                  }
                />

                {/* =====================================
                    UNKNOWN ADMIN PAGE
                    ===================================== */}

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

            {/* =========================================
                FOOTER
                ========================================= */}

            <div className="p-3">
              <Footer />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}