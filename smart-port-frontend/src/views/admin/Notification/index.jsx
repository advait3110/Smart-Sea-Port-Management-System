import React from "react";

import {
  MdNotifications,
  MdWarning,
  MdInfo,
  MdCheckCircle,
  MdError,
  MdDeleteOutline,
  MdDoneAll,
  MdClose,
  MdRefresh,
  MdErrorOutline,
  MdChatBubbleOutline,
} from "react-icons/md";

import { useNavigate } from "react-router-dom";

import {
  apiGet,
  apiPost,
  apiDelete,
} from "../../../services/api";

import { startPollTimer } from "../../../services/pollTimer";

// =========================================================
// NOTIFICATIONS
// =========================================================
//
// Port Management & Monitoring System
//
// - Notifications come from the backend (PostgreSQL)
// - Each account has its own read / unread state
// - The list refreshes itself every few seconds, also while
//   this browser tab is in the background
// - Unread chat messages (from Port Communication) are listed
//   here too and counted in the Unread number, the same number
//   as on the bell. They clear when the chat is opened.
// - Mark one or all as read, dismiss one, or clear all
//   (this applies to notifications, not to chat messages)
// - The unread counter on the bell (top right) is updated
//   through the "singapore-unread-refresh" event
//
// Backend endpoints used:
//   GET    /notifications
//   GET    /notifications/summary   (unread chat messages)
//   POST   /notifications/{id}/read
//   POST   /notifications/read-all
//   DELETE /notifications/{id}
//   DELETE /notifications
//
// =========================================================

const REFRESH_MS = 4000;

const UNREAD_EVENT = "singapore-unread-refresh";

const OPEN_CHAT_EVENT = "singapore-open-chat";

const OPEN_CHAT_STORAGE_KEY = "singaporePortOpenChat";

const FILTERS = ["All", "Unread"];

// =========================================================
// HELPERS
// =========================================================

const getErrorMessage = (error, fallback) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error?.detail) {
    if (typeof error.detail === "string") {
      return error.detail;
    }

    try {
      return JSON.stringify(error.detail);
    } catch {
      return fallback;
    }
  }

  return fallback;
};

// Times without a time zone are UTC.
const parseDate = (value) => {
  if (!value) {
    return null;
  }

  let text = String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text) &&
    !/(Z|[+-]\d{2}:?\d{2})$/i.test(text)
  ) {
    text = text.replace(" ", "T") + "Z";
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date;
};

const formatRelativeTime = (value, now) => {
  const date = parseDate(value);

  if (!date) {
    return "";
  }

  const seconds = Math.max(
    0,
    Math.floor((now - date.getTime()) / 1000)
  );

  if (seconds < 45) {
    return "Just now";
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(hours / 24);

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const normalizeType = (type) =>
  ["warning", "success", "error"].includes(type) ? type : "info";

const normalizeNotification = (raw) => ({
  id: raw.id,
  type: normalizeType(raw.type),
  category: raw.category || "",
  title: raw.title || "Notification",
  message: raw.message || "",
  createdAt: raw.created_at,
  unread: !raw.is_read,
});

// One chat that has unread messages, shown like a notification.
const normalizeMessageItem = (raw) => ({
  id: `chat-${raw.id}`,
  chatId: raw.id,
  isMessage: true,
  type: "message",
  category: "Port Communication",
  title: raw.title || "New message",
  message: raw.text || "",
  count: Number(raw.count) || 1,
  createdAt: raw.created_at,
  unread: true,
});

// Finds the real address of a page from the sidebar link.
const findSidebarPath = (matcher, fallback) => {
  try {
    const links = Array.from(document.querySelectorAll("a[href]"));

    const found = links.find((link) =>
      matcher.test((link.textContent || "").trim())
    );

    if (found) {
      const href = found.getAttribute("href") || "";

      const path = href.startsWith("#") ? href.slice(1) : href;

      if (path.startsWith("/")) {
        return path;
      }
    }
  } catch {
    // Use the fallback below.
  }

  return fallback;
};

const notifyUnreadChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent(UNREAD_EVENT));
  } catch {
    // Not important.
  }
};

// =========================================================
// ICON HELPER
// =========================================================

