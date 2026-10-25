import React from "react";
import ReactDOM from "react-dom";

import {
  MdLocalShipping,
  MdLogin,
  MdLogout,
  MdToday,
  MdWarning,
  MdSearch,
  MdRefresh,
  MdAdd,
  MdClose,
  MdDelete,
} from "react-icons/md";

import { apiGet, apiPost, apiDelete } from "services/api";
import { getCurrentUser } from "layouts/auth/authService";
import { hasModuleAccess } from "layouts/auth/permissions";

// =========================================================
// CONSTANTS
// =========================================================

// Must match the PostgreSQL permission key checked by FastAPI.
const GATE_MODULE_KEY = "gate_trucks";

const PORT_TIME_ZONE = "Asia/Singapore";

// Singapore has no daylight saving, so a fixed offset is exact.
const PORT_UTC_OFFSET = "+08:00";

const STATUS_FILTERS = ["All", "Inside Port", "Exited"];

const EMPTY_FORM = {
  vehicle_number: "",
  driver_name: "",
  entry_time: "",
  gate_number: "",
  driver_phone: "",
  transport_company: "",
  cargo_weight_tonnes: "",
  entry_remarks: "",
};

const statusStyles = {
  Exited:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",

  "Inside Port":
    "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",

  Unknown:
    "bg-gray-100 text-gray-500 dark:bg-gray-500/10 dark:text-gray-400",
};

const inputClass =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none placeholder:text-gray-400 focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white";

const labelClass =
  "mb-1 block text-xs font-bold uppercase text-gray-400";

const errorBoxClass =
  "rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400";

const ghostButton =
  "rounded-xl bg-lightPrimary px-5 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-900 dark:text-white";

const primaryButton =
  "rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

// =========================================================
// FORMAT STATUS
// =========================================================

const formatStatus = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (normalized === "inside_port") {
    return "Inside Port";
  }

  if (normalized === "exited") {
    return "Exited";
  }

  return "Unknown";
};

// =========================================================
// DATE / TIME (always Port of Singapore time)
// =========================================================

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

