import React from "react";
import {
  MdSecurity,
  MdLock,
  MdDevices,
  MdCheckCircle,
  MdAccessTime,
} from "react-icons/md";

import authService from "layouts/auth/authService";

import {
  getCurrentSession,
  getUserActiveSessions,
} from "layouts/auth/sessionManager";

// =========================================================
// SECURITY
// =========================================================

const Security = () => {
  const user = authService.getCurrentUser();

  const [sessions, setSessions] =
    React.useState(() => {
      return user
        ? getUserActiveSessions(user.id)
        : [];
    });

  const [showPasswordForm, setShowPasswordForm] =
    React.useState(false);

  const [currentPassword, setCurrentPassword] =
    React.useState("");

  const [newPassword, setNewPassword] =
    React.useState("");

  const [confirmPassword, setConfirmPassword] =
    React.useState("");

  const [message, setMessage] =
    React.useState("");

  const [error, setError] =
    React.useState("");

  const currentSession = getCurrentSession();

  // =======================================================
  // REFRESH ACTIVE SESSIONS
  // =======================================================

  React.useEffect(() => {
    const refreshSessions = () => {
      if (!user) {
        setSessions([]);
        return;
      }

      setSessions(
        getUserActiveSessions(user.id)
      );
    };

    refreshSessions();

    window.addEventListener(
      "storage",
      refreshSessions
    );

    return () => {
      window.removeEventListener(
        "storage",
        refreshSessions
      );
    };
  }, [user]);

  // =======================================================
  // PASSWORD VALIDATION
  // =======================================================

  const validatePassword = () => {
    if (!currentPassword) {
      return "Enter your current password.";
    }

    if (!newPassword) {
      return "Enter a new password.";
    }

    if (newPassword.length < 8) {
      return "New password must contain at least 8 characters.";
    }

    if (newPassword !== confirmPassword) {
      return "New password and confirmation do not match.";
    }

    return "";
  };

  // =======================================================
  // CHANGE PASSWORD
  // =======================================================

  const handlePasswordChange = (event) => {
    event.preventDefault();

    setError("");
    setMessage("");

    const validationError =
      validatePassword();

    if (validationError) {
      setError(validationError);
      return;
    }

    /*
     * Password changes will be connected to the FastAPI /
     * PostgreSQL authentication service later.
     *
     * We intentionally do not modify users.js here because
     * passwords must not be permanently managed from the
     * frontend in the production architecture.
     */

    setMessage(
      "Password change is ready for server-side authentication integration."
    );

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  // =======================================================
  // SESSION TIME
  // =======================================================

  const formatDateTime = (timestamp) => {
    if (!timestamp) {
      return "—";
    }

    return new Date(timestamp).toLocaleString();
  };

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div className="space-y-5">

      {/* =================================================
          SECURITY OVERVIEW
          ================================================= */}

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-6 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
            <MdSecurity className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Security Overview
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Manage authentication and active sessions
            </p>
          </div>

        </div>

        <div className="grid gap-4 md:grid-cols-3">

          <SecurityCard
            label="Account Status"
            value="Active"
            icon={<MdCheckCircle />}
          />

          <SecurityCard
            label="Current Session"
            value="Active"
            icon={<MdAccessTime />}
          />

          <SecurityCard
            label="Active Sessions"
            value={String(sessions.length)}
            icon={<MdDevices />}
          />

        </div>

      </div>

      {/* =================================================
          PASSWORD
          ================================================= */}

      <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

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
            onClick={() => {
              setShowPasswordForm(
                (previous) => !previous
              );

              setError("");
              setMessage("");
            }}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-navy-700"
          >
            {showPasswordForm
              ? "Cancel"
              : "Change Password"}
          </button>

        </div>

        {showPasswordForm && (
          <form
            onSubmit={handlePasswordChange}
            className="mt-6 max-w-xl space-y-4"
          >

            <PasswordInput
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
            />

            <PasswordInput
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
            />

            <PasswordInput
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs font-semibold text-green-600 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300">
                {message}
              </div>
            )}

            <button
              type="submit"
              className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600"
            >
              Update Password
            </button>

          </form>
        )}

      </section>

      {/* =================================================
          ACTIVE SESSIONS
          ================================================= */}

      <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5">

          <h2 className="text-lg font-bold text-navy-700 dark:text-white">
            Active Sessions
          </h2>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Sessions currently associated with this account.
          </p>

        </div>

        <div className="space-y-3">

          {sessions.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-sm text-gray-500 dark:border-white/5 dark:bg-navy-900 dark:text-gray-400">
              No active sessions found.
            </div>
          )}

          {sessions.map((session) => {
            const isCurrent =
              session.sessionId ===
              currentSession?.sessionId;

            return (
              <div
                key={session.sessionId}
                className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-navy-900 md:flex-row md:items-center md:justify-between"
              >

                <div className="flex items-center gap-3">

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
                    <MdDevices className="h-5 w-5" />
                  </div>

                  <div>

                    <p className="text-sm font-bold text-navy-700 dark:text-white">
                      {isCurrent
                        ? "Current Browser Session"
                        : "Active Browser Session"}
                    </p>

                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Session ID: {session.sessionId}
                    </p>

                  </div>

                </div>

                <div className="text-left md:text-right">

                  <div className="mb-1 flex items-center gap-2 md:justify-end">

                    <span className="h-2 w-2 rounded-full bg-green-500" />

                    <span className="text-xs font-semibold text-green-500">
                      Active
                    </span>

                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Started{" "}
                    {formatDateTime(
                      session.loginTime
                    )}
                  </p>

                </div>

              </div>
            );
          })}

        </div>

      </section>

      {/* =================================================
          SECURITY NOTICE
          ================================================= */}

      <div className="rounded-2xl border border-red-100 bg-red-50 p-5 dark:border-red-500/20 dark:bg-red-500/10">

        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
          Security-sensitive actions are restricted.
        </p>

        <p className="mt-1 text-xs leading-5 text-red-600 dark:text-red-200">
          Password storage, authentication and account
          security will be enforced server-side when the
          FastAPI and PostgreSQL backend is connected.
        </p>

      </div>

    </div>
  );
};

// =========================================================
// SECURITY CARD
// =========================================================

const SecurityCard = ({
  label,
  value,
  icon,
}) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-navy-900">

    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
      <span className="text-lg text-brand-500">
        {icon}
      </span>

      {label}
    </div>

    <p className="mt-2 text-sm font-bold text-navy-700 dark:text-white">
      {value}
    </p>

  </div>
);

// =========================================================
// PASSWORD INPUT
// =========================================================

const PasswordInput = ({
  label,
  value,
  onChange,
}) => (
  <div>

    <label className="mb-1.5 block text-xs font-semibold text-navy-700 dark:text-white">
      {label}
    </label>

    <input
      type="password"
      value={value}
      onChange={(event) =>
        onChange(event.target.value)
      }
      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/10 dark:bg-navy-900 dark:text-white"
    />

  </div>
);

export default Security;