/* eslint-disable */

import React from "react";
import { Link, useLocation } from "react-router-dom";
import DashIcon from "components/icons/DashIcon";
import { MdKeyboardArrowDown } from "react-icons/md";

import authService from "layouts/auth/authService";
import { userHasPermission } from "layouts/auth/permissions";

// =========================================================
// SIDEBAR LINKS
// =========================================================

export function SidebarLinks(props) {
  const location = useLocation();
  const { routes } = props;

  const [openSections, setOpenSections] = React.useState({});

  // =======================================================
  // CHECK PERMISSION
  // =======================================================

  const hasPermission = (route) => {
    if (!route.permission) {
      return true;
    }

    const user = authService.getCurrentUser();

    if (!user) {
      return false;
    }

    return userHasPermission(user, route.permission);
  };

  // =======================================================
  // CREATE ROUTE PATH
  // =======================================================

  const getRoutePath = (route) => {
    return `${route.layout}/${route.path}`.replace(/\/+/g, "/");
  };

  // =======================================================
  // CHECK ACTIVE ROUTE
  // =======================================================

  const activeRoute = (route) => {
    const routePath = getRoutePath(route);

    if (location.pathname === routePath) {
      return true;
    }

    if (
      route.layout === "/admin" &&
      route.path === "default" &&
      location.pathname === "/admin"
    ) {
      return true;
    }

    return false;
  };

  // =======================================================
  // GET ACCESSIBLE CHILDREN
  // =======================================================

  const getAccessibleChildren = (children) => {
    if (!children) {
      return [];
    }

    return children.filter((route) => hasPermission(route));
  };

  // =======================================================
  // CHECK ACTIVE ROUTE IN SECTION
  // =======================================================

  const sectionHasActiveRoute = (children) => {
    return children.some((route) => activeRoute(route));
  };

  // =======================================================
  // AUTOMATICALLY OPEN ACTIVE SECTION
  // =======================================================

  React.useEffect(() => {
    const updatedSections = {};

    routes.forEach((route) => {
      if (route.type === "section") {
        const accessibleChildren = getAccessibleChildren(
          route.children
        );

        updatedSections[route.name] =
          sectionHasActiveRoute(accessibleChildren);
      }
    });

    setOpenSections((previous) => ({
      ...previous,
      ...updatedSections,
    }));
  }, [location.pathname, routes]);

  // =======================================================
  // TOGGLE SECTION
  // =======================================================

  const toggleSection = (sectionName) => {
    setOpenSections((previous) => ({
      ...previous,
      [sectionName]: !previous[sectionName],
    }));
  };

  // =======================================================
  // CREATE NORMAL ROUTE
  // =======================================================

  const createRoute = (route, index) => {
    if (!hasPermission(route)) {
      return null;
    }

    if (
      route.layout !== "/admin" &&
      route.layout !== "/auth" &&
      route.layout !== "/rtl"
    ) {
      return null;
    }

    const isActive = activeRoute(route);
    const routePath = getRoutePath(route);

    return (
      <Link
        key={index}
        to={routePath}
        className="block"
      >
        <div className="relative mb-3 flex hover:cursor-pointer">

          {isActive && (
            <div className="absolute left-0 top-1/2 h-12 w-1 -translate-y-1/2 rounded-r-lg bg-brand-500 dark:bg-brand-400" />
          )}

          <li className="my-[3px] flex w-full cursor-pointer items-center px-8">

            <span
              className={
                isActive
                  ? "font-bold text-brand-500 dark:text-brand-400"
                  : "font-medium text-gray-600 dark:text-gray-300"
              }
            >
              {route.icon ? route.icon : <DashIcon />}
            </span>

            <p
              className={`leading-1 ml-4 flex ${
                isActive
                  ? "font-bold text-navy-700 dark:text-white"
                  : "font-medium text-gray-600 dark:text-gray-300"
              }`}
            >
              {route.name}
            </p>

          </li>

        </div>
      </Link>
    );
  };

  // =========================================================
  // CREATE DROPDOWN SECTION
  // =========================================================

  const createSection = (section, index) => {
    const accessibleChildren = getAccessibleChildren(
      section.children
    );

    // Hide entire section if nothing is accessible
    if (accessibleChildren.length === 0) {
      return null;
    }

    const isOpen = openSections[section.name];

    const hasActiveRoute =
      sectionHasActiveRoute(accessibleChildren);

    return (
      <div
        key={index}
        className="mb-2"
      >

        {/* SECTION HEADER */}

        <button
          type="button"
          onClick={() => toggleSection(section.name)}
          className={`flex w-full items-center justify-between px-8 py-3 text-left transition ${
            hasActiveRoute
              ? "text-brand-500 dark:text-brand-400"
              : "text-gray-500 dark:text-gray-300"
          }`}
        >

          <div className="flex items-center">

            {section.icon && (
              <span className="flex items-center">
                {section.icon}
              </span>
            )}

            <span
              className={`ml-3 text-xs font-bold uppercase tracking-wider ${
                hasActiveRoute
                  ? "text-brand-500 dark:text-brand-400"
                  : "text-gray-500 dark:text-gray-300"
              }`}
            >
              {section.name}
            </span>

          </div>

          <MdKeyboardArrowDown
            className={`h-5 w-5 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />

        </button>

        {/* DROPDOWN CONTENT */}

        <div
          className={`overflow-hidden transition-all duration-200 ${
            isOpen
              ? "max-h-[1000px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >

          <div className="mt-1">

            {accessibleChildren.map(
              (route, childIndex) =>
                createRoute(
                  route,
                  `${index}-${childIndex}`
                )
            )}

          </div>

        </div>

      </div>
    );
  };

  // =========================================================
  // CREATE ALL SIDEBAR ITEMS
  // =========================================================

  const createLinks = () => {
    return routes.map((route, index) => {

      if (route.type === "section") {
        return createSection(route, index);
      }

      return createRoute(route, index);
    });
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="w-full">
      {createLinks()}
    </div>
  );
}

export default SidebarLinks;