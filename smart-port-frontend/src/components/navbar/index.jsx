import React from "react";
import Dropdown from "components/dropdown";
import { FiAlignJustify } from "react-icons/fi";
import { BsArrowBarUp } from "react-icons/bs";
import { RiMoonFill, RiSunFill } from "react-icons/ri";
import { IoMdNotificationsOutline } from "react-icons/io";
import {
  MdPersonOutline,
  MdSettings,
  MdSecurity,
} from "react-icons/md";
import {
  useNavigate,
  Link,
} from "react-router-dom";

import authService from "layouts/auth/authService";

// =========================================================
// NAVBAR
// =========================================================

const Navbar = (props) => {
  const {
    onOpenSidenav,
    brandText,
  } = props;

  const navigate = useNavigate();

  // =======================================================
  // CURRENT USER
  // =======================================================

  const [currentUser, setCurrentUser] =
    React.useState(() =>
      authService.getCurrentUser()
    );

  React.useEffect(() => {
    setCurrentUser(
      authService.getCurrentUser()
    );
  }, []);

  // =======================================================
  // DARK / LIGHT MODE
  // =======================================================

  const [darkmode, setDarkmode] =
    React.useState(() => {
      return (
        localStorage.getItem(
          "karwar-port-theme"
        ) === "dark"
      );
    });

  React.useEffect(() => {
    if (darkmode) {
      document.documentElement.classList.add(
        "dark"
      );

      document.body.classList.add("dark");

      localStorage.setItem(
        "karwar-port-theme",
        "dark"
      );
    } else {
      document.documentElement.classList.remove(
        "dark"
      );

      document.body.classList.remove("dark");

      localStorage.setItem(
        "karwar-port-theme",
        "light"
      );
    }
  }, [darkmode]);

  const toggleTheme = () => {
    setDarkmode(
      (previous) => !previous
    );
  };

  // =======================================================
  // USER INITIALS
  // =======================================================

  const getInitials = (user) => {
    if (!user) {
      return "PU";
    }

    const roleInitials = {
      "Port Administrator": "PA",
      "Marine Officer": "MO",
      "Port Manager": "PM",
      "Cargo Officer": "CO",
      "Gate & Security Officer": "GS",
      "Maintenance Officer": "MT",
      Executive: "PE",
    };

    if (roleInitials[user.role]) {
      return roleInitials[user.role];
    }

    if (!user.name) {
      return "PU";
    }

    const words = user.name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 1) {
      return words[0]
        .substring(0, 2)
        .toUpperCase();
    }

    return (
      words[0][0] +
      words[words.length - 1][0]
    ).toUpperCase();
  };

  // =======================================================
  // LOGOUT
  // =======================================================

  const handleLogout = () => {
    authService.logout();

    setCurrentUser(null);

    navigate("/auth/login", {
      replace: true,
    });
  };

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <nav className="relative z-40 flex flex-row flex-wrap items-center justify-between rounded-xl bg-white/10 p-2 backdrop-blur-xl dark:bg-[#0b14374d]">

      {/* =================================================
          PAGE TITLE
          ================================================= */}

      <div className="ml-[6px]">
        <p className="shrink text-[33px] capitalize text-navy-700 dark:text-white">
          {brandText}
        </p>
      </div>

      {/* =================================================
          ACTIONS
          ================================================= */}

      <div className="relative mt-[3px] flex h-[61px] items-center justify-around gap-4 rounded-full bg-white px-4 py-2 shadow-xl shadow-shadow-500 dark:!bg-navy-800 dark:shadow-none">

        {/* =================================================
            MOBILE SIDEBAR
            ================================================= */}

        <span
          className="flex cursor-pointer text-xl text-gray-600 dark:text-white xl:hidden"
          onClick={onOpenSidenav}
          title="Open navigation"
        >
          <FiAlignJustify className="h-5 w-5" />
        </span>

        {/* =================================================
            NOTIFICATIONS
            ================================================= */}

        <Dropdown
          button={
            <p
              className="cursor-pointer"
              title="Notifications"
            >
              <IoMdNotificationsOutline className="h-5 w-5 text-gray-600 dark:text-white" />
            </p>
          }

          animation="origin-[65%_0%] md:origin-top-right transition-all duration-300 ease-in-out"

          children={
            <div className="flex w-[360px] flex-col gap-3 rounded-[20px] bg-white p-4 shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white dark:shadow-none sm:w-[460px]">

              <div className="flex items-center justify-between">

                <p className="text-base font-bold text-navy-700 dark:text-white">
                  Notifications
                </p>

                <button
                  type="button"
                  className="text-sm font-bold text-navy-700 hover:text-brand-500 dark:text-white"
                >
                  Mark all read
                </button>

              </div>

              <button
                type="button"
                className="flex w-full items-center"
              >

                <div className="flex h-full w-[85px] items-center justify-center rounded-xl bg-gradient-to-b from-brandLinear to-brand-500 py-4 text-2xl text-white">
                  <BsArrowBarUp />
                </div>

                <div className="ml-2 flex h-full w-full flex-col justify-center rounded-lg px-1 text-sm">

                  <p className="mb-1 text-left text-base font-bold text-gray-900 dark:text-white">
                    Port System Notification
                  </p>

                  <p className="text-left text-xs text-gray-900 dark:text-white">
                    New operational information is available.
                  </p>

                </div>

              </button>

              <button
                type="button"
                className="flex w-full items-center"
              >

                <div className="flex h-full w-[85px] items-center justify-center rounded-xl bg-gradient-to-b from-brandLinear to-brand-500 py-4 text-2xl text-white">
                  <BsArrowBarUp />
                </div>

                <div className="ml-2 flex h-full w-full flex-col justify-center rounded-lg px-1 text-sm">

                  <p className="mb-1 text-left text-base font-bold text-gray-900 dark:text-white">
                    Port Operations Update
                  </p>

                  <p className="text-left text-xs text-gray-900 dark:text-white">
                    Check the dashboard for recent updates.
                  </p>

                </div>

              </button>

            </div>
          }

          classNames="py-2 top-4 -left-[230px] md:-left-[440px] w-max"
        />

        {/* =================================================
            DARK / LIGHT MODE
            ================================================= */}

        <button
          type="button"
          className="cursor-pointer text-gray-600 dark:text-white"
          onClick={toggleTheme}
          title={
            darkmode
              ? "Switch to light mode"
              : "Switch to dark mode"
          }
        >
          {darkmode ? (
            <RiSunFill className="h-5 w-5 text-gray-600 dark:text-white" />
          ) : (
            <RiMoonFill className="h-5 w-5 text-gray-600 dark:text-white" />
          )}
        </button>

        {/* =================================================
            PROFILE
            ================================================= */}

        <Dropdown
          button={
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white shadow-md transition hover:bg-brand-600"
              title={
                currentUser?.role ||
                "Port User"
              }
            >
              {getInitials(currentUser)}
            </button>
          }

          children={
            <div className="flex w-64 flex-col justify-start rounded-[20px] bg-white bg-cover bg-no-repeat shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white dark:shadow-none">

              {/* USER INFORMATION */}

              <div className="px-5 py-4">

                <p className="text-sm font-bold text-navy-700 dark:text-white">
                  {currentUser?.role ||
                    "Port User"}
                </p>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {currentUser?.department ||
                    "Port Administration"}
                </p>

              </div>

              {/* DIVIDER */}

              <div className="h-px w-full bg-gray-200 dark:bg-white/20" />

              {/* ACCOUNT OPTIONS */}

              <div className="flex flex-col py-2">

                {/* MY PROFILE */}

                <Link
                  to="/admin/profile"
                  className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-medium text-gray-800 transition hover:bg-gray-50 dark:text-white dark:hover:bg-navy-600"
                >
                  <MdPersonOutline className="h-5 w-5 text-gray-500 dark:text-gray-300" />

                  <span>
                    My Profile
                  </span>
                </Link>

                {/* ACCOUNT SETTINGS */}

                <Link
                  to="/admin/account-settings"
                  className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-medium text-gray-800 transition hover:bg-gray-50 dark:text-white dark:hover:bg-navy-600"
                >
                  <MdSettings className="h-5 w-5 text-gray-500 dark:text-gray-300" />

                  <span>
                    Account Settings
                  </span>
                </Link>

                {/* SECURITY */}

                <Link
                  to="/admin/security"
                  className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-medium text-gray-800 transition hover:bg-gray-50 dark:text-white dark:hover:bg-navy-600"
                >
                  <MdSecurity className="h-5 w-5 text-gray-500 dark:text-gray-300" />

                  <span>
                    Security
                  </span>
                </Link>

              </div>

              {/* LOGOUT */}

              <div className="border-t border-gray-200 py-2 dark:border-white/20">

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full px-5 py-3 text-left text-sm font-medium text-red-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                >
                  Log Out
                </button>

              </div>

            </div>
          }

          classNames="py-2 top-8 -left-[200px] w-max"
        />

      </div>
    </nav>
  );
};

export default Navbar;