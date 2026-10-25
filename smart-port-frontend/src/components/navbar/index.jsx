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
  MdChatBubbleOutline,
} from "react-icons/md";

import {
  useNavigate,
  Link,
} from "react-router-dom";

import authService from "layouts/auth/authService";

import { apiGet, apiPost } from "services/api";

import {
  isChatPageActive,
  playMessageBeep,
} from "services/messageSound";

import { startPollTimer } from "services/pollTimer";

import {
  PROFILE_EVENT,
  initialsOf,
  loadMyProfile,
} from "services/profile";

const THEME_STORAGE_KEY = "karwarPortTheme";

const LOGOUT_TRANSITION_KEY =
  "karwarPortLogoutTransition";

const LOGOUT_TRANSITION_DURATION = 300;

// =========================================================
// NOTIFICATION BELL
// =========================================================
//
// The number on the bell is the total of:
// - unread chat messages (goes down only when the account
//   opens that conversation in Port Communication)
// - unread notifications
//
// The numbers come from GET /notifications/summary and are
// refreshed every few seconds. The Port Communication and
// Notification pages ask for an instant refresh by sending
// the "singapore-unread-refresh" event.
//

const SUMMARY_REFRESH_MS = 4000;

const UNREAD_EVENT = "singapore-unread-refresh";

const OPEN_CHAT_EVENT = "singapore-open-chat";

const OPEN_CHAT_STORAGE_KEY = "singaporePortOpenChat";

const EMPTY_SUMMARY = {
  unreadMessages: 0,
  unreadNotifications: 0,
  total: 0,
  recent: [],
};

const normalizeSummary = (data) => {
  const unreadMessages =
    Number(data?.unread_messages) || 0;

  const unreadNotifications =
    Number(data?.unread_notifications) || 0;

  return {
    unreadMessages,
    unreadNotifications,
    total: unreadMessages + unreadNotifications,
    recent: Array.isArray(data?.recent)
      ? data.recent
      : [],
  };
};

// Puts the unread number in front of the browser tab name, like
// WhatsApp Web: "(2) Port of Singapore". It can be seen on this tab
// even while you are working in another tab.
const showCountInTabTitle = (count) => {
  try {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");

    document.title =
      count > 0
        ? `(${count > 99 ? "99+" : count}) ${base}`
        : base;
  } catch {
    // Not important.
  }
};