// "13 Oct 2026"
const formatDate = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleDateString("en-SG", {
    timeZone: PORT_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// "02:30 pm"
const formatTime = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleTimeString("en-SG", {
    timeZone: PORT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
};

// "13 Oct 2026, 02:30 pm"
const formatDateTime = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return `${formatDate(value)}, ${formatTime(value)}`;
};

// "YYYY-MM-DD" in Singapore time
const portDay = (value) => {
  const date = parseDate(value);

  if (!date) {
    return null;
  }

  return date.toLocaleDateString("en-CA", {
    timeZone: PORT_TIME_ZONE,
  });
};

const isToday = (value) => {
  const day = portDay(value);

  return day !== null && day === portDay(new Date());
};

// "YYYY-MM-DDTHH:mm" for a moment, shown in Singapore time
// (the format <input type="datetime-local"> needs).
const toPortLocalInput = (date) =>
  date
    .toLocaleString("sv-SE", {
      timeZone: PORT_TIME_ZONE,
      hourCycle: "h23",
    })
    .replace(" ", "T")
    .slice(0, 16);

// <input type="datetime-local"> value, read as Singapore time,
// to an ISO string with an offset, e.g. 2026-10-13T14:30:00+08:00.
const portLocalToIso = (value) => {
  if (!value) {
    return null;
  }

  const withSeconds = value.length === 16 ? `${value}:00` : value;

  return `${withSeconds}${PORT_UTC_OFFSET}`;
};

// =========================================================
// BACKEND TRUCK → FRONTEND TRUCK
// =========================================================

const mapTruck = (truck) => ({
  id: truck?.id,

  displayId:
    truck?.id !== undefined
      ? `TRK-${String(truck.id).padStart(3, "0")}`
      : "—",

  vehicle: truck?.vehicle_number || "—",

  driver: truck?.driver_name || "—",

  phone: truck?.driver_phone || "",

  company: truck?.transport_company || "—",

  gate: truck?.gate_number || "—",

  weight:
    truck?.cargo_weight_tonnes !== null &&
    truck?.cargo_weight_tonnes !== undefined
      ? `${truck.cargo_weight_tonnes} t`
      : "—",

  entryTime: truck?.entry_time ?? null,
  entryBy: truck?.recorded_by_name || "—",
  entryRemarks: truck?.entry_remarks || "",

  exitTime: truck?.exit_time ?? null,
  exitBy: truck?.exit_recorded_by_name || "—",
  exitRemarks: truck?.exit_remarks || "",

  status: formatStatus(truck?.status),
});

// =========================================================
// GATE & TRUCK MANAGEMENT
// =========================================================

const GateManagement = () => {
  // =======================================================
  // STATE
  // =======================================================

  const [trucks, setTrucks] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  // Entry form
  const [showEntryForm, setShowEntryForm] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [entrySubmitting, setEntrySubmitting] = React.useState(false);
  const [entryError, setEntryError] = React.useState("");

  // Exit dialog
  const [exitTarget, setExitTarget] = React.useState(null);
  const [exitTime, setExitTime] = React.useState("");
  const [exitRemarks, setExitRemarks] = React.useState("");
  const [exitSubmitting, setExitSubmitting] = React.useState(false);
  const [exitError, setExitError] = React.useState("");

  // Delete dialog. deleteTarget is a truck object, "all", or null.
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");
  const [deleteSubmitting, setDeleteSubmitting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState("");

  // UI only. FastAPI enforces the same permission independently.
  const canRecord = hasModuleAccess(
    getCurrentUser(),
    GATE_MODULE_KEY
  );

  // =======================================================
  // FETCH TRUCKS
  // =======================================================

  const fetchTrucks = React.useCallback(
    async ({ showRefreshLoader = false } = {}) => {
      if (showRefreshLoader) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const data = await apiGet("/trucks");

        setTrucks(Array.isArray(data) ? data.map(mapTruck) : []);
      } catch (fetchError) {
        console.error("Unable to fetch trucks:", fetchError);

        setError(
          fetchError?.message || "Unable to load truck data."
        );

        setTrucks([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  React.useEffect(() => {
    fetchTrucks();
  }, [fetchTrucks]);

  // =======================================================
  // DERIVED DATA (only real recorded data)
  // =======================================================

  const filteredTrucks = React.useMemo(() => {
    const value = search.trim().toLowerCase();

    return trucks.filter((truck) => {
      if (statusFilter !== "All" && truck.status !== statusFilter) {
        return false;
      }

      if (!value) {
        return true;
      }

      return [
        truck.displayId,
        truck.vehicle,
        truck.driver,
        truck.company,
        truck.gate,
        truck.entryBy,
        truck.exitBy,
      ].some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(value)
      );
    });
  }, [trucks, search, statusFilter]);

  const insidePort = trucks.filter(
    (truck) => truck.status === "Inside Port"
  ).length;

  const exited = trucks.filter(
    (truck) => truck.status === "Exited"
  ).length;

  const entriesToday = trucks.filter((truck) =>
    isToday(truck.entryTime)
  ).length;

  const exitsToday = trucks.filter((truck) =>
    isToday(truck.exitTime)
  ).length;

  // =======================================================
  // HANDLERS
  // =======================================================

  const handleRefresh = () => {
    fetchTrucks({ showRefreshLoader: true });
  };

  const handleFormChange = (field) => (event) => {
    setForm((previous) => ({
      ...previous,
      [field]: event.target.value,
    }));
  };

  // Opens the entry form with the entry time set to "now".
  const toggleEntryForm = () => {
    setEntryError("");

    if (showEntryForm) {
      setShowEntryForm(false);
      return;
    }

    setForm({
      ...EMPTY_FORM,
      entry_time: toPortLocalInput(new Date()),
    });
    setShowEntryForm(true);
  };

  const clearEntryForm = () => {
    setForm({
      ...EMPTY_FORM,
      entry_time: toPortLocalInput(new Date()),
    });
    setEntryError("");
  };

  // ---------------- record an entry ----------------

  const handleEntrySubmit = async (event) => {
    event.preventDefault();

    if (entrySubmitting) {
      return;
    }

    setEntryError("");
    setNotice("");

    const weight = form.cargo_weight_tonnes.trim();

    if (weight && !(Number(weight) > 0)) {
      setEntryError("Cargo weight must be a number greater than 0.");
      return;
    }

    const entryIso = portLocalToIso(form.entry_time);

    if (!entryIso) {
      setEntryError("Enter the date and time of entry.");
      return;
    }

    // 5 minutes of allowance for clock differences.
    if (new Date(entryIso).getTime() > Date.now() + 5 * 60 * 1000) {
      setEntryError("Entry time cannot be in the future.");
      return;
    }

    const payload = {
      vehicle_number: form.vehicle_number,
      driver_name: form.driver_name,
      entry_time: entryIso,
      gate_number: form.gate_number,
      driver_phone: form.driver_phone || null,
      transport_company: form.transport_company || null,
      cargo_weight_tonnes: weight ? Number(weight) : null,
      entry_remarks: form.entry_remarks || null,
    };

    try {
      setEntrySubmitting(true);

      const saved = await apiPost("/trucks/entry", payload);

      setForm(EMPTY_FORM);
      setShowEntryForm(false);
      setNotice(
        `Entry recorded for ${saved?.vehicle_number || "vehicle"}.`
      );

      await fetchTrucks({ showRefreshLoader: true });
    } catch (submitError) {
      setEntryError(
        submitError?.message || "Unable to record the entry."
      );
    } finally {
      setEntrySubmitting(false);
    }
  };

  // ---------------- record an exit ----------------

  const openExitDialog = (truck) => {
    setExitTarget(truck);
    setExitTime(toPortLocalInput(new Date()));
    setExitRemarks("");
    setExitError("");
    setNotice("");
  };

  const closeExitDialog = () => {
    if (exitSubmitting) {
      return;
    }

    setExitTarget(null);
    setExitTime("");
    setExitRemarks("");
    setExitError("");
  };

  const handleExitConfirm = async () => {
    if (!exitTarget || exitSubmitting) {
      return;
    }

    const exitIso = portLocalToIso(exitTime);

    if (!exitIso) {
      setExitError("Enter the date and time of exit.");
      return;
    }

    const exitMs = new Date(exitIso).getTime();

    if (exitMs > Date.now() + 5 * 60 * 1000) {
      setExitError("Exit time cannot be in the future.");
      return;
    }

    const entryDate = parseDate(exitTarget.entryTime);

    if (entryDate && exitMs < entryDate.getTime()) {
      setExitError("Exit time cannot be before the entry time.");
      return;
    }

    try {
      setExitSubmitting(true);
      setExitError("");

      await apiPost(`/trucks/${exitTarget.id}/exit`, {
        exit_time: exitIso,
        exit_remarks: exitRemarks.trim() || null,
      });

      setNotice(`Exit recorded for ${exitTarget.vehicle}.`);
      setExitTarget(null);
      setExitTime("");
      setExitRemarks("");

      await fetchTrucks({ showRefreshLoader: true });
    } catch (submitError) {
      setExitError(
        submitError?.message || "Unable to record the exit."
      );
    } finally {
      setExitSubmitting(false);
    }
  };

  // ---------------- delete one / clear all ----------------

  const openDeleteDialog = (target) => {
    setDeleteTarget(target);
    setDeleteConfirmText("");
    setDeleteError("");
    setNotice("");
  };

  const closeDeleteDialog = () => {
    if (deleteSubmitting) {
      return;
    }

    setDeleteTarget(null);
    setDeleteConfirmText("");
    setDeleteError("");
  };

  const clearAllSelected = deleteTarget === "all";

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || deleteSubmitting) {
      return;
    }

    // Clearing everything needs the word DELETE typed in.
    if (
      clearAllSelected &&
      deleteConfirmText.trim().toUpperCase() !== "DELETE"
    ) {
      setDeleteError("Type 'DELETE' to confirm.");
      return;
    }

    try {
      setDeleteSubmitting(true);
      setDeleteError("");

      if (clearAllSelected) {
        const result = await apiDelete("/trucks?confirm=true");

        setNotice(
          `All gate records cleared (${result?.deleted ?? 0} deleted).`
        );
      } else {
        await apiDelete(`/trucks/${deleteTarget.id}`);

        setNotice(
          `Record ${deleteTarget.displayId} (${deleteTarget.vehicle}) deleted.`
        );
      }

      setDeleteTarget(null);
      setDeleteConfirmText("");

      await fetchTrucks({ showRefreshLoader: true });
    } catch (submitError) {
      setDeleteError(
        submitError?.message || "Unable to delete."
      );
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div className="mt-3">
      {/* PAGE HEADER */}

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdLocalShipping className="h-8 w-8" />
          </div>

          <p className="text-sm text-navy-700 dark:text-white">
            Gate log. The gate officer records each truck’s entry and
            exit (driver, vehicle registration, date and time). Every
            record keeps the officer’s name.
          </p>
        </div>

        <div className="flex gap-2">
          {canRecord && (
            <button
              type="button"
              onClick={toggleEntryForm}
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-brand-500 px-5 py-3 text-sm font-bold text-brand-500 transition hover:bg-lightPrimary dark:hover:bg-navy-700"
            >
              {showEntryForm ? (
                <MdClose className="h-5 w-5" />
              ) : (
                <MdAdd className="h-5 w-5" />
              )}
              {showEntryForm ? "Close" : "Record Entry"}
            </button>
          )}

          {canRecord && trucks.length > 0 && (
            <button
              type="button"
              onClick={() => openDeleteDialog("all")}
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-red-500 px-5 py-3 text-sm font-bold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <MdDelete className="h-5 w-5" />
              Clear All
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MdRefresh
              className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* MESSAGES */}

      {notice && (
        <div className="mb-6 rounded-[20px] border border-green-200 bg-green-50 p-5 text-sm text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400">
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-[20px] border border-red-200 bg-red-50 p-5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <span>{error}</span>

            <button
              type="button"
              onClick={handleRefresh}
              className="font-bold underline"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* ENTRY FORM */}

      {canRecord && showEntryForm && (
        <form
          onSubmit={handleEntrySubmit}
          className="mb-6 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800"
        >
          <h2 className="text-xl font-bold text-navy-700 dark:text-white">
            Record Truck Entry
          </h2>

          <p className="mt-1 text-sm text-gray-400">
            Times are Singapore time. The entry time is set to now; change
            it if the truck arrived earlier. Your name is added
            automatically and records cannot be edited later.
          </p>

          {entryError && (
            <div className={`mt-4 ${errorBoxClass}`}>{entryError}</div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className={labelClass}>
                Vehicle registration number *
              </label>
              <input
                required
                maxLength={40}
                value={form.vehicle_number}
                onChange={handleFormChange("vehicle_number")}
                placeholder="e.g. SGX1234A"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Driver name *</label>
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.driver_name}
                onChange={handleFormChange("driver_name")}
                placeholder="e.g. Tan Wei Ming"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Entry date &amp; time (SGT) *
              </label>
              <input
                required
                type="datetime-local"
                max={toPortLocalInput(new Date())}
                value={form.entry_time}
                onChange={handleFormChange("entry_time")}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Gate *</label>
              <input
                required
                maxLength={30}
                value={form.gate_number}
                onChange={handleFormChange("gate_number")}
                placeholder="e.g. Gate 1"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Driver phone</label>
              <input
                maxLength={20}
                value={form.driver_phone}
                onChange={handleFormChange("driver_phone")}
                placeholder="e.g. +65 9123 4567"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Transport company</label>
              <input
                maxLength={120}
                value={form.transport_company}
                onChange={handleFormChange("transport_company")}
                placeholder="e.g. Harbour Logistics Pte Ltd"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Cargo weight (tonnes)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.cargo_weight_tonnes}
                onChange={handleFormChange("cargo_weight_tonnes")}
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Remarks</label>
              <input
                maxLength={500}
                value={form.entry_remarks}
                onChange={handleFormChange("entry_remarks")}
                autoComplete="off"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={clearEntryForm}
              disabled={entrySubmitting}
              className={ghostButton}
            >
              Clear
            </button>

            <button
              type="submit"
              disabled={entrySubmitting}
              className={primaryButton}
            >
              {entrySubmitting ? "Saving..." : "Record Entry"}
            </button>
          </div>
        </form>
      )}

      {/* SUMMARY CARDS */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total Gate Records",
            value: trucks.length,
            valueClass: "text-navy-700 dark:text-white",
            iconBox: "bg-lightPrimary text-brand-500 dark:bg-navy-700",
            Icon: MdLogin,
          },
          {
            label: "Trucks Inside Port",
            value: insidePort,
            valueClass: "text-blue-500",
            iconBox: "bg-blue-50 text-blue-500 dark:bg-blue-500/10",
            Icon: MdLocalShipping,
          },
          {
            label: "Trucks Exited",
            value: exited,
            valueClass: "text-green-500",
            iconBox: "bg-green-50 text-green-500 dark:bg-green-500/10",
            Icon: MdLogout,
          },
          {
            label: "Entries Today (SGT)",
            value: entriesToday,
            valueClass: "text-orange-500",
            iconBox: "bg-orange-50 text-orange-500 dark:bg-orange-500/10",
            Icon: MdToday,
          },
        ].map(({ label, value, valueClass, iconBox, Icon }) => (
          <div
            key={label}
            className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">
                  {label}
                </p>

                <h2 className={`mt-2 text-3xl font-bold ${valueClass}`}>
                  {loading ? "—" : value}
                </h2>
              </div>

              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full ${iconBox}`}
              >
                <Icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ENTRY GATE + EXIT GATE */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        {[
          {
            title: "Entry Gate",
            subtitle: "Manually recorded entries",
            Icon: MdLogin,
            rows: [
              ["Entries today", entriesToday, "text-navy-700 dark:text-white"],
              ["Currently inside port", insidePort, "text-blue-500"],
            ],
          },
          {
            title: "Exit Gate",
            subtitle: "Manually recorded exits",
            Icon: MdLogout,
            rows: [
              ["Exits today", exitsToday, "text-navy-700 dark:text-white"],
              ["Awaiting exit", insidePort, "text-orange-500"],
            ],
          },
        ].map(({ title, subtitle, Icon, rows }) => (
          <div
            key={title}
            className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                  {title}
                </h2>

                <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
              </div>

              <Icon className="h-8 w-8 text-brand-500" />
            </div>

            <div className="mt-6 space-y-5">
              {rows.map(([label, value, valueClass]) => (
                <div
                  key={label}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-gray-400">{label}</span>

                  <span className={`font-bold ${valueClass}`}>
                    {loading ? "—" : value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* TRUCK ACTIVITY TABLE */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Truck Activity
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Who recorded each entry and exit, and when (Singapore
              time)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                  statusFilter === filter
                    ? "bg-brand-500 text-white"
                    : "bg-lightPrimary text-gray-600 hover:bg-gray-200 dark:bg-navy-900 dark:text-white"
                }`}
              >
                {filter}
              </button>
            ))}

            <div className="flex h-11 items-center rounded-xl bg-lightPrimary px-3 dark:bg-navy-900">
              <MdSearch className="mr-2 h-5 w-5 flex-shrink-0 text-gray-400" />

              <input
                type="text"
                name="gate-truck-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search vehicle..."
                autoComplete="off"
                spellCheck={false}
                style={{ backgroundColor: "transparent" }}
                className="w-40 appearance-none border-0 bg-transparent p-0 text-sm text-navy-700 shadow-none outline-none ring-0 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-white [&:-webkit-autofill]:[-webkit-text-fill-color:inherit] [&:-webkit-autofill]:[transition:background-color_9999s_ease-in-out_0s]"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <MdRefresh className="h-8 w-8 animate-spin text-brand-500" />

              <p className="text-sm font-medium text-gray-500">
                Loading truck data...
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  {[
                    "Vehicle",
                    "Driver",
                    "Company / Cargo",
                    "Gate",
                    "Entry",
                    "Entry by",
                    "Exit",
                    "Exit by",
                    "Status",
                    "Action",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredTrucks.length > 0 ? (
                  filteredTrucks.map((truck) => (
                    <tr
                      key={truck.id}
                      className="border-b border-gray-100 last:border-0 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
                    >
                      <td className="px-4 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-900">
                            <MdLocalShipping className="h-5 w-5" />
                          </div>

                          <div>
                            <p className="font-bold text-navy-700 dark:text-white">
                              {truck.vehicle}
                            </p>

                            <p className="text-xs text-gray-400">
                              {truck.displayId}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                        <p>{truck.driver}</p>
                        {truck.phone && (
                          <p className="text-xs text-gray-400">
                            {truck.phone}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                        <p>{truck.company}</p>
                        <p className="text-xs text-gray-400">
                          {truck.weight}
                        </p>
                      </td>

                      <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                        {truck.gate}
                      </td>

                      <td
                        className="px-4 py-5"
                        title={truck.entryRemarks || undefined}
                      >
                        <p className="text-sm font-medium text-navy-700 dark:text-white">
                          {formatTime(truck.entryTime)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(truck.entryTime)}
                        </p>
                      </td>

                      <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                        {truck.entryBy}
                      </td>

                      <td
                        className="px-4 py-5"
                        title={truck.exitRemarks || undefined}
                      >
                        <p className="text-sm font-medium text-navy-700 dark:text-white">
                          {formatTime(truck.exitTime)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(truck.exitTime)}
                        </p>
                      </td>

                      <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                        {truck.exitBy}
                      </td>

                      <td className="px-4 py-5">
                        <span
                          className={`rounded-full px-3 py-2 text-xs font-bold ${
                            statusStyles[truck.status] ||
                            statusStyles.Unknown
                          }`}
                        >
                          {truck.status}
                        </span>
                      </td>

                      <td className="px-4 py-5">
                        {canRecord ? (
                          <div className="flex items-center gap-2">
                            {truck.status === "Inside Port" && (
                              <button
                                type="button"
                                onClick={() => openExitDialog(truck)}
                                className="whitespace-nowrap rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-600"
                              >
                                Record Exit
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openDeleteDialog(truck)}
                              title="Delete this record"
                              aria-label={`Delete record ${truck.displayId}`}
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-300 text-red-500 transition hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                            >
                              <MdDelete className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="10" className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <MdLocalShipping className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />

                        <p className="font-bold text-navy-700 dark:text-white">
                          {search || statusFilter !== "All"
                            ? "No truck records found"
                            : "No truck records yet"}
                        </p>

                        <p className="mt-1 text-sm text-gray-500">
                          {search || statusFilter !== "All"
                            ? "Try a different search or filter."
                            : canRecord
                            ? "Use “Record Entry” when a truck arrives at the gate."
                            : "Records will appear here once gate officers add them."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && trucks.length > 0 && (
          <div className="mt-4 text-xs text-gray-500">
            Showing{" "}
            <span className="font-bold">{filteredTrucks.length}</span> of{" "}
            <span className="font-bold">{trucks.length}</span> truck
            records
          </div>
        )}
      </div>

      {/* SECURITY NOTICE */}

      <div className="mt-5 rounded-[20px] bg-orange-50 p-5 dark:bg-orange-500/10">
        <div className="flex items-start gap-3">
          <MdWarning className="mt-1 h-6 w-6 flex-shrink-0 text-orange-500" />

          <div>
            <p className="font-bold text-orange-600 dark:text-orange-400">
              Gate Security Monitoring
            </p>

            <p className="mt-1 text-sm text-orange-500 dark:text-orange-300">
              Gate records cannot be edited. A mistaken entry can be
              deleted, and every deletion is logged with the officer’s
              user ID on the server.
            </p>
          </div>
        </div>
      </div>

      {/* EXIT DIALOG (rendered on document.body so it stays centred) */}

      {exitTarget &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-xl dark:bg-navy-800">
              <h3 className="text-lg font-bold text-navy-700 dark:text-white">
                Record exit for {exitTarget.vehicle}
              </h3>

              <p className="mt-1 text-sm text-gray-400">
                Driver: {exitTarget.driver}. Entered{" "}
                {formatDateTime(exitTarget.entryTime)} (SGT).
              </p>

              {exitError && (
                <div className={`mt-4 ${errorBoxClass}`}>{exitError}</div>
              )}

              <label className={`${labelClass} mt-4`}>
                Exit date &amp; time (SGT) *
              </label>
              <input
                required
                type="datetime-local"
                max={toPortLocalInput(new Date())}
                value={exitTime}
                onChange={(event) => setExitTime(event.target.value)}
                className={inputClass}
              />

              <label className={`${labelClass} mt-4`}>
                Remarks (optional)
              </label>
              <input
                maxLength={500}
                value={exitRemarks}
                onChange={(event) => setExitRemarks(event.target.value)}
                autoComplete="off"
                className={inputClass}
              />

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeExitDialog}
                  disabled={exitSubmitting}
                  className={ghostButton}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleExitConfirm}
                  disabled={exitSubmitting}
                  className={primaryButton}
                >
                  {exitSubmitting ? "Saving..." : "Confirm Exit"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* DELETE DIALOG (rendered on document.body so it stays centred) */}

      {deleteTarget &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-xl dark:bg-navy-800">
              <h3 className="text-lg font-bold text-red-500">
                {clearAllSelected
                  ? "Clear all gate records?"
                  : `Delete record ${deleteTarget.displayId}?`}
              </h3>

              {clearAllSelected ? (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">
                  This permanently deletes all{" "}
                  <span className="font-bold">{trucks.length}</span> gate
                  records. It cannot be undone.
                </p>
              ) : (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">
                  This permanently deletes the record for{" "}
                  <span className="font-bold">{deleteTarget.vehicle}</span>{" "}
                  (driver {deleteTarget.driver}, entered{" "}
                  {formatDateTime(deleteTarget.entryTime)} SGT). It
                  cannot be undone.
                </p>
              )}

              {deleteError && (
                <div className={`mt-4 ${errorBoxClass}`}>{deleteError}</div>
              )}

              {clearAllSelected && (
                <>
                  <label className={`${labelClass} mt-4`}>
                    Type 'DELETE' to confirm
                  </label>
                  <input
                    value={deleteConfirmText}
                    onChange={(event) =>
                      setDeleteConfirmText(event.target.value)
                    }
                    autoComplete="off"
                    className={inputClass}
                  />
                </>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDeleteDialog}
                  disabled={deleteSubmitting}
                  className={ghostButton}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={
                    deleteSubmitting ||
                    (clearAllSelected &&
                      deleteConfirmText.trim().toUpperCase() !== "DELETE")
                  }
                  className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteSubmitting
                    ? "Deleting..."
                    : clearAllSelected
                    ? "Clear All"
                    : "Delete"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default GateManagement;