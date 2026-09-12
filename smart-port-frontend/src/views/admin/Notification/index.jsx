import React from "react";

import {
  MdNotifications,
  MdWarning,
  MdInfo,
  MdCheckCircle,
  MdError,
  MdDeleteOutline,
  MdDoneAll,
} from "react-icons/md";

// =========================================================
// NOTIFICATIONS
// =========================================================
//
// Karwar Port Smart Sea Port Management & Monitoring System
//
// Current version:
// - Operational notifications
// - Alert severity
// - Read/unread state
// - Notification categories
// - Clear all
//
// Future:
// FastAPI → WebSocket → PostgreSQL
//
// =========================================================

const initialNotifications = [
  {
    id: 1,
    type: "warning",
    title: "Berth 04 Maintenance",
    message:
      "Berth 04 is currently unavailable due to scheduled maintenance.",
    time: "10 minutes ago",
    unread: true,
  },

  {
    id: 2,
    type: "info",
    title: "MV Ocean Pearl Arrived",
    message:
      "MV Ocean Pearl has arrived near the harbour and is awaiting berth instructions.",
    time: "25 minutes ago",
    unread: true,
  },

  {
    id: 3,
    type: "warning",
    title: "Gate Queue Increased",
    message:
      "8 trucks are currently waiting at the Main Port Gate.",
    time: "42 minutes ago",
    unread: true,
  },

  {
    id: 4,
    type: "success",
    title: "Cargo Documentation Completed",
    message:
      "Cargo documentation for MV Karwar Star has been reviewed successfully.",
    time: "1 hour ago",
    unread: false,
  },

  {
    id: 5,
    type: "error",
    title: "Operational Review Required",
    message:
      "Operational review is required for the current vessel movement.",
    time: "2 hours ago",
    unread: false,
  },
];

// =========================================================
// ICON HELPER
// =========================================================

const getNotificationIcon = (type) => {
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
  const [notifications, setNotifications] =
    React.useState(initialNotifications);

  // -------------------------------------------------------
  // UNREAD COUNT
  // -------------------------------------------------------

  const unreadCount = notifications.filter(
    (notification) => notification.unread
  ).length;

  // -------------------------------------------------------
  // MARK AS READ
  // -------------------------------------------------------

  const markAsRead = (id) => {
    setNotifications((previous) =>
      previous.map((notification) =>
        notification.id === id
          ? {
              ...notification,
              unread: false,
            }
          : notification
      )
    );
  };

  // -------------------------------------------------------
  // MARK ALL AS READ
  // -------------------------------------------------------

  const markAllAsRead = () => {
    setNotifications((previous) =>
      previous.map((notification) => ({
        ...notification,
        unread: false,
      }))
    );
  };

  // -------------------------------------------------------
  // CLEAR ALL
  // -------------------------------------------------------

  const clearAll = () => {
    setNotifications([]);
  };

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------

  return (
    <div className="mt-3">

      {/* =================================================
          PAGE HEADER
          ================================================= */}

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
                Port operational notifications and system alerts.
              </p>

            </div>

          </div>

        </div>

        <div className="flex items-center gap-2">

          <div className="rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-navy-800">

            <span className="text-xs text-gray-400">
              Unread
            </span>

            <span className="ml-2 font-bold text-indigo-600 dark:text-indigo-300">
              {unreadCount}
            </span>

          </div>

          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MdDoneAll className="h-5 w-5" />
            Mark all read
          </button>

        </div>

      </div>

      {/* =================================================
          NOTIFICATION CONTAINER
          ================================================= */}

      <div className="overflow-hidden rounded-[20px] bg-white shadow-sm dark:bg-navy-800">

        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10">

          <div>

            <p className="font-bold text-navy-700 dark:text-white">
              Port Notifications
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Real-time operational updates
            </p>

          </div>

          <button
            onClick={clearAll}
            disabled={notifications.length === 0}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-500/10"
          >
            <MdDeleteOutline className="h-5 w-5" />
            Clear all
          </button>

        </div>

        {/* NOTIFICATIONS */}

        <div className="max-h-[620px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-indigo-400/40 hover:scrollbar-thumb-indigo-500">

          {notifications.length === 0 ? (

            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">

              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">

                <MdNotifications className="h-8 w-8" />

              </div>

              <h3 className="font-bold text-navy-700 dark:text-white">
                No notifications
              </h3>

              <p className="mt-1 max-w-md text-sm text-gray-400">
                There are currently no operational notifications.
              </p>

            </div>

          ) : (

            notifications.map((notification) => {

              const style = getNotificationStyle(
                notification.type
              );

              return (

                <button
                  key={notification.id}
                  onClick={() =>
                    markAsRead(notification.id)
                  }
                  className={`flex w-full items-start gap-4 border-b border-gray-100 px-5 py-5 text-left transition last:border-b-0 dark:border-white/5 ${
                    notification.unread
                      ? "bg-indigo-50/40 dark:bg-indigo-500/5"
                      : "hover:bg-gray-50 dark:hover:bg-navy-700"
                  }`}
                >

                  {/* ICON */}

                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${style.icon}`}
                  >
                    {getNotificationIcon(
                      notification.type
                    )}
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
                        {notification.time}
                      </span>

                    </div>

                    <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-300">
                      {notification.message}
                    </p>

                    <div className="mt-3">

                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${style.badge}`}
                      >
                        {notification.type}
                      </span>

                    </div>

                  </div>

                </button>

              );

            })

          )}

        </div>

      </div>

      {/* =================================================
          INFORMATION
          ================================================= */}

      <div className="mt-5 rounded-[20px] border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-500/20 dark:bg-navy-800">

        <div className="flex items-start gap-3">

          <MdNotifications className="mt-0.5 h-6 w-6 flex-shrink-0 text-indigo-500" />

          <div>

            <p className="font-bold text-indigo-700 dark:text-indigo-300">
              Operational Notifications
            </p>

            <p className="mt-1 text-sm leading-6 text-indigo-600 dark:text-indigo-200">
              This notification center is currently using
              demonstration data. In the production system,
              notifications can be delivered through FastAPI
              WebSocket connections and stored in PostgreSQL.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
};

export default Notification;