// Times without a time zone are UTC.
const formatTimeAgo = (value) => {
  if (!value) {
    return "";
  }

  let text = String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text) &&
    !/(Z|[+-]\d{2}:?\d{2})$/i.test(text)
  ) {
    text = text.replace(" ", "T") + "Z";
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const minutes = Math.floor(
    (Date.now() - date.getTime()) / 60000
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} h ago`;
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
};

// Finds the real address of a page from the sidebar link,
// so the bell opens the right page whatever the route is
// called. The fallback is used if the link is not found.
const findSidebarPath = (matcher, fallback) => {
  try {
    const links = Array.from(
      document.querySelectorAll("a[href]")
    );

    const found = links.find((link) =>
      matcher.test((link.textContent || "").trim())
    );

    if (found) {
      const href = found.getAttribute("href") || "";

      const path = href.startsWith("#")
        ? href.slice(1)
        : href;

      if (path.startsWith("/")) {
        return path;
      }
    }
  } catch {
    // Use the fallback below.
  }

  return fallback;
};

const Navbar = (props) => {
  const {
    onOpenSidenav,
    brandText,
  } = props;

  const navigate = useNavigate();

  // =========================================================
  // CURRENT USER
  // =========================================================

  const [currentUser, setCurrentUser] =
    React.useState(() =>
      authService.getCurrentUser()
    );

  React.useEffect(() => {
    setCurrentUser(
      authService.getCurrentUser()
    );
  }, []);

  // =========================================================
  // UNREAD COUNT (CHAT MESSAGES + NOTIFICATIONS)
  // =========================================================

  const [summary, setSummary] =
    React.useState(EMPTY_SUMMARY);

  const isSignedIn = !!currentUser;

  // Unread chat messages seen at the last refresh (null = not yet).
  const previousUnreadRef = React.useRef(null);

  React.useEffect(() => {
    if (!isSignedIn) {
      setSummary(EMPTY_SUMMARY);
      previousUnreadRef.current = null;
      showCountInTabTitle(0);

      return undefined;
    }

    let cancelled = false;
    let busy = false;
    let again = false;

    // This keeps running when the browser tab is in the background,
    // so a new message is noticed (and beeps) without switching tabs.
    const load = async () => {
      // A refresh asked for while another one is running is
      // repeated afterwards, so a fresh count is never lost.
      if (busy) {
        again = true;

        return;
      }

      busy = true;

      try {
        const data = await apiGet(
          "/notifications/summary"
        );

        if (!cancelled) {
          const next = normalizeSummary(data);

          // A new chat message beeps, except on the Port
          // Communication page (it plays the sound itself).
          if (
            previousUnreadRef.current !== null &&
            next.unreadMessages > previousUnreadRef.current &&
            !isChatPageActive()
          ) {
            playMessageBeep();
          }

          previousUnreadRef.current = next.unreadMessages;

          setSummary(next);

          showCountInTabTitle(next.total);
        }
      } catch {
        // Keep showing the last known numbers.
      } finally {
        busy = false;

        if (again && !cancelled) {
          again = false;
          load();
        }
      }
    };

    load();

    const stopTimer = startPollTimer(
      load,
      SUMMARY_REFRESH_MS
    );

    window.addEventListener(UNREAD_EVENT, load);
    window.addEventListener("focus", load);
    document.addEventListener(
      "visibilitychange",
      load
    );

    return () => {
      cancelled = true;

      stopTimer();

      showCountInTabTitle(0);

      window.removeEventListener(UNREAD_EVENT, load);
      window.removeEventListener("focus", load);
      document.removeEventListener(
        "visibilitychange",
        load
      );
    };
  }, [isSignedIn]);

  // =========================================================
  // PROFILE (picture and name)
  // =========================================================
  //
  // The picture and the real name of the employee come from the
  // backend (GET /users/me/profile). The Account Settings page
  // sends the "singapore-profile-changed" event after a change,
  // so the new picture shows here at once.

  const [profile, setProfile] = React.useState(null);

  React.useEffect(() => {
    if (!isSignedIn) {
      setProfile(null);

      return undefined;
    }

    let cancelled = false;

    loadMyProfile()
      .then((saved) => {
        if (!cancelled) {
          setProfile(saved);
        }
      })
      .catch(() => {
        // The initials are shown instead.
      });

    const handleProfileChange = (event) => {
      if (event.detail) {
        setProfile(event.detail);
      }
    };

    window.addEventListener(PROFILE_EVENT, handleProfileChange);

    return () => {
      cancelled = true;

      window.removeEventListener(
        PROFILE_EVENT,
        handleProfileChange
      );
    };
  }, [isSignedIn]);

  const displayName =
    profile?.name ||
    currentUser?.name ||
    currentUser?.full_name ||
    "";

  // Closes the bell menu (the dropdown closes when the mouse
  // is pressed anywhere outside of it).
  const closeBellMenu = () => {
    document.body.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true })
    );
  };

  const openChatFromBell = (item) => {
    closeBellMenu();

    try {
      sessionStorage.setItem(
        OPEN_CHAT_STORAGE_KEY,
        String(item.id)
      );
    } catch {
      // Not important.
    }

    navigate(
      findSidebarPath(
        /port\s*communication/i,
        "/admin/port-communication"
      )
    );

    window.dispatchEvent(
      new CustomEvent(OPEN_CHAT_EVENT, {
        detail: { conversationId: item.id },
      })
    );
  };

  const openNotificationsFromBell = (item) => {
    closeBellMenu();

    if (item && item.unread) {
      apiPost(`/notifications/${item.id}/read`, {})
        .then(() => {
          window.dispatchEvent(
            new CustomEvent(UNREAD_EVENT)
          );
        })
        .catch(() => {});
    }

    navigate(
      findSidebarPath(
        /^notifications?\b/i,
        "/admin/notification"
      )
    );
  };

  const markAllNotificationsRead = () => {
    apiPost("/notifications/read-all", {})
      .then(() => {
        window.dispatchEvent(
          new CustomEvent(UNREAD_EVENT)
        );
      })
      .catch(() => {});
  };

  // =========================================================
  // DARK / LIGHT MODE
  // =========================================================

  const [darkmode, setDarkmode] =
    React.useState(() => {
      return (
        localStorage.getItem(
          THEME_STORAGE_KEY
        ) === "dark"
      );
    });

  // =========================================================
  // LOGOUT TRANSITION
  // =========================================================

  const [isLoggingOut, setIsLoggingOut] =
    React.useState(false);

  // =========================================================
  // APPLY THEME
  // =========================================================

  React.useEffect(() => {
    const html =
      document.documentElement;

    const body =
      document.body;

    if (darkmode) {
      html.classList.add("dark");
      body.classList.add("dark");

      localStorage.setItem(
        THEME_STORAGE_KEY,
        "dark"
      );
    } else {
      html.classList.remove("dark");
      body.classList.remove("dark");

      localStorage.setItem(
        THEME_STORAGE_KEY,
        "light"
      );
    }

    window.dispatchEvent(
      new CustomEvent(
        "karwar-theme-change",
        {
          detail: {
            theme: darkmode
              ? "dark"
              : "light",
          },
        }
      )
    );
  }, [darkmode]);

  // =========================================================
  // THEME SYNCHRONIZATION
  // =========================================================

  React.useEffect(() => {
    const handleThemeChange = (
      event
    ) => {
      const nextTheme =
        event.detail?.theme;

      if (
        nextTheme === "dark" ||
        nextTheme === "light"
      ) {
        setDarkmode(
          nextTheme === "dark"
        );
      }
    };

    window.addEventListener(
      "karwar-theme-change",
      handleThemeChange
    );

    return () => {
      window.removeEventListener(
        "karwar-theme-change",
        handleThemeChange
      );
    };
  }, []);

  // =========================================================
  // TOGGLE THEME
  // =========================================================

  const toggleTheme = () => {
    setDarkmode(
      (previous) => !previous
    );
  };

  // =========================================================
  // USER INITIALS
  // =========================================================
  //
  // "John Doe" -> "JD". Shown when the employee has no picture.

  const getInitials = () =>
    initialsOf(displayName || currentUser?.role);

  // =========================================================
  // LOGOUT
  // =========================================================

  const handleLogout = () => {
    if (isLoggingOut) {
      return;
    }

    // Store the transition state before leaving
    // the dashboard so the login page can perform
    // its matching entrance animation.
    sessionStorage.setItem(
      LOGOUT_TRANSITION_KEY,
      "true"
    );

    // Start the dashboard exit animation.
    setIsLoggingOut(true);

    // Keep the existing authentication logout.
    authService.logout();

    setCurrentUser(null);

    // Give the dashboard 300ms to fade out before
    // navigating to the login page.
    window.setTimeout(() => {
      navigate("/auth/login", {
        replace: true,
      });
    }, LOGOUT_TRANSITION_DURATION);
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <nav
      className={`
        relative
        z-[2000]
        flex
        min-h-[77px]
        flex-row
        flex-wrap
        items-center
        justify-between
        rounded-xl
        border
        border-gray-200
        bg-white
        p-2
        shadow-lg
        shadow-gray-300/30
        transition-all
        duration-300
        ease-out
        dark:border-white/10
        dark:bg-[#0b1437]
        dark:shadow-[0_8px_25px_rgba(0,0,0,0.35)]
        ${
          isLoggingOut
            ? "scale-[0.99] opacity-0"
            : "scale-100 opacity-100"
        }
      `}
    >
      {/* =================================================
          PAGE TITLE
          ================================================= */}

          <p
        className="
          shrink
          text-[33px]
          font-bold
          capitalize
          text-navy-700
          transition-colors
          duration-200
          dark:text-white
        "
      >
        {brandText}
      </p>

      {/* =================================================
          ACTIONS
          ================================================= */}

      <div
        className="
          relative
          z-[2001]
          mt-[3px]
          flex
          h-[61px]
          items-center
          justify-around
          gap-4
          rounded-full
          bg-gray-100
          px-4
          py-2
          shadow-md
          shadow-gray-300/30
          transition-colors
          duration-200
          dark:bg-[#111c46]
          dark:shadow-[0_6px_20px_rgba(0,0,0,0.25)]
        "
      >
        {/* =================================================
            SIDEBAR TOGGLE
            ================================================= */}

        {/* Pages without a side panel (My Profile, Account
            Settings, Security) do not give this button. */}

        {onOpenSidenav && (
          <button
            type="button"
            className="
              flex
              cursor-pointer
              items-center
              justify-center
              text-xl
              text-gray-600
              transition
              duration-200
              hover:text-navy-700
              dark:text-gray-200
              dark:hover:text-white
            "
            onClick={onOpenSidenav}
            title="Toggle navigation"
            aria-label="Toggle navigation"
            disabled={isLoggingOut}
          >
            <FiAlignJustify
              className="h-5 w-5"
            />
          </button>
        )}

        {/* =================================================
            NOTIFICATIONS
            ================================================= */}

        <Dropdown
          button={
            <p
              className="relative cursor-pointer"
              title={
                summary.total > 0
                  ? `Notifications (${summary.total} unread)`
                  : "Notifications"
              }
            >
              <IoMdNotificationsOutline
                className="
                  h-5
                  w-5
                  text-gray-600
                  transition-colors
                  duration-200
                  dark:text-gray-200
                "
              />

              {/* The number is always shown: red when there is
                  something unread, grey "0" when there is not. */}
              <span
                data-testid="bell-badge"
                data-count={summary.total}
                className={`
                  absolute
                  -right-2
                  -top-2
                  flex
                  h-4
                  min-w-[16px]
                  items-center
                  justify-center
                  rounded-full
                  px-1
                  text-[10px]
                  font-bold
                  leading-none
                  text-white
                  ${
                    summary.total > 0
                      ? "bg-red-500"
                      : "bg-gray-400 dark:bg-gray-500"
                  }
                `}
              >
                {summary.total > 99
                  ? "99+"
                  : summary.total}
              </span>
            </p>
          }
          animation="
            origin-[65%_0%]
            md:origin-top-right
            transition-all
            duration-300
            ease-in-out
          "
          children={
            <div
              className="
                flex
                w-[360px]
                flex-col
                gap-3
                rounded-[20px]
                bg-white
                p-4
                shadow-xl
                shadow-gray-300/30
                dark:!bg-navy-700
                dark:text-white
                dark:shadow-none
                sm:w-[460px]
              "
            >
              <div
                className="
                  flex
                  items-center
                  justify-between
                "
              >
                <p
                  className="
                    text-base
                    font-bold
                    text-navy-700
                    dark:text-white
                  "
                >
                  Notifications
                </p>

                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  disabled={
                    summary.unreadNotifications === 0
                  }
                  title="Marks notifications as read. Chat messages are cleared when you open the chat."
                  className="
                    text-sm
                    font-bold
                    text-navy-700
                    hover:text-brand-500
                    disabled:cursor-not-allowed
                    disabled:opacity-40
                    dark:text-white
                  "
                >
                  Mark all read
                </button>
              </div>

              {/* RECENT MESSAGES AND NOTIFICATIONS */}

              <div
                className="
                  flex
                  max-h-[360px]
                  flex-col
                  gap-3
                  overflow-y-auto
                "
              >
                {summary.recent.length === 0 && (
                  <p
                    className="
                      py-6
                      text-center
                      text-sm
                      text-gray-500
                      dark:text-gray-300
                    "
                  >
                    You are all caught up.
                  </p>
                )}

                {summary.recent.map((item) => {
                  const isMessage =
                    item.kind === "message";

                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      type="button"
                      data-testid="bell-item"
                      data-kind={item.kind}
                      onClick={() =>
                        isMessage
                          ? openChatFromBell(item)
                          : openNotificationsFromBell(
                              item
                            )
                      }
                      className="
                        flex
                        w-full
                        items-center
                      "
                    >
                      <div
                        className="
                          flex
                          h-full
                          w-[85px]
                          items-center
                          justify-center
                          rounded-xl
                          bg-gradient-to-b
                          from-brandLinear
                          to-brand-500
                          py-4
                          text-2xl
                          text-white
                        "
                      >
                        {isMessage ? (
                          <MdChatBubbleOutline />
                        ) : (
                          <BsArrowBarUp />
                        )}
                      </div>

                      <div
                        className="
                          ml-2
                          flex
                          h-full
                          w-full
                          flex-col
                          justify-center
                          rounded-lg
                          px-1
                          text-sm
                        "
                      >
                        <div
                          className="
                            mb-1
                            flex
                            items-center
                            justify-between
                            gap-2
                          "
                        >
                          <p
                            className="
                              text-left
                              text-base
                              font-bold
                              text-gray-900
                              dark:text-white
                            "
                          >
                            {item.title}
                          </p>

                          {(isMessage ||
                            item.unread) && (
                            <span
                              className="
                                flex
                                h-5
                                min-w-[20px]
                                flex-shrink-0
                                items-center
                                justify-center
                                rounded-full
                                bg-red-500
                                px-1.5
                                text-[10px]
                                font-bold
                                text-white
                              "
                            >
                              {isMessage
                                ? item.count || 1
                                : "new"}
                            </span>
                          )}
                        </div>

                        <p
                          className="
                            line-clamp-2
                            text-left
                            text-xs
                            text-gray-900
                            dark:text-white
                          "
                        >
                          {item.text}
                        </p>

                        <p
                          className="
                            mt-1
                            text-left
                            text-[11px]
                            text-gray-500
                            dark:text-gray-300
                          "
                        >
                          {formatTimeAgo(
                            item.created_at
                          )}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() =>
                  openNotificationsFromBell(null)
                }
                className="
                  w-full
                  rounded-xl
                  bg-gray-100
                  py-2
                  text-sm
                  font-bold
                  text-navy-700
                  transition
                  hover:bg-gray-200
                  dark:bg-white/10
                  dark:text-white
                  dark:hover:bg-white/20
                "
              >
                View all notifications
              </button>
            </div>
          }
          classNames="
            py-2
            top-4
            -left-[230px]
            md:-left-[440px]
            w-max
          "
        />

        {/* =================================================
            DARK / LIGHT MODE
            ================================================= */}

        <button
          type="button"
          className="
            cursor-pointer
            text-gray-600
            transition
            duration-200
            hover:text-navy-700
            dark:text-gray-200
            dark:hover:text-white
          "
          onClick={toggleTheme}
          title={
            darkmode
              ? "Switch to light mode"
              : "Switch to dark mode"
          }
          aria-label={
            darkmode
              ? "Switch to light mode"
              : "Switch to dark mode"
          }
          disabled={isLoggingOut}
        >
          {darkmode ? (
            <RiSunFill
              className="h-5 w-5"
            />
          ) : (
            <RiMoonFill
              className="h-5 w-5"
            />
          )}
        </button>

        {/* =================================================
            PROFILE
            ================================================= */}

        <Dropdown
          button={
            <button
              type="button"
              data-testid="profile-button"
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                overflow-hidden
                rounded-full
                bg-brand-500
                text-xs
                font-bold
                text-white
                shadow-md
                transition
                hover:bg-brand-600
              "
              title={
                displayName
                  ? `${displayName} (${
                      currentUser?.role || "Port User"
                    })`
                  : currentUser?.role || "Port User"
              }
              disabled={isLoggingOut}
            >
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitials()
              )}
            </button>
          }
          children={
            <div
              className="
                flex
                w-64
                flex-col
                justify-start
                rounded-[20px]
                bg-white
                bg-cover
                bg-no-repeat
                shadow-xl
                shadow-gray-300/30
                dark:!bg-navy-700
                dark:text-white
                dark:shadow-none
              "
            >
              {/* USER INFORMATION */}

              <div className="flex items-center gap-3 px-5 py-4">
                <div
                  className="
                    flex
                    h-10
                    w-10
                    shrink-0
                    items-center
                    justify-center
                    overflow-hidden
                    rounded-full
                    bg-brand-500
                    text-xs
                    font-bold
                    text-white
                  "
                >
                  {profile?.avatar ? (
                    <img
                      src={profile.avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials()
                  )}
                </div>

                <div className="min-w-0">
                  <p
                    data-testid="menu-name"
                    className="
                      truncate
                      text-sm
                      font-bold
                      text-navy-700
                      dark:text-white
                    "
                  >
                    {displayName ||
                      currentUser?.role ||
                      "Port User"}
                  </p>

                  <p
                    data-testid="menu-role"
                    className="
                      mt-1
                      truncate
                      text-xs
                      text-gray-500
                      dark:text-gray-400
                    "
                  >
                    {currentUser?.role ||
                      "Port User"}
                  </p>
                </div>
              </div>

              {/* DIVIDER */}

              <div
                className="
                  h-px
                  w-full
                  bg-gray-200
                  dark:bg-white/20
                "
              />

              {/* ACCOUNT OPTIONS */}

              <div
                className="
                  flex
                  flex-col
                  py-2
                "
              >
                {/* MY PROFILE */}

                <Link
                  to="/admin/profile"
                  className="
                    flex
                    w-full
                    items-center
                    gap-3
                    px-5
                    py-3
                    text-left
                    text-sm
                    font-medium
                    text-gray-800
                    transition
                    hover:bg-gray-50
                    dark:text-white
                    dark:hover:bg-navy-600
                  "
                >
                  <MdPersonOutline
                    className="
                      h-5
                      w-5
                      text-gray-500
                      dark:text-gray-300
                    "
                  />

                  <span>
                    My Profile
                  </span>
                </Link>

                {/* ACCOUNT SETTINGS */}

                <Link
                  to="/admin/account-settings"
                  className="
                    flex
                    w-full
                    items-center
                    gap-3
                    px-5
                    py-3
                    text-left
                    text-sm
                    font-medium
                    text-gray-800
                    transition
                    hover:bg-gray-50
                    dark:text-white
                    dark:hover:bg-navy-600
                  "
                >
                  <MdSettings
                    className="
                      h-5
                      w-5
                      text-gray-500
                      dark:text-gray-300
                    "
                  />

                  <span>
                    Account Settings
                  </span>
                </Link>

                {/* SECURITY */}

                <Link
                  to="/admin/security"
                  className="
                    flex
                    w-full
                    items-center
                    gap-3
                    px-5
                    py-3
                    text-left
                    text-sm
                    font-medium
                    text-gray-800
                    transition
                    hover:bg-gray-50
                    dark:text-white
                    dark:hover:bg-navy-600
                  "
                >
                  <MdSecurity
                    className="
                      h-5
                      w-5
                      text-gray-500
                      dark:text-gray-300
                    "
                  />

                  <span>
                    Security
                  </span>
                </Link>
              </div>

              {/* LOGOUT */}

              <div
                className="
                  border-t
                  border-gray-200
                  py-2
                  dark:border-white/20
                "
              >
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="
                    w-full
                    px-5
                    py-3
                    text-left
                    text-sm
                    font-medium
                    text-red-500
                    transition
                    hover:bg-red-50
                    hover:text-red-600
                    disabled:cursor-not-allowed
                    disabled:opacity-60
                    dark:hover:bg-red-500/10
                  "
                >
                  {isLoggingOut
                    ? "Logging Out..."
                    : "Log Out"}
                </button>
              </div>
            </div>
          }
          classNames="
            py-2
            top-8
            -left-[200px]
            w-max
          "
        />
      </div>
    </nav>
  );
};

export default Navbar;