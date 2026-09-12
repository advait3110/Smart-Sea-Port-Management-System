import React from "react";
import {
  MdSettings,
  MdNotifications,
  MdDashboard,
  MdSave,
} from "react-icons/md";

import authService from "layouts/auth/authService";

// =========================================================
// STORAGE KEY
// =========================================================

const SETTINGS_KEY = "karwarPortAccountSettings";

// =========================================================
// DEFAULT SETTINGS
// =========================================================

const DEFAULT_SETTINGS = {
  emailNotifications: true,
  alertNotifications: true,
  vesselNotifications: true,
  berthNotifications: true,
  maintenanceNotifications: false,
  showWeather: true,
  showAlerts: true,
  showBerthOccupancy: true,
};

// =========================================================
// ACCOUNT SETTINGS
// =========================================================

const AccountSettings = () => {
  const user = authService.getCurrentUser();

  const [settings, setSettings] =
    React.useState(() => {
      const stored =
        localStorage.getItem(SETTINGS_KEY);

      if (!stored) {
        return DEFAULT_SETTINGS;
      }

      try {
        return {
          ...DEFAULT_SETTINGS,
          ...JSON.parse(stored),
        };
      } catch {
        return DEFAULT_SETTINGS;
      }
    });

  const [saved, setSaved] =
    React.useState(false);

  // =======================================================
  // UPDATE SETTING
  // =======================================================

  const updateSetting = (key) => {
    setSettings((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));

    setSaved(false);
  };

  // =======================================================
  // SAVE SETTINGS
  // =======================================================

  const handleSave = () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(settings)
    );

    setSaved(true);

    window.setTimeout(() => {
      setSaved(false);
    }, 2500);
  };

  return (
    <div className="space-y-5">

      {/* =================================================
          ACCOUNT INFORMATION
          ================================================= */}

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
            <MdSettings className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Account Settings
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Manage your personal system preferences
            </p>
          </div>

        </div>

        <div className="grid gap-4 md:grid-cols-3">

          <SettingInfo
            label="Admin ID"
            value={user?.adminId}
          />

          <SettingInfo
            label="Designation"
            value={user?.role}
          />

          <SettingInfo
            label="Department"
            value={user?.department}
          />

        </div>

      </div>

      {/* =================================================
          NOTIFICATION PREFERENCES
          ================================================= */}

      <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <MdNotifications className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Notification Preferences
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Select operational notifications relevant to
              your role
            </p>
          </div>

        </div>

        <div className="divide-y divide-gray-100 dark:divide-white/5">

          <ToggleRow
            label="Port Alerts"
            description="Receive important port safety and operational alerts."
            checked={settings.alertNotifications}
            onChange={() =>
              updateSetting("alertNotifications")
            }
          />

          <ToggleRow
            label="Vessel Updates"
            description="Receive notifications about vessel movements and status."
            checked={settings.vesselNotifications}
            onChange={() =>
              updateSetting("vesselNotifications")
            }
          />

          <ToggleRow
            label="Berth Updates"
            description="Receive berth allocation and occupancy updates."
            checked={settings.berthNotifications}
            onChange={() =>
              updateSetting("berthNotifications")
            }
          />

          <ToggleRow
            label="Maintenance Updates"
            description="Receive asset maintenance and service notifications."
            checked={settings.maintenanceNotifications}
            onChange={() =>
              updateSetting("maintenanceNotifications")
            }
          />

          <ToggleRow
            label="Email Notifications"
            description="Allow system notifications to be delivered by email."
            checked={settings.emailNotifications}
            onChange={() =>
              updateSetting("emailNotifications")
            }
          />

        </div>

      </section>

      {/* =================================================
          DASHBOARD PREFERENCES
          ================================================= */}

      <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
            <MdDashboard className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Dashboard Preferences
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Choose the operational information displayed
              on your dashboard
            </p>
          </div>

        </div>

        <div className="divide-y divide-gray-100 dark:divide-white/5">

          <ToggleRow
            label="Weather & Marine Conditions"
            description="Display current marine and weather information."
            checked={settings.showWeather}
            onChange={() =>
              updateSetting("showWeather")
            }
          />

          <ToggleRow
            label="Active Port Alerts"
            description="Display current operational and safety alerts."
            checked={settings.showAlerts}
            onChange={() =>
              updateSetting("showAlerts")
            }
          />

          <ToggleRow
            label="Berth Occupancy"
            description="Display berth occupancy information."
            checked={settings.showBerthOccupancy}
            onChange={() =>
              updateSetting("showBerthOccupancy")
            }
          />

        </div>

      </section>

      {/* =================================================
          SAVE
          ================================================= */}

      <div className="flex items-center justify-end gap-4">

        {saved && (
          <p className="text-sm font-semibold text-green-500">
            Settings saved successfully.
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600"
        >
          <MdSave className="h-5 w-5" />
          Save Settings
        </button>

      </div>

    </div>
  );
};

// =========================================================
// SETTING INFO
// =========================================================

const SettingInfo = ({
  label,
  value,
}) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-navy-900">

    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
      {label}
    </p>

    <p className="mt-2 text-sm font-bold text-navy-700 dark:text-white">
      {value || "—"}
    </p>

  </div>
);

// =========================================================
// TOGGLE ROW
// =========================================================

const ToggleRow = ({
  label,
  description,
  checked,
  onChange,
}) => (
  <div className="flex items-center justify-between gap-5 py-4">

    <div>
      <p className="text-sm font-semibold text-navy-700 dark:text-white">
        {label}
      </p>

      <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>

    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked
          ? "bg-brand-500"
          : "bg-gray-300 dark:bg-navy-600"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
          checked
            ? "left-6"
            : "left-1"
        }`}
      />
    </button>

  </div>
);

export default AccountSettings;