const getNotificationIcon = (type) => {
  if (type === "message") {
    return <MdChatBubbleOutline className="h-6 w-6" />;
  }

  if (type === "warning") {
    return <MdWarning className="h-6 w-6" />;
  }

  if (type === "success") {
    return <MdCheckCircle className="h-6 w-6" />;
  }

  if (type === "error") {
    return <MdError className="h-6 w-6" />;
  }

  return <MdInfo className="h-6 w-6" />;
};

// =========================================================
// STYLE HELPER
// =========================================================

const getNotificationStyle = (type) => {
  if (type === "message") {
    return {
      icon: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300",
      badge:
        "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300",
    };
  }

  if (type === "warning") {
    return {
      icon: "bg-orange-50 text-orange-500 dark:bg-orange-500/10",
      badge:
        "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300",
    };
  }

  if (type === "success") {
    return {
      icon: "bg-green-50 text-green-500 dark:bg-green-500/10",
      badge:
        "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-300",
    };
  }

  if (type === "error") {
    return {
      icon: "bg-red-50 text-red-500 dark:bg-red-500/10",
      badge:
        "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-300",
    };
  }

  return {
    icon: "bg-blue-50 text-blue-500 dark:bg-blue-500/10",
    badge:
      "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
  };
};

// =========================================================
// MAIN COMPONENT
// =========================================================

