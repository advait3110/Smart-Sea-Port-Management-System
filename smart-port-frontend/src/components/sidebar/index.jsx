/* eslint-disable */
import React from "react";
import { Link } from "react-router-dom";
import { HiX } from "react-icons/hi";
import Links from "./components/Links";
import singaporeHarborLogo from "assets/img/port/singapore-harbor.png";
import SidebarCard from "components/sidebar/componentsrtl/SidebarCard";
import routes from "routes.js";

/*
 * ============================================================
 * SIDEBAR CONFIGURATION
 * ============================================================
 */

const SIDEBAR_WIDTH = 300;
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 480;

/*
 * ============================================================
 * BACKEND RBAC MODULE MAP
 * ============================================================
 *
 * These MUST exactly match the permission keys stored in
 * PostgreSQL and returned by /auth/me.
 */

const SIDEBAR_PERMISSION_MAP = {
  "/admin/default": "dashboard",
  "/admin/port-map": "port_map",
  "/admin/weather": "weather",
  "/admin/vessels": "vessels",
  "/admin/berths": "berths",
  "/admin/cargo": "cargo",
  "/admin/gate": "gate_trucks",
  "/admin/port-communication": "port_communication",
  "/admin/notifications": "notifications",
  "/admin/alerts": "port_alerts",
  "/admin/incidents": "incidents",
  "/admin/asset-maintenance": "asset_maintenance",
  "/admin/analytics": "analytics",
  "/admin/documents": "documents",
  "/admin/audit-logs": "audit_logs",
  "/admin/user-role-management": "user_role_management",
};

/*
 * ============================================================
 * NORMALIZE PATH
 * ============================================================
 */

const normalizePath = (path) => {
  if (!path || typeof path !== "string") {
    return "";
  }

  let normalized = path.trim().toLowerCase();

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  // Remove trailing forward slashes.
  normalized = normalized.replace(/\/+$/, "");

  if (normalized === "") {
    return "/admin";
  }

  if (!normalized.startsWith("/admin/") && normalized !== "/admin") {
    normalized = `/admin${normalized}`;
  }

  return normalized;
};

/*
 * ============================================================
 * GET MODULE KEY
 * ============================================================
 *
 * Backend moduleKey is preferred. This prevents frontend
 * permission names from accidentally granting access.
 */

const getRouteModuleKey = (route) => {
  if (!route || typeof route !== "object") {
    return null;
  }

  // 1. Explicit moduleKey from routes.js
  if (typeof route.moduleKey === "string" && route.moduleKey.trim()) {
    return route.moduleKey.trim().toLowerCase();
  }

  // 2. Exact path lookup
  if (route.path) {
    const normalizedPath = normalizePath(route.path);

    if (SIDEBAR_PERMISSION_MAP[normalizedPath]) {
      return SIDEBAR_PERMISSION_MAP[normalizedPath];
    }
  }

  return null;
};

/*
 * ============================================================
 * CHECK ROUTE ACCESS
 * ============================================================
 *
 * PostgreSQL / FastAPI RBAC is authoritative.
 *
 * - [] means NO access.
 * - Missing permission means NO access.
 * - Port Administrator access is handled by
 *   hasModulePermission() from the admin layout.
 */

const routeHasPermission = (route, hasModulePermission) => {
  // Public routes remain visible.
  if (route?.public === true || route?.requiresPermission === false) {
    return true;
  }

  // Section labels themselves do not require permission.
  // Their children are checked separately.
  if (route?.type === "section" && !Array.isArray(route.children)) {
    return true;
  }

  const moduleKey = getRouteModuleKey(route);

  // Not an actual module route: preserve it.
  if (!moduleKey) {
    return true;
  }

  // No permission function = deny protected route.
  if (typeof hasModulePermission !== "function") {
    return false;
  }

  // ONLY backend module permission decides access.
  return Boolean(hasModulePermission(moduleKey));
};

/*
 * ============================================================
 * FILTER ROUTES BY RBAC
 * ============================================================
 */

