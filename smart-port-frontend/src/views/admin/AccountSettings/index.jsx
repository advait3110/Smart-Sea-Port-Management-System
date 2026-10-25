import React from "react";

import { Link } from "react-router-dom";

import {
  MdPerson,
  MdFileUpload,
  MdDelete,
  MdSave,
  MdLock,
  MdSecurity,
} from "react-icons/md";

import authService from "layouts/auth/authService";

import { apiPut, apiDelete } from "services/api";

import {
  announceProfile,
  initialsOf,
  loadMyProfile,
  normalizeProfile,
  pictureToAvatar,
} from "services/profile";

// =========================================================
// ACCOUNT SETTINGS
// =========================================================
//
// Where an employee keeps their own personal information:
//
// - the profile picture (saved by the backend)
// - the full name (the real name of the person)
// - the phone number (optional)
//
// The Admin ID and the role are shown but cannot be changed
// here. The port has no e-mail addresses: employees sign in
// with the Admin ID.
//
// The password is changed on the Security page.

const tidy = (value) =>
  String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

const inputClass =
  "w-full rounded-xl bg-gray-50 px-4 py-3 text-sm text-navy-700 outline-none transition focus:ring-2 focus:ring-brand-500 dark:bg-navy-700 dark:text-white";

const readOnlyClass =
  "w-full cursor-not-allowed rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-500 outline-none dark:bg-navy-900 dark:text-gray-400";

