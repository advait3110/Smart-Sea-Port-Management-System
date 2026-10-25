import React from "react";

import { createPortal } from "react-dom";

import {
  MdSecurity,
  MdCheckCircle,
  MdAccessTime,
  MdPeople,
  MdLock,
  MdClose,
  MdSave,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";

import authService from "layouts/auth/authService";

import { apiGet, apiPut } from "services/api";

import { initialsOf } from "services/profile";

// =========================================================
// SECURITY
// =========================================================
//
// Every employee:
//   - sees the status of their own account and session
//   - can change their own password
//
// Only the Port Administrator also sees:
//   - how many accounts are online right now ("Accounts Online")
//   - the list of those accounts ("Active Sessions")
//
// "Online" comes from the SERVER (GET /users/online): an account
// is online while its browser is open, signed in and talking to
// the backend. The accounts are matched by id, never by name.
// An account that is open in two windows counts once.
//
// The backend refuses GET /users and GET /users/online for every
// other role, so this part is not only hidden: it is protected.

const ONLINE_REFRESH_MS = 10000;

const MIN_PASSWORD = 8;

const MAX_PASSWORD = 72;

const isAdministratorRole = (roleName) =>
  String(roleName || "")
    .trim()
    .toLowerCase() === "port administrator";

const normalizeUser = (user) => ({
  id: user.id,
  name: user.name || "",
  adminId: user.admin_id || "",
  role: user.role || "",
  isActive: user.is_active !== false,
});

const formatClock = (date) => {
  if (!date) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const ModalPortal = ({ children }) => {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
};

const OverviewCard = ({ icon, label, value, note, tone }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-navy-900">
    <p
      className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${
        tone || "text-gray-400"
      }`}
    >
      {icon}
      {label}
    </p>

    <p className="mt-2 text-xl font-bold text-navy-700 dark:text-white">
      {value}
    </p>

    {note && (
      <p className="mt-1 text-[11px] text-gray-400">{note}</p>
    )}
  </div>
);

const inputClass =
  "w-full rounded-xl bg-gray-50 px-4 py-3 pr-12 text-sm text-navy-700 outline-none transition focus:ring-2 focus:ring-brand-500 dark:bg-navy-700 dark:text-white";

const Security = () => {
  const [currentUser] = React.useState(() =>
    authService.getCurrentUser()
  );

  const isAdmin = isAdministratorRole(currentUser?.role);

  const accountActive = currentUser?.is_active !== false;

  const [notice, setNotice] = React.useState("");

  // =======================================================
  // ACCOUNTS ONLINE (Port Administrator only)
  // =======================================================

  const [users, setUsers] = React.useState([]);

  const [onlineIds, setOnlineIds] = React.useState([]);

  const [sessionsLoading, setSessionsLoading] =
    React.useState(isAdmin);

  const [sessionsError, setSessionsError] =
    React.useState("");

  const [updatedAt, setUpdatedAt] = React.useState(null);

  const loadSessions = React.useCallback(async () => {
    try {
      const [list, online] = await Promise.all([
        apiGet("/users"),
        apiGet("/users/online"),
      ]);

      setUsers(
        Array.isArray(list) ? list.map(normalizeUser) : []
      );

      setOnlineIds(
        Array.isArray(online?.online_user_ids)
          ? online.online_user_ids.map(Number)
          : []
      );

      setUpdatedAt(new Date());

      setSessionsError("");
    } catch (error) {
      console.error("Unable to read who is online:", error);

      setSessionsError(
        error?.message ||
          "Unable to read which accounts are online."
      );
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isAdmin) {
      return undefined;
    }

    loadSessions();

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        loadSessions();
      }
    }, ONLINE_REFRESH_MS);

    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        loadSessions();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisible
    );

    return () => {
      window.clearInterval(timer);

      document.removeEventListener(
        "visibilitychange",
        handleVisible
      );
    };
  }, [isAdmin, loadSessions]);

  // The account of the person looking at this page.
  const isSelf = (user) => {
    if (!currentUser || !user) {
      return false;
    }

    if (
      currentUser.id !== undefined &&
      currentUser.id !== null &&
      String(currentUser.id) === String(user.id)
    ) {
      return true;
    }

    const mine = String(
      currentUser.adminId || currentUser.username || ""
    )
      .trim()
      .toLowerCase();

    return (
      mine !== "" &&
      mine === String(user.adminId).trim().toLowerCase()
    );
  };

  const onlineAccounts = users
    .filter(
      (user) =>
        user.isActive &&
        (isSelf(user) || onlineIds.includes(Number(user.id)))
    )
    .sort((a, b) => {
      if (isSelf(a) !== isSelf(b)) {
        return isSelf(a) ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });

  const activeAccountCount = users.filter(
    (user) => user.isActive
  ).length;

  // =======================================================
  // CHANGE PASSWORD
  // =======================================================

  const [showPasswordModal, setShowPasswordModal] =
    React.useState(false);

  const [passwords, setPasswords] = React.useState({
    current: "",
    next: "",
    confirm: "",
  });

  const [showTyped, setShowTyped] = React.useState(false);

  const [passwordError, setPasswordError] =
    React.useState("");

  const [passwordSaving, setPasswordSaving] =
    React.useState(false);

  const openPasswordModal = () => {
    setPasswords({ current: "", next: "", confirm: "" });
    setShowTyped(false);
    setPasswordError("");
    setNotice("");
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    if (passwordSaving) {
      return;
    }

    setShowPasswordModal(false);
    setPasswords({ current: "", next: "", confirm: "" });
    setPasswordError("");
  };

  React.useEffect(() => {
    if (!showPasswordModal) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape" && !passwordSaving) {
        setShowPasswordModal(false);
        setPasswords({ current: "", next: "", confirm: "" });
        setPasswordError("");
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () =>
      document.removeEventListener("keydown", handleEscape);
  }, [showPasswordModal, passwordSaving]);

  React.useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setNotice("");
    }, 7000);

    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleChangePassword = async (event) => {
    event.preventDefault();

    if (passwordSaving) {
      return;
    }

    if (!passwords.current) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (passwords.next.length < MIN_PASSWORD) {
      setPasswordError(
        `The new password must contain at least ${MIN_PASSWORD} characters.`
      );
      return;
    }

    if (passwords.next.length > MAX_PASSWORD) {
      setPasswordError(
        `The new password can have at most ${MAX_PASSWORD} characters.`
      );
      return;
    }

    if (passwords.next === passwords.current) {
      setPasswordError(
        "The new password must be different from the current one."
      );
      return;
    }

    if (passwords.next !== passwords.confirm) {
      setPasswordError(
        "The new password and its confirmation are not the same."
      );
      return;
    }

    setPasswordSaving(true);
    setPasswordError("");

    try {
      await apiPut("/users/me/credentials", {
        current_password: passwords.current,
        new_password: passwords.next,
      });

      setShowPasswordModal(false);

      setPasswords({ current: "", next: "", confirm: "" });

      setNotice(
        "Your password was changed. Use the new password the next time you sign in."
      );
    } catch (error) {
      console.error("Unable to change password:", error);

      setPasswordError(
        error?.message ||
          "Unable to change the password. Please try again."
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const passwordField = (id, label, key, autoComplete) => (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300"
      >
        {label}
        <span className="ml-1 text-red-500">*</span>
      </label>

      <input
        id={id}
        type={showTyped ? "text" : "password"}
        value={passwords[key]}
        onChange={(event) =>
          setPasswords((previous) => ({
            ...previous,
            [key]: event.target.value,
          }))
        }
        autoComplete={autoComplete}
        className={inputClass}
      />
    </div>
  );

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {notice && (
        <div
          role="status"
          data-testid="notice"
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300"
        >
          {notice}
        </div>
      )}

      {/* =================================================
          SECURITY OVERVIEW
          ================================================= */}

      <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
            <MdSecurity className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Security Overview
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isAdmin
                ? "Manage authentication and see who is online"
                : "Manage your authentication"}
            </p>
          </div>
        </div>

        <div
          className={`grid gap-4 ${
            isAdmin ? "md:grid-cols-3" : "md:grid-cols-2"
          }`}
        >
          <OverviewCard
            icon={<MdCheckCircle className="text-base" />}
            label="Account Status"
            value={accountActive ? "Active" : "Disabled"}
            note={
              currentUser?.adminId
                ? `Admin ID: ${currentUser.adminId}`
                : ""
            }
          />

          <OverviewCard
            icon={<MdAccessTime className="text-base" />}
            label="Current Session"
            value={currentUser ? "Active" : "Not signed in"}
            note="This browser window"
          />

          {isAdmin && (
            <div data-testid="accounts-online-card">
              <OverviewCard
                icon={<MdPeople className="text-base" />}
                label="Accounts Online"
                value={
                  sessionsLoading && users.length === 0
                    ? "..."
                    : onlineAccounts.length
                }
                note={
                  users.length > 0
                    ? `of ${activeAccountCount} active ${
                        activeAccountCount === 1
                          ? "account"
                          : "accounts"
                      }`
                    : ""
                }
              />
            </div>
          )}
        </div>
      </section>

      {/* =================================================
          PASSWORD
          ================================================= */}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
            <MdLock className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Password
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Update your account password
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openPasswordModal}
          className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-navy-700"
        >
          Change Password
        </button>
      </section>

      {/* =================================================
          ACTIVE SESSIONS (Port Administrator only)
          ================================================= */}

      {isAdmin && (
        <section
          data-testid="active-sessions"
          className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                Active Sessions
              </h2>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Accounts that are signed in and in use right
                now.
              </p>
            </div>

            <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-600 dark:bg-green-500/10 dark:text-green-400">
              {onlineAccounts.length}{" "}
              {onlineAccounts.length === 1
                ? "account online"
                : "accounts online"}
            </span>
          </div>

          {sessionsError && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              <span>{sessionsError}</span>

              <button
                type="button"
                onClick={loadSessions}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold hover:bg-red-100 dark:border-red-500/30 dark:hover:bg-red-500/10"
              >
                Try again
              </button>
            </div>
          )}

          {sessionsLoading && users.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              Loading accounts...
            </p>
          ) : (
            <div className="space-y-3">
              {onlineAccounts.map((user) => (
                <div
                  key={user.id}
                  data-testid="session-row"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-navy-900"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-500">
                      {initialsOf(user.name)}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                        {user.name}

                        {isSelf(user) && (
                          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                            You
                          </span>
                        )}
                      </p>

                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {user.role} · Admin ID: {user.adminId}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-green-500">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Online
                  </span>
                </div>
              ))}

              {onlineAccounts.length === 0 &&
                !sessionsError && (
                  <p className="py-6 text-center text-sm text-gray-400">
                    No accounts are online.
                  </p>
                )}
            </div>
          )}

          <p className="mt-4 text-[11px] leading-5 text-gray-400">
            An account is online while its browser is open and
            signed in. An account that is open in two windows is
            counted once.
            {updatedAt
              ? ` Updated ${formatClock(
                  updatedAt
                )}, refreshed every 10 seconds.`
              : ""}
          </p>
        </section>
      )}

      {/* =================================================
          CHANGE PASSWORD WINDOW
          ================================================= */}

      {showPasswordModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closePasswordModal();
              }
            }}
          >
            <div
              role="dialog"
              aria-label="Change password"
              className="my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                    Change Password
                  </h2>

                  <p className="mt-1 text-xs text-gray-400">
                    Enter your current password and choose a
                    new one (at least {MIN_PASSWORD}{" "}
                    characters).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closePasswordModal}
                  aria-label="Close"
                  className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-700"
                >
                  <MdClose className="text-xl" />
                </button>
              </div>

              {passwordError && (
                <div
                  role="alert"
                  data-testid="password-error"
                  className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                >
                  {passwordError}
                </div>
              )}

              <form
                onSubmit={handleChangePassword}
                className="space-y-4"
              >
                <div className="relative">
                  {passwordField(
                    "current-password",
                    "Current password",
                    "current",
                    "current-password"
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setShowTyped((previous) => !previous)
                    }
                    title={
                      showTyped
                        ? "Hide passwords"
                        : "Show passwords"
                    }
                    aria-label={
                      showTyped
                        ? "Hide passwords"
                        : "Show passwords"
                    }
                    className="absolute bottom-[10px] right-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-navy-600"
                  >
                    {showTyped ? (
                      <MdVisibilityOff />
                    ) : (
                      <MdVisibility />
                    )}
                  </button>
                </div>

                {passwordField(
                  "new-password",
                  "New password",
                  "next",
                  "new-password"
                )}

                {passwordField(
                  "confirm-password",
                  "Confirm new password",
                  "confirm",
                  "new-password"
                )}

                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <MdSave className="h-5 w-5" />

                  {passwordSaving
                    ? "Saving..."
                    : "Change Password"}
                </button>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

export default Security;