import React from "react";

import { Link } from "react-router-dom";

import {
  MdPerson,
  MdKey,
  MdWork,
  MdPhone,
  MdEdit,
  MdVerifiedUser,
  MdBlock,
} from "react-icons/md";

import authService from "layouts/auth/authService";

import {
  PROFILE_EVENT,
  initialsOf,
  loadMyProfile,
} from "services/profile";

// =========================================================
// MY PROFILE
// =========================================================
//
// A read-only summary of the logged-in employee: profile
// picture, name, role, Admin ID and phone number. Everything
// can be changed on the Account Settings page.
//
// The port has no e-mail addresses: employees sign in with the
// Admin ID.

const InfoTile = ({ icon, label, value }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-navy-900">
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
      {icon}
      {label}
    </p>

    <p className="mt-2 break-words text-sm font-bold text-navy-700 dark:text-white">
      {value || "—"}
    </p>
  </div>
);

const MyProfile = () => {
  const sessionUser = authService.getCurrentUser();

  const [profile, setProfile] = React.useState(null);

  const [problem, setProblem] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    loadMyProfile()
      .then((saved) => {
        if (!cancelled) {
          setProfile(saved);
        }
      })
      .catch((error) => {
        console.error("Unable to load profile:", error);

        if (!cancelled) {
          setProblem(true);
        }
      });

    // The Account Settings page and the top bar tell us when the
    // picture or the name changes.
    const handleChange = (event) => {
      if (event.detail) {
        setProfile(event.detail);
      }
    };

    window.addEventListener(PROFILE_EVENT, handleChange);

    return () => {
      cancelled = true;

      window.removeEventListener(
        PROFILE_EVENT,
        handleChange
      );
    };
  }, []);

  const name = profile?.name || sessionUser?.name || "";

  const adminId =
    profile?.adminId ||
    sessionUser?.adminId ||
    sessionUser?.username ||
    "";

  const role = profile?.role || sessionUser?.role || "";

  const phone = profile?.phone || "";

  const avatar = profile?.avatar || "";

  const isActive =
    profile?.isActive !== false &&
    sessionUser?.is_active !== false;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {/* =================================================
          WHO AM I
          ================================================= */}

      <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="flex flex-wrap items-center gap-6">
          <div
            data-testid="profile-avatar"
            className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-brand-500 text-3xl font-bold text-white shadow-lg shadow-brand-500/20"
          >
            {avatar ? (
              <img
                src={avatar}
                alt="Your profile"
                className="h-full w-full object-cover"
              />
            ) : (
              initialsOf(name)
            )}
          </div>

          <div className="min-w-[11rem] flex-1">
            <h2 className="break-words text-2xl font-bold text-navy-700 dark:text-white">
              {name || "Port employee"}
            </h2>

            {role && (
              <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-300">
                {role}
              </p>
            )}

            <span
              className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
                isActive
                  ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                  : "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400"
              }`}
            >
              {isActive ? <MdVerifiedUser /> : <MdBlock />}

              {isActive
                ? "Active Account"
                : "Disabled Account"}
            </span>
          </div>

          <Link
            to="/admin/account-settings"
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600"
          >
            <MdEdit className="h-5 w-5" />
            Edit Profile
          </Link>
        </div>

        {problem && (
          <p className="mt-5 text-xs text-amber-600 dark:text-amber-400">
            Your profile picture and phone number could not be
            loaded right now.
          </p>
        )}
      </section>

      {/* =================================================
          ACCOUNT INFORMATION
          ================================================= */}

      <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">
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

        <div className="grid gap-4 md:grid-cols-3">
          <InfoTile
            icon={<MdKey className="text-base" />}
            label="Admin ID"
            value={adminId}
          />

          <InfoTile
            icon={<MdWork className="text-base" />}
            label="Designation"
            value={role}
          />

          <InfoTile
            icon={<MdPhone className="text-base" />}
            label="Phone Number"
            value={phone}
          />
        </div>
      </section>
    </div>
  );
};

export default MyProfile;