const filterRoutesByPermission = (routeList, hasModulePermission) => {
  if (!Array.isArray(routeList)) {
    return [];
  }

  return routeList
    .map((route) => {
      if (!route) {
        return null;
      }

      // SECTION
      if (route.type === "section" && Array.isArray(route.children)) {
        const filteredChildren = filterRoutesByPermission(
          route.children,
          hasModulePermission
        );

        // Hide empty sections.
        if (filteredChildren.length === 0) {
          return null;
        }

        return { ...route, children: filteredChildren };
      }

      // NESTED ROUTE
      if (Array.isArray(route.children)) {
        const filteredChildren = filterRoutesByPermission(
          route.children,
          hasModulePermission
        );

        if (filteredChildren.length === 0) {
          return null;
        }

        return { ...route, children: filteredChildren };
      }

      // LEAF ROUTE
      return routeHasPermission(route, hasModulePermission) ? route : null;
    })
    .filter(Boolean);
};

/*
 * ============================================================
 * SIDEBAR
 * ============================================================
 */

const Sidebar = ({
  open,
  onClose,
  currentUser,
  permissions = [],
  permissionMap = SIDEBAR_PERMISSION_MAP,
  hasModulePermission,
  permissionVersion,
  onWidthChange, // optional: (widthInPx) => void
}) => {
  /* DOM references */
  const sidebarRef = React.useRef(null);
  const trackRef = React.useRef(null);
  const thumbRef = React.useRef(null);

  /* Scroll position */
  const lastScrollTopRef = React.useRef(0);
  const sidebarInitializedRef = React.useRef(false);

  /* Scrollbar state */
  const [scrollState, setScrollState] = React.useState({
    height: 100,
    visible: false,
  });
  const [scrollbarHovered, setScrollbarHovered] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  const dragStart = React.useRef({ y: 0, top: 0 });

  /*
   * ==========================================================
   * ADJUSTABLE SIDEBAR WIDTH
   * ==========================================================
   */

  const [sidebarWidth, setSidebarWidth] = React.useState(SIDEBAR_WIDTH);
  const [resizingSidebar, setResizingSidebar] = React.useState(false);

  React.useEffect(() => {
    if (!resizingSidebar) return undefined;

    const handlePointerMove = (event) => {
      setSidebarWidth(
        Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, event.clientX))
      );
    };
    const handlePointerUp = () => setResizingSidebar(false);

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingSidebar]);

  // Publish the width so the admin layout can reflow the main content.
  // CSS: margin-left: var(--sidebar-width)
  React.useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${sidebarWidth}px`
    );

    if (typeof onWidthChange === "function") {
      onWidthChange(sidebarWidth);
    }
  }, [sidebarWidth, onWidthChange]);

  /*
   * ==========================================================
   * PERMISSION FUNCTION
   * ==========================================================
   *
   * Assigned during render (not in an effect) so the memo below
   * never reads a stale permission function.
   */

  const hasModulePermissionRef = React.useRef(hasModulePermission);
  hasModulePermissionRef.current = hasModulePermission;

  /* Permission signature */
  const permissionSignature = React.useMemo(() => {
    const list = Array.isArray(permissions) ? permissions : [];

    return [...list]
      .map((permission) => String(permission).trim().toLowerCase())
      .sort()
      .join("|");
  }, [permissions]);

  /* Permission-aware routes */
  const visibleRoutes = React.useMemo(() => {
    // Keep these values participating in the dependency calculation.
    void currentUser;
    void permissionMap;
    void permissionVersion;

    return filterRoutesByPermission(routes, hasModulePermissionRef.current);
  }, [permissionSignature, permissionVersion, hasModulePermission]);

  /*
   * ==========================================================
   * UPDATE CUSTOM SCROLLBAR
   * ==========================================================
   */

  const updateScrollbar = React.useCallback(() => {
    const sidebar = sidebarRef.current;
    const thumb = thumbRef.current;

    if (!sidebar) {
      return;
    }

    const { scrollHeight, clientHeight, scrollTop } = sidebar;

    lastScrollTopRef.current = scrollTop;

    // No scrolling required.
    if (scrollHeight <= clientHeight) {
      if (thumb) {
        thumb.style.display = "none";
        thumb.style.transform = "translate3d(0, 0, 0)";
      }

      setScrollState((previous) => {
        if (previous.visible === false && previous.height === clientHeight) {
          return previous;
        }

        return { height: clientHeight, visible: false };
      });

      return;
    }

    // Thumb height
    const calculatedThumbHeight = (clientHeight / scrollHeight) * clientHeight;
    const thumbHeight = Math.max(80, calculatedThumbHeight);

    // Thumb position
    const maxThumbTop = Math.max(0, clientHeight - thumbHeight);
    const maxScrollTop = scrollHeight - clientHeight;
    const scrollRatio = maxScrollTop > 0 ? scrollTop / maxScrollTop : 0;
    const thumbTop = scrollRatio * maxThumbTop;

    // Direct DOM update
    if (thumb) {
      thumb.style.display = "block";
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translate3d(0, ${thumbTop}px, 0)`;
    }

    // Only update React if necessary
    setScrollState((previous) => {
      if (
        previous.visible === true &&
        Math.abs(previous.height - thumbHeight) < 0.5
      ) {
        return previous;
      }

      return { height: thumbHeight, visible: true };
    });
  }, []);

  /*
   * ==========================================================
   * INITIALIZE SCROLLBAR
   * ==========================================================
   */

  React.useEffect(() => {
    const sidebar = sidebarRef.current;

    if (!sidebar) {
      return undefined;
    }

    if (sidebarInitializedRef.current) {
      sidebar.scrollTop = lastScrollTopRef.current;
    } else {
      lastScrollTopRef.current = sidebar.scrollTop;
      sidebarInitializedRef.current = true;
    }

    updateScrollbar();

    const handleScroll = () => {
      lastScrollTopRef.current = sidebar.scrollTop;
      updateScrollbar();
    };

    const handleResize = () => {
      updateScrollbar();
    };

    sidebar.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => {
      updateScrollbar();
    });

    resizeObserver.observe(sidebar);

    return () => {
      sidebar.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, [updateScrollbar]);

  /*
   * ==========================================================
   * RESTORE SCROLL POSITION AFTER RBAC UPDATE
   * ==========================================================
   */

  React.useLayoutEffect(() => {
    const sidebar = sidebarRef.current;

    if (!sidebar) {
      return;
    }

    const previousScrollTop = lastScrollTopRef.current;

    if (previousScrollTop <= 0) {
      updateScrollbar();
      return;
    }

    const maximumScrollTop = Math.max(
      0,
      sidebar.scrollHeight - sidebar.clientHeight
    );

    const restoredScrollTop = Math.min(previousScrollTop, maximumScrollTop);

    sidebar.scrollTop = restoredScrollTop;
    lastScrollTopRef.current = restoredScrollTop;

    updateScrollbar();
  }, [visibleRoutes, updateScrollbar]);

  /*
   * ==========================================================
   * UPDATE WHEN SIDEBAR OPENS
   * ==========================================================
   */

  React.useEffect(() => {
    if (!open) {
      setDragging(false);
      setScrollbarHovered(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const sidebar = sidebarRef.current;

      if (sidebar) {
        const maximumScrollTop = Math.max(
          0,
          sidebar.scrollHeight - sidebar.clientHeight
        );

        const restoredScrollTop = Math.min(
          lastScrollTopRef.current,
          maximumScrollTop
        );

        sidebar.scrollTop = restoredScrollTop;
        lastScrollTopRef.current = restoredScrollTop;
      }

      updateScrollbar();
    }, 100);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, updateScrollbar]);

  /*
   * ==========================================================
   * HANDLE THUMB DRAGGING
   * ==========================================================
   */

  React.useEffect(() => {
    if (!dragging) {
      return undefined;
    }

    const handleMouseMove = (event) => {
      const sidebar = sidebarRef.current;

      if (!sidebar) {
        return;
      }

      const movement = event.clientY - dragStart.current.y;
      const newTop = dragStart.current.top + movement;

      const maxTop = Math.max(0, sidebar.clientHeight - scrollState.height);
      const boundedTop = Math.max(0, Math.min(maxTop, newTop));
      const scrollRatio = maxTop > 0 ? boundedTop / maxTop : 0;

      sidebar.scrollTop =
        scrollRatio * (sidebar.scrollHeight - sidebar.clientHeight);

      lastScrollTopRef.current = sidebar.scrollTop;
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, scrollState.height]);

  /*
   * ==========================================================
   * START THUMB DRAGGING
   * ==========================================================
   */

  const handleThumbMouseDown = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const sidebar = sidebarRef.current;

    if (!sidebar) {
      return;
    }

    const { scrollHeight, clientHeight, scrollTop } = sidebar;

    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    const maxThumbTop = Math.max(0, clientHeight - scrollState.height);

    const currentThumbTop =
      maxScrollTop > 0 && maxThumbTop > 0
        ? (scrollTop / maxScrollTop) * maxThumbTop
        : 0;

    setDragging(true);

    dragStart.current = {
      y: event.clientY,
      top: currentThumbTop,
    };
  };

  /*
   * ==========================================================
   * CLICK SCROLLBAR TRACK
   * ==========================================================
   */

  const handleTrackClick = (event) => {
    const sidebar = sidebarRef.current;
    const track = trackRef.current;

    if (!sidebar || !track) {
      return;
    }

    if (event.target !== track) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const clickPosition = event.clientY - rect.top;

    const maxTop = Math.max(0, sidebar.clientHeight - scrollState.height);

    let newTop = clickPosition - scrollState.height / 2;
    newTop = Math.max(0, Math.min(maxTop, newTop));

    const scrollRatio = maxTop > 0 ? newTop / maxTop : 0;

    sidebar.scrollTop =
      scrollRatio * (sidebar.scrollHeight - sidebar.clientHeight);

    lastScrollTopRef.current = sidebar.scrollTop;
  };

  /*
   * ==========================================================
   * CUSTOM SCROLLBAR WHEEL
   * ==========================================================
   */

  const handleScrollbarWheel = (event) => {
    const sidebar = sidebarRef.current;

    if (!sidebar) {
      return;
    }

    event.preventDefault();

    sidebar.scrollTop += event.deltaY;
    lastScrollTopRef.current = sidebar.scrollTop;
  };

  /*
   * ==========================================================
   * SIDEBAR HOVER
   * ==========================================================
   */

  const handleSidebarMouseEnter = () => {
    if (scrollState.visible) {
      setScrollbarHovered(true);
    }
  };

  const handleSidebarMouseLeave = () => {
    if (!dragging) {
      setScrollbarHovered(false);
    }
  };

  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <>
      {/* SIDEBAR */}
      <aside
        className={`group fixed left-0 top-0 z-[1000] h-screen transition-transform duration-200 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* SCROLLABLE SIDEBAR */}
        <div
          ref={sidebarRef}
          onMouseEnter={handleSidebarMouseEnter}
          onMouseLeave={handleSidebarMouseLeave}
          className="karwar-sidebar relative flex h-screen flex-col overflow-y-auto bg-white pb-10 text-navy-700 transition-colors duration-200 dark:bg-[#111D4A] dark:text-white"
          style={{
            width: `${sidebarWidth}px`,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            overscrollBehavior: "contain",
          }}
        >
          {/* HIDE NATIVE SCROLLBAR */}
          <style>
            {`
              .karwar-sidebar::-webkit-scrollbar {
                width: 0;
                height: 0;
                display: none;
              }

              .karwar-sidebar {
                scrollbar-width: none;
                -ms-overflow-style: none;
              }
            `}
          </style>

          {/* MOBILE CLOSE BUTTON */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="absolute right-4 top-4 z-[20] flex cursor-pointer items-center justify-center rounded-full p-1 text-gray-600 transition hover:bg-gray-100 dark:text-white dark:hover:bg-white/10 xl:hidden"
          >
            <HiX className="h-6 w-6" />
          </button>

          {/* SINGAPORE PORT BRANDING */}
          <Link
            to="/admin/default"
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey) {
                event.preventDefault();

                window.open("/auth/login", "_blank", "noopener,noreferrer");
              }
            }}
            className="mx-[12px] mt-[20px] block h-[110px] flex-shrink-0 cursor-pointer"
            title="Go to Port of Singapore Dashboard"
          >
            <div className="flex h-full items-center gap-2">
              <img
                src={singaporeHarborLogo}
                alt="Port of Singapore"
                className="h-[96px] w-[96px] flex-shrink-0 object-contain"
              />

              <div className="min-w-0 flex-1 pr-6 xl:pr-0">
                <div className="break-words font-poppins text-[16px] font-bold uppercase leading-tight text-navy-700 transition-colors duration-200 dark:text-white">
                  PORT OF SINGAPORE
                </div>

                <div className="mt-1 font-poppins text-[9px] font-medium uppercase leading-tight tracking-wide text-gray-500 transition-colors duration-200 dark:text-blue-200">
                  SEA PORT MANAGEMENT
                </div>
              </div>
            </div>
          </Link>

          {/* DIVIDER */}
          <div className="mx-0 mb-7 mt-[24px] h-px flex-shrink-0 bg-gray-300 transition-colors duration-200 dark:bg-white/20" />

          {/* NAVIGATION */}
          <ul className="mb-auto flex-shrink-0 pt-1">
            <Links routes={visibleRoutes} />
          </ul>

          {/* SIDEBAR CARD */}
          <div className="mt-6 flex flex-shrink-0 justify-center">
            <SidebarCard />
          </div>
        </div>

        {/* CUSTOM GRADIENT SCROLLBAR
            (offset left so it does not sit under the resize handle) */}
        {scrollState.visible && open && (
          <div
            ref={trackRef}
            onMouseDown={handleTrackClick}
            onWheel={handleScrollbarWheel}
            onMouseEnter={() => setScrollbarHovered(true)}
            onMouseLeave={() => {
              if (!dragging) {
                setScrollbarHovered(false);
              }
            }}
            className="pointer-events-auto fixed top-0 z-[1100] h-screen w-[8px] cursor-pointer"
            style={{ left: `${sidebarWidth - 16}px` }}
          >
            {/* GRADIENT THUMB */}
            <div
              ref={thumbRef}
              onMouseDown={handleThumbMouseDown}
              className={`absolute left-[1px] top-0 w-[6px] rounded-full bg-gradient-to-b from-[#2563EB] via-[#38BDF8] to-[#67E8F9] shadow-[0_0_7px_rgba(56,189,248,0.45)] transition-opacity duration-200 ${
                scrollbarHovered || dragging ? "opacity-100" : "opacity-0"
              } ${
                dragging
                  ? "cursor-grabbing shadow-[0_0_12px_rgba(56,189,248,0.7)]"
                  : "cursor-grab"
              }`}
              style={{ height: `${scrollState.height}px` }}
            />
          </div>
        )}

        {/* RESIZE HANDLE */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize sidebar"
          onPointerDown={(event) => {
            event.preventDefault();
            setResizingSidebar(true);
          }}
          className="absolute right-0 top-0 z-[1200] h-full w-[6px] cursor-col-resize touch-none bg-transparent transition-colors hover:bg-blue-400/60"
          style={{ touchAction: "none" }}
        />
      </aside>

      {/* MOBILE BACKDROP */}
      {open && (
        <div
          className="fixed inset-0 z-[900] bg-black/40 xl:hidden"
          onClick={onClose}
        />
      )}
    </>
  );
};

export default Sidebar;