import React from "react";
import {
  MdPerson,
  MdBadge,
  MdBusiness,
  MdEmail,
  MdVerifiedUser,
  MdAccessTime,
} from "react-icons/md";

import authService from "layouts/auth/authService";
import { getCurrentSession } from "layouts/auth/sessionManager";

// =========================================================
// MY PROFILE
// =========================================================

const MyProfile = () => {
  const [user, setUser] = React.useState(() =>
    authService.getCurrentUser()
  );

  const [session, setSession] = React.useState(() =>
    getCurrentSession()
  );

  React.useEffect(() => {
    setUser(authService.getCurrentUser());
    setSession(getCurrentSession());
  }, []);

  if (!user) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-300">
          Unable to load the current user profile.
        </p>
      </div>
    );
  }

  const formatDateTime = (timestamp) => {
    if (!timestamp) {
      return "—";
    }

    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-5">

      {/* =================================================
          PROFILE HEADER
          ================================================= */}

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex flex-col gap-5 md:flex-row md:items-center">

          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-2xl font-bold text-white shadow-lg">
            {user.role === "Port Administrator"
              ? "PA"
              : user.role === "Marine Officer"
              ? "MO"
              : user.role === "Port Manager"
              ? "PM"
              : user.role === "Cargo Officer"
              ? "CO"
              : user.role === "Gate & Security Officer"
              ? "GS"
              : user.role === "Maintenance Officer"
              ? "MT"
              : user.role === "Executive"
              ? "PE"
              : "PU"}
          </div>

          <div>
            <p className="text-2xl font-bold text-navy-700 dark:text-white">
              {user.role}
            </p>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
              {user.department}
            </p>

            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-600 dark:bg-green-500/10 dark:text-green-400">
              <MdVerifiedUser className="h-4 w-4" />
              Active Account
            </div>
          </div>

        </div>

      </div>

      {/* =================================================
          ACCOUNT INFORMATION
          ================================================= */}

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
            <MdPerson className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Account Information
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Current authenticated account details
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">

          <InfoItem
            icon={<MdBadge />}
            label="Admin ID"
            value={user.adminId}
          />

          <InfoItem
            icon={<MdPerson />}
            label="Designation"
            value={user.role}
          />

          <InfoItem
            icon={<MdBusiness />}
            label="Department"
            value={user.department}
          />

          <InfoItem
            icon={<MdEmail />}
            label="Email Address"
            value={user.email}
          />

        </div>

      </div>

      {/* =================================================
          CURRENT SESSION
          ================================================= */}

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <MdAccessTime className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Current Session
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Information about this browser session
            </p>
          </div>

        </div>

        <div className="grid gap-4 md:grid-cols-3">

          <InfoItem
            label="Session Status"
            value="Active"
            status
          />

          <InfoItem
            label="Login Time"
            value={formatDateTime(session?.loginTime)}
          />

          <InfoItem
            label="Last Activity"
            value={formatDateTime(session?.lastActivity)}
          />

        </div>

      </div>

      {/* =================================================
          SECURITY NOTICE
          ================================================= */}

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 dark:border-blue-500/20 dark:bg-blue-500/10">

        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
          Profile information is controlled by the Port
          Administration system.
        </p>

        <p className="mt-1 text-xs leading-5 text-blue-600 dark:text-blue-200">
          Role, designation and department changes are
          managed through User & Role Management.
        </p>

      </div>

    </div>
  );
};

// =========================================================
// INFORMATION ITEM
// =========================================================

const InfoItem = ({
  icon,
  label,
  value,
  status = false,
}) => {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-navy-900">

      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {icon && (
          <span className="text-base">
            {icon}
          </span>
        )}

        {label}
      </div>

      {status ? (
        <div className="mt-2 flex items-center gap-2 text-sm font-bold text-green-500">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {value}
        </div>
      ) : (
        <p className="mt-2 break-words text-sm font-semibold text-navy-700 dark:text-white">
          {value || "—"}
        </p>
      )}

    </div>
  );
};

export default MyProfile;