const Notification = () => {
  const navigate = useNavigate();

  const [notifications, setNotifications] = React.useState([]);

  // Chats with unread messages, and how many messages that is.
  const [messageItems, setMessageItems] = React.useState([]);
  const [unreadMessages, setUnreadMessages] = React.useState(0);

  const [loadState, setLoadState] = React.useState("loading");
  const [loadError, setLoadError] = React.useState("");
  const [actionError, setActionError] = React.useState("");
  const [connectionLost, setConnectionLost] = React.useState(false);

  const [activeFilter, setActiveFilter] = React.useState("All");
  const [now, setNow] = React.useState(Date.now());

  const mountedRef = React.useRef(true);
  const busyRef = React.useRef(false);
  const notificationsRef = React.useRef([]);

  notificationsRef.current = notifications;

  React.useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // -------------------------------------------------------
  // LOAD
  // -------------------------------------------------------

  const loadNotifications = React.useCallback(async () => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;

    try {
      // The unread chat messages come from the same summary as the
      // bell. If it cannot be read, the notifications still show.
      const [data, summary] = await Promise.all([
        apiGet("/notifications"),
        apiGet("/notifications/summary").catch(() => null),
      ]);

      if (!mountedRef.current) {
        return;
      }

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.notifications)
        ? data.notifications
        : [];

      setNotifications(list.map(normalizeNotification));

      if (summary) {
        const chats = Array.isArray(summary.messages)
          ? summary.messages
          : Array.isArray(summary.recent)
          ? summary.recent.filter((item) => item.kind === "message")
          : [];

        const items = chats.map(normalizeMessageItem);

        setMessageItems(items);

        setUnreadMessages(
          summary.unread_messages === undefined ||
            summary.unread_messages === null
            ? items.reduce((total, item) => total + item.count, 0)
            : Number(summary.unread_messages) || 0
        );
      }
      setLoadState("ready");
      setLoadError("");
      setConnectionLost(false);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      if (notificationsRef.current.length === 0) {
        setLoadState("error");
        setLoadError(
          getErrorMessage(
            error,
            "Notifications could not be loaded."
          )
        );
      } else {
        setConnectionLost(true);
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Refresh automatically, and keep "5 minutes ago" correct.
  // The refresh keeps its pace when this browser tab is in the
  // background, so a new message is listed without switching tabs.
  React.useEffect(() => {
    const stopRefresh = startPollTimer(() => {
      loadNotifications();
    }, REFRESH_MS);

    const clock = window.setInterval(
      () => setNow(Date.now()),
      30000
    );

    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        loadNotifications();
        setNow(Date.now());
      }
    };

    // The chat page and the bell say when the numbers changed.
    const handleUnreadChanged = () => {
      loadNotifications();
    };

    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener(UNREAD_EVENT, handleUnreadChanged);

    return () => {
      stopRefresh();
      window.clearInterval(clock);
      document.removeEventListener(
        "visibilitychange",
        handleVisible
      );
      window.removeEventListener(UNREAD_EVENT, handleUnreadChanged);
    };
  }, [loadNotifications]);

  // -------------------------------------------------------
  // UNREAD COUNT
  // -------------------------------------------------------

  // Notifications that are unread (these can be marked as read here).
  const unreadNotificationCount = notifications.filter(
    (notification) => notification.unread
  ).length;

  // The number shown on this page: the same as on the bell
  // (unread notifications + unread chat messages).
  const unreadCount = unreadNotificationCount + unreadMessages;

  // Chats with unread messages and notifications, newest first.
  const allRows = [...messageItems, ...notifications].sort(
    (first, second) =>
      (parseDate(second.createdAt)?.getTime() || 0) -
      (parseDate(first.createdAt)?.getTime() || 0)
  );

  const visibleNotifications =
    activeFilter === "Unread"
      ? allRows.filter((row) => row.unread)
      : allRows;

  const openChat = (row) => {
    try {
      window.sessionStorage.setItem(
        OPEN_CHAT_STORAGE_KEY,
        String(row.chatId)
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
        detail: { conversationId: row.chatId },
      })
    );
  };

  // -------------------------------------------------------
  // ACTIONS (instant on screen, undone if the server refuses)
  // -------------------------------------------------------

  const runAction = async (apply, request, failureText) => {
    const before = notificationsRef.current;

    setActionError("");
    setNotifications(apply(before));

    try {
      await request();

      notifyUnreadChanged();
    } catch (error) {
      if (mountedRef.current) {
        setNotifications(before);
        setActionError(getErrorMessage(error, failureText));
      }
    }
  };

  const markAsRead = (notification) => {
    if (!notification.unread) {
      return;
    }

    runAction(
      (list) =>
        list.map((item) =>
          item.id === notification.id
            ? { ...item, unread: false }
            : item
        ),
      () => apiPost(`/notifications/${notification.id}/read`, {}),
      "The notification could not be marked as read."
    );
  };

  const markAllAsRead = () => {
    runAction(
      (list) => list.map((item) => ({ ...item, unread: false })),
      () => apiPost("/notifications/read-all", {}),
      "The notifications could not be marked as read."
    );
  };

  const dismissNotification = (notification) => {
    runAction(
      (list) => list.filter((item) => item.id !== notification.id),
      () => apiDelete(`/notifications/${notification.id}`),
      "The notification could not be removed."
    );
  };

  const clearAll = () => {
    if (notifications.length === 0) {
      return;
    }

    if (
      !window.confirm(
        "Remove all of your notifications? This only clears them for your account."
      )
    ) {
      return;
    }

    runAction(
      () => [],
      () => apiDelete("/notifications"),
      "The notifications could not be cleared."
    );
  };

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------

  return (
    <div className="mt-3">
      {/* PAGE HEADER */}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              <MdNotifications className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
                Notifications
              </h1>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                Port operational notifications, system alerts and
                unread messages.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connectionLost && (
            <span className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
              <MdRefresh className="h-4 w-4 animate-spin" />
              Reconnecting...
            </span>
          )}

          <div className="rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-navy-800">
            <span className="text-xs text-gray-400">Unread</span>

            <span
              className="ml-2 font-bold text-indigo-600 dark:text-indigo-300"
              data-testid="notification-unread"
            >
              {unreadCount}
            </span>
          </div>

          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadNotificationCount === 0}
            title="Marks the notifications as read. Chat messages clear when you open the chat."
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MdDoneAll className="h-5 w-5" />
            Mark all read
          </button>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-500 dark:bg-red-500/10"
        >
          <span>{actionError}</span>

          <button
            type="button"
            onClick={() => setActionError("")}
            aria-label="Dismiss"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* NOTIFICATION CONTAINER */}

      <div className="overflow-hidden rounded-[20px] bg-white shadow-sm dark:bg-navy-800">
        {/* HEADER */}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/10">
          <div>
            <p className="font-bold text-navy-700 dark:text-white">
              Port Notifications
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Updated automatically
            </p>
          </div>

          <div className="flex items-center gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                  activeFilter === filter
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-300"
                }`}
              >
                {filter}

                {filter === "Unread" && unreadCount > 0 && (
                  <span className="ml-1.5">{unreadCount}</span>
                )}
              </button>
            ))}

            <button
              type="button"
              onClick={clearAll}
              disabled={notifications.length === 0}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-500/10"
            >
              <MdDeleteOutline className="h-5 w-5" />
              Clear all
            </button>
          </div>
        </div>

        {/* NOTIFICATIONS */}

        <div className="max-h-[620px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-indigo-400/40 hover:scrollbar-thumb-indigo-500">
          {loadState === "loading" && (
            <div className="flex min-h-[320px] items-center justify-center text-sm text-gray-400">
              Loading notifications...
            </div>
          )}

          {loadState === "error" && (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <MdErrorOutline className="mb-3 h-10 w-10 text-red-400" />

              <h3 className="font-bold text-navy-700 dark:text-white">
                Notifications are not available
              </h3>

              <p className="mt-1 max-w-md text-sm text-gray-400">
                {loadError}
              </p>

              <button
                type="button"
                onClick={() => {
                  setLoadState("loading");
                  loadNotifications();
                }}
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
              >
                Try again
              </button>
            </div>
          )}

          {loadState === "ready" &&
            visibleNotifications.length === 0 && (
              <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">
                  <MdNotifications className="h-8 w-8" />
                </div>

                <h3 className="font-bold text-navy-700 dark:text-white">
                  {activeFilter === "Unread" && allRows.length > 0
                    ? "No unread notifications"
                    : "No notifications"}
                </h3>

                <p className="mt-1 max-w-md text-sm text-gray-400">
                  {activeFilter === "Unread" && allRows.length > 0
                    ? "You have read everything."
                    : "There are currently no notifications for your account."}
                </p>
              </div>
            )}

          {loadState === "ready" &&
            visibleNotifications.map((notification) => {
              const style = getNotificationStyle(notification.type);

              const isMessage = !!notification.isMessage;

              const open = () =>
                isMessage
                  ? openChat(notification)
                  : markAsRead(notification);

              return (
                <div
                  key={notification.id}
                  role="button"
                  tabIndex={0}
                  data-testid={isMessage ? "message-row" : "notification-row"}
                  data-unread={notification.unread ? "true" : "false"}
                  onClick={open}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open();
                    }
                  }}
                  className={`group flex w-full cursor-pointer items-start gap-4 border-b border-gray-100 px-5 py-5 text-left transition last:border-b-0 dark:border-white/5 ${
                    notification.unread
                      ? "bg-indigo-50/40 dark:bg-indigo-500/5"
                      : "hover:bg-gray-50 dark:hover:bg-navy-700"
                  }`}
                >
                  {/* ICON */}

                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${style.icon}`}
                  >
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* CONTENT */}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-navy-700 dark:text-white">
                          {notification.title}
                        </p>

                        {notification.unread && (
                          <span className="h-2 w-2 rounded-full bg-indigo-600" />
                        )}
                      </div>

                      <span className="flex-shrink-0 text-xs text-gray-400">
                        {formatRelativeTime(notification.createdAt, now)}
                      </span>
                    </div>

                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-gray-500 dark:text-gray-300">
                      {notification.message}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${style.badge}`}
                      >
                        {notification.type}
                      </span>

                      {notification.category && (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase text-gray-500 dark:bg-white/10 dark:text-gray-300">
                          {notification.category}
                        </span>
                      )}

                      {isMessage && (
                        <span
                          data-testid="message-row-count"
                          className="rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold uppercase text-white"
                        >
                          {notification.count} new{" "}
                          {notification.count === 1 ? "message" : "messages"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* DISMISS (notifications only; chats clear when opened) */}

                  {!isMessage && (
                    <button
                      type="button"
                      title="Remove this notification"
                      aria-label="Remove this notification"
                      onClick={(event) => {
                        event.stopPropagation();
                        dismissNotification(notification);
                      }}
                      className="flex-shrink-0 rounded-full p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                    >
                      <MdClose className="h-5 w-5" />
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* INFORMATION */}

      <div className="mt-5 rounded-[20px] border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-500/20 dark:bg-navy-800">
        <div className="flex items-start gap-3">
          <MdNotifications className="mt-0.5 h-6 w-6 flex-shrink-0 text-indigo-500" />

          <div>
            <p className="font-bold text-indigo-700 dark:text-indigo-300">
              About notifications
            </p>

            <p className="mt-1 text-sm leading-6 text-indigo-600 dark:text-indigo-200">
              Notifications are created by the port system when
              something needs your attention. Each account has its
              own read and unread status, so reading a notification
              does not change it for anyone else. Unread chat messages
              from Port Communication are listed here too and counted
              in the Unread number and on the bell at the top; they
              clear when you open the chat.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notification;