const AccountSettings = () => {
  const fileInput = React.useRef(null);

  // What is saved in the backend.
  const [profile, setProfile] = React.useState(null);

  const [loading, setLoading] = React.useState(true);

  const [loadError, setLoadError] = React.useState("");

  // What is typed in the boxes.
  const [form, setForm] = React.useState({
    name: "",
    phone: "",
  });

  const [saving, setSaving] = React.useState(false);

  const [pictureBusy, setPictureBusy] =
    React.useState(false);

  // A picture that was chosen (or removed) but is not saved yet.
  //   null              nothing is waiting
  //   { image }         a new picture, saved by "Save Changes"
  //   { remove: true }  removing the picture, done by "Save Changes"
  const [pendingPicture, setPendingPicture] =
    React.useState(null);

  // { type: "success" | "error", text }
  const [notice, setNotice] = React.useState(null);

  // =======================================================
  // LOAD
  // =======================================================

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const saved = await loadMyProfile();

      setProfile(saved);

      setForm({
        name: saved.name,
        phone: saved.phone,
      });
    } catch (error) {
      console.error("Unable to load profile:", error);

      setLoadError(
        error?.message ||
          "Unable to load your profile from the backend."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // A success message goes away by itself.
  React.useEffect(() => {
    if (!notice || notice.type !== "success") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [notice]);

  // =======================================================
  // SAVED PROFILE -> EVERYWHERE
  // =======================================================

  const profileSaved = (saved) => {
    setProfile(saved);

    announceProfile(saved);

    // Keeps this tab's stored name up to date.
    try {
      Promise.resolve(authService.refreshCurrentUser()).catch(
        () => {}
      );
    } catch {
      // Not important.
    }
  };

  // =======================================================
  // PICTURE
  // =======================================================
  //
  // Choosing or removing a picture does NOT save anything.
  // The new picture is only shown here as a preview. It is
  // saved together with the other changes when the person
  // clicks "Save Changes". "Reset" throws it away.

  const handlePicture = async (event) => {
    const file = event.target.files?.[0];

    // So the same file can be chosen again later.
    event.target.value = "";

    if (!file || pictureBusy || saving) {
      return;
    }

    setPictureBusy(true);
    setNotice(null);

    try {
      // This only reads and shrinks the file in the browser.
      const image = await pictureToAvatar(file);

      setPendingPicture({ image });
    } catch (error) {
      console.error("Unable to read picture:", error);

      setNotice({
        type: "error",
        text:
          error?.message ||
          "Unable to read this picture.",
      });
    } finally {
      setPictureBusy(false);
    }
  };

  const handleRemovePicture = () => {
    if (saving) {
      return;
    }

    setNotice(null);

    // Nothing was saved before: just drop the chosen picture.
    // Otherwise the saved picture is removed by "Save Changes".
    setPendingPicture(
      profile?.avatar ? { remove: true } : null
    );
  };

  // =======================================================
  // NAME AND PHONE
  // =======================================================

  const cleanName = tidy(form.name);

  const cleanPhone = tidy(form.phone);

  const textChanged =
    Boolean(profile) &&
    (cleanName !== tidy(profile.name) ||
      cleanPhone !== tidy(profile.phone));

  // Name, phone or picture: anything waiting to be saved.
  const changed = textChanged || pendingPicture !== null;

  // What the round picture shows right now.
  const shownAvatar = pendingPicture?.image
    ? pendingPicture.image
    : pendingPicture?.remove
      ? ""
      : profile?.avatar || "";

  const handleReset = () => {
    if (!profile) {
      return;
    }

    setForm({
      name: profile.name,
      phone: profile.phone,
    });

    setPendingPicture(null);

    setNotice(null);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!profile || !changed || saving) {
      return;
    }

    if (cleanName.length < 2) {
      setNotice({
        type: "error",
        text: "Please enter your full name.",
      });
      return;
    }

    const payload = {};

    if (cleanName !== tidy(profile.name)) {
      payload.name = cleanName;
    }

    if (cleanPhone !== tidy(profile.phone)) {
      payload.phone = cleanPhone;
    }

    const waiting = pendingPicture;

    setSaving(true);
    setNotice(null);

    // The newest saved profile. If one step works and a later
    // one fails, what was already saved is still shown.
    let latest = profile;

    try {
      if (Object.keys(payload).length > 0) {
        latest = normalizeProfile(
          await apiPut("/users/me/profile", payload)
        );

        setForm({
          name: latest.name,
          phone: latest.phone,
        });
      }

      if (waiting?.image) {
        latest = normalizeProfile(
          await apiPut("/users/me/avatar", {
            image: waiting.image,
          })
        );

        setPendingPicture(null);
      } else if (waiting?.remove) {
        await apiDelete("/users/me/avatar");

        latest = await loadMyProfile();

        setPendingPicture(null);
      }

      profileSaved(latest);

      setNotice({
        type: "success",
        text: "Your changes were saved.",
      });
    } catch (error) {
      console.error("Unable to save profile:", error);

      if (latest !== profile) {
        profileSaved(latest);
      }

      setNotice({
        type: "error",
        text:
          error?.message ||
          "Unable to save your changes.",
      });
    } finally {
      setSaving(false);
    }
  };

  // =======================================================
  // RENDER
  // =======================================================

  const initials = initialsOf(
    cleanName || profile?.name
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Manage your personal information and your profile
        picture.
      </p>

      {/* =================================================
          PERSONAL INFORMATION
          ================================================= */}

      <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
            <MdPerson className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Personal Information
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Edit your personal information
            </p>
          </div>
        </div>

        {notice && (
          <div
            role="status"
            data-testid="notice"
            className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
              notice.type === "error"
                ? "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                : "border-green-200 bg-green-50 text-green-600 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300"
            }`}
          >
            {notice.text}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Loading your profile...
          </div>
        ) : loadError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-red-500">
              {loadError}
            </p>

            <button
              type="button"
              onClick={load}
              className="mt-4 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* PROFILE PICTURE */}

            <div className="mb-7 flex flex-wrap items-center gap-5">
              <div
                className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-2xl font-bold text-white shadow-md"
                data-testid="avatar"
              >
                {shownAvatar ? (
                  <img
                    src={shownAvatar}
                    alt="Your profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePicture}
                    className="hidden"
                    data-testid="picture-input"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      fileInput.current?.click()
                    }
                    disabled={pictureBusy || saving}
                    data-testid="picture-button"
                    className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <MdFileUpload className="h-5 w-5" />

                    {pictureBusy
                      ? "Please wait..."
                      : shownAvatar
                        ? "Change Image"
                        : "Upload An Image"}
                  </button>

                  {shownAvatar && (
                    <button
                      type="button"
                      onClick={handleRemovePicture}
                      disabled={pictureBusy || saving}
                      data-testid="picture-remove"
                      title="Remove picture"
                      aria-label="Remove picture"
                      className="rounded-xl border border-red-200 p-3 text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:hover:bg-red-500/10"
                    >
                      <MdDelete className="h-5 w-5" />
                    </button>
                  )}
                </div>

                <p className="mt-2 text-[11px] text-gray-400">
                  JPG, PNG or WebP. The picture is cropped to
                  a square and made smaller automatically.
                </p>

                {pendingPicture?.image && (
                  <p
                    data-testid="picture-note"
                    className="mt-1 text-[11px] font-semibold text-brand-500 dark:text-brand-400"
                  >
                    New picture chosen. It is not saved yet:
                    click Save Changes to use it.
                  </p>
                )}

                {pendingPicture?.remove && (
                  <p
                    data-testid="picture-note"
                    className="mt-1 text-[11px] font-semibold text-brand-500 dark:text-brand-400"
                  >
                    The picture will be removed when you click
                    Save Changes.
                  </p>
                )}
              </div>
            </div>

            {/* NAME, ADMIN ID, ROLE, PHONE */}

            <form
              onSubmit={handleSave}
              className="grid grid-cols-1 gap-5 md:grid-cols-2"
            >
              <div>
                <label
                  htmlFor="settings-name"
                  className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300"
                >
                  Full name
                  <span className="ml-1 text-red-500">
                    *
                  </span>
                </label>

                <input
                  id="settings-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Your full name"
                  maxLength={100}
                  autoComplete="off"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="settings-admin-id"
                  className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300"
                >
                  Admin ID
                </label>

                <input
                  id="settings-admin-id"
                  value={profile?.adminId || ""}
                  readOnly
                  className={readOnlyClass}
                />

                <p className="mt-1.5 text-[11px] text-gray-400">
                  This is the ID you sign in with.
                </p>
              </div>

              <div>
                <label
                  htmlFor="settings-role"
                  className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300"
                >
                  Role
                </label>

                <input
                  id="settings-role"
                  value={profile?.role || ""}
                  readOnly
                  className={readOnlyClass}
                />

                <p className="mt-1.5 text-[11px] text-gray-400">
                  Your role decides which features you can
                  open. The Port Administrator assigns it.
                </p>
              </div>

              <div>
                <label
                  htmlFor="settings-phone"
                  className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300"
                >
                  Phone number
                </label>

                <input
                  id="settings-phone"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="+65 6123 4567"
                  maxLength={25}
                  inputMode="tel"
                  autoComplete="off"
                  className={inputClass}
                />

                <p className="mt-1.5 text-[11px] text-gray-400">
                  Optional. Digits, spaces, + ( ) and - only.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 md:col-span-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!changed || saving}
                  data-testid="reset"
                  className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-navy-700"
                >
                  Reset
                </button>

                <button
                  type="submit"
                  disabled={!changed || saving}
                  data-testid="save"
                  className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MdSave className="h-5 w-5" />

                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      {/* =================================================
          PASSWORD (on the Security page)
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
              Your password is changed on the Security page.
            </p>
          </div>
        </div>

        <Link
          to="/admin/security"
          className="flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-navy-700"
        >
          <MdSecurity className="h-5 w-5" />
          Go to Security
        </Link>
      </section>
    </div>
  );
};

export default AccountSettings;