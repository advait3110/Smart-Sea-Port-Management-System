import React from "react";

import {
  MdWarning,
  MdError,
  MdInfo,
  MdCheckCircle,
  MdBuild,
  MdDirectionsBoat,
  MdAnchor,
  MdLocalShipping,
  MdAccessTime,
  MdRefresh,
} from "react-icons/md";

// =========================================================
// DEMONSTRATION DATA
// =========================================================

const alertsData = [
  {
    id: "ALT-001",
    title: "Vessel operation delay",
    description:
      "Vessel operation has exceeded the planned operational window.",
    category: "Vessel Operations",
    severity: "Attention",
    status: "Open",
    time: "10 minutes ago",
    icon: <MdDirectionsBoat className="h-5 w-5" />,
  },
  {
    id: "ALT-002",
    title: "Berth maintenance",
    description:
      "B-06 is currently unavailable due to scheduled maintenance.",
    category: "Berth",
    severity: "Critical",
    status: "Open",
    time: "25 minutes ago",
    icon: <MdAnchor className="h-5 w-5" />,
  },
  {
    id: "ALT-003",
    title: "High truck activity",
    description:
      "Truck movement at the port gate is currently above the normal level.",
    category: "Gate Operations",
    severity: "Warning",
    status: "Open",
    time: "42 minutes ago",
    icon: <MdLocalShipping className="h-5 w-5" />,
  },
  {
    id: "ALT-004",
    title: "Cargo operation pending",
    description:
      "A scheduled cargo handling operation is awaiting assignment.",
    category: "Cargo",
    severity: "Warning",
    status: "Open",
    time: "1 hour ago",
    icon: <MdBuild className="h-5 w-5" />,
  },
  {
    id: "ALT-005",
    title: "Vessel arrival approaching",
    description:
      "An expected vessel is approaching its scheduled arrival window.",
    category: "Vessel Operations",
    severity: "Information",
    status: "Monitoring",
    time: "2 hours ago",
    icon: <MdAccessTime className="h-5 w-5" />,
  },
];

// =========================================================
// SEVERITY STYLES
// =========================================================

const getSeverityStyle = (severity) => {
  switch (severity) {
    case "Critical":
      return "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400";

    case "Warning":
      return "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400";

    case "Attention":
      return "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400";

    case "Information":
      return "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400";

    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-500/10 dark:text-gray-400";
  }
};

// =========================================================
// STATUS STYLES
// =========================================================

const getStatusStyle = (status) => {
  switch (status) {
    case "Open":
      return "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400";

    case "Monitoring":
      return "bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-400";

    case "Resolved":
      return "bg-green-50 text-green-500 dark:bg-green-500/10 dark:text-green-400";

    default:
      return "bg-gray-100 text-gray-500 dark:bg-gray-500/10 dark:text-gray-400";
  }
};

// =========================================================
// PORT ALERTS
// =========================================================

const PortAlerts = () => {
  // =======================================================
  // REFRESH STATE
  // =======================================================

  const [lastRefresh, setLastRefresh] = React.useState("Just now");

  // =======================================================
  // SUMMARY STATISTICS
  // =======================================================

  const totalAlerts = alertsData.length;

  const criticalAlerts = alertsData.filter(
    (alert) => alert.severity === "Critical"
  ).length;

  const warningAlerts = alertsData.filter(
    (alert) =>
      alert.severity === "Warning" ||
      alert.severity === "Attention"
  ).length;

  const monitoringAlerts = alertsData.filter(
    (alert) => alert.status === "Monitoring"
  ).length;

  const openAlerts = alertsData.filter(
    (alert) => alert.status === "Open"
  ).length;

  // =======================================================
  // REFRESH HANDLER
  // =======================================================

  const handleRefresh = () => {
    setLastRefresh("Just now");
  };

  // =======================================================
  // PAGE
  // =======================================================

  return (
    <div className="mt-3">

      {/* =====================================================
          DEMONSTRATION DATA NOTICE
          ===================================================== */}

      <div className="mb-6 rounded-[20px] border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-navy-800">

        <p className="font-medium text-blue-600 dark:text-blue-300">
          Demonstration data
        </p>

        <p className="mt-1 text-sm text-blue-500 dark:text-blue-200">
          The alerts displayed here are prototype data for demonstrating the
          Smart Port Management interface. They do not represent confidential
          or live Karwar Port operational alerts.
        </p>

      </div>


      {/* =====================================================
          SUMMARY CARDS
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">

        {/* ===================================================
            TOTAL ALERTS
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Total Alerts
              </p>

              <h2 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                {totalAlerts}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

              <MdWarning className="h-6 w-6" />

            </div>

          </div>

        </div>


        {/* ===================================================
            CRITICAL
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Critical
              </p>

              <h2 className="mt-2 text-3xl font-bold text-red-500">
                {criticalAlerts}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">

              <MdError className="h-6 w-6" />

            </div>

          </div>

        </div>


        {/* ===================================================
            WARNINGS
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Warnings
              </p>

              <h2 className="mt-2 text-3xl font-bold text-orange-500">
                {warningAlerts}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/10">

              <MdWarning className="h-6 w-6" />

            </div>

          </div>

        </div>


        {/* ===================================================
            MONITORING
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Monitoring
              </p>

              <h2 className="mt-2 text-3xl font-bold text-blue-500">
                {monitoringAlerts}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-500/10">

              <MdInfo className="h-6 w-6" />

            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          ALERT OVERVIEW
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Alert Overview
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Current operational events requiring attention
            </p>

          </div>

          <div className="flex items-center gap-3">

            <span className="text-xs text-gray-400">
              Last refresh: {lastRefresh}
            </span>

            <button
              type="button"
              onClick={handleRefresh}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-lightPrimary text-gray-600 transition hover:bg-gray-200 dark:bg-navy-900 dark:text-white dark:hover:bg-navy-700"
              title="Refresh alerts"
            >

              <MdRefresh className="h-5 w-5" />

            </button>

          </div>

        </div>


        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Critical */}

          <div className="rounded-xl bg-red-50 p-5 dark:bg-red-500/10">

            <div className="flex items-center gap-3">

              <MdError className="h-6 w-6 text-red-500" />

              <p className="font-bold text-red-600 dark:text-red-400">
                Critical Issues
              </p>

            </div>

            <p className="mt-3 text-sm text-gray-500 dark:text-gray-300">
              Immediate operational attention may be required.
            </p>

            <p className="mt-3 text-2xl font-bold text-red-500">
              {criticalAlerts}
            </p>

          </div>


          {/* Warnings */}

          <div className="rounded-xl bg-orange-50 p-5 dark:bg-orange-500/10">

            <div className="flex items-center gap-3">

              <MdWarning className="h-6 w-6 text-orange-500" />

              <p className="font-bold text-orange-600 dark:text-orange-400">
                Operational Warnings
              </p>

            </div>

            <p className="mt-3 text-sm text-gray-500 dark:text-gray-300">
              Operational conditions should be reviewed by the responsible
              team.
            </p>

            <p className="mt-3 text-2xl font-bold text-orange-500">
              {warningAlerts}
            </p>

          </div>


          {/* Monitoring */}

          <div className="rounded-xl bg-blue-50 p-5 dark:bg-blue-500/10">

            <div className="flex items-center gap-3">

              <MdInfo className="h-6 w-6 text-blue-500" />

              <p className="font-bold text-blue-600 dark:text-blue-400">
                Monitoring
              </p>

            </div>

            <p className="mt-3 text-sm text-gray-500 dark:text-gray-300">
              Events being monitored without immediate intervention.
            </p>

            <p className="mt-3 text-2xl font-bold text-blue-500">
              {monitoringAlerts}
            </p>

          </div>

        </div>

      </div>


      {/* =====================================================
          ALERT TABLE
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        {/* ===================================================
            TABLE HEADER
            =================================================== */}

        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Active Alerts
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Operational events currently requiring attention
            </p>

          </div>


          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
          >

            <MdRefresh className="h-5 w-5" />

            Refresh Alerts

          </button>

        </div>


        {/* ===================================================
            ALERT TABLE
            =================================================== */}

        <div className="overflow-x-auto">

          <table className="w-full min-w-[950px]">

            <thead>

              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Alert
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Category
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Severity
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Status
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Time
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Action
                </th>

              </tr>

            </thead>


            <tbody>

              {alertsData.map((alert) => (

                <tr
                  key={alert.id}
                  className="border-b border-gray-100 last:border-0 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
                >

                  {/* =================================================
                      ALERT
                      ================================================= */}

                  <td className="px-4 py-5">

                    <div className="flex items-center gap-3">

                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-900">
                        {alert.icon}
                      </div>

                      <div>

                        <p className="font-bold text-navy-700 dark:text-white">
                          {alert.title}
                        </p>

                        <p className="mt-1 max-w-[350px] text-xs leading-5 text-gray-400">
                          {alert.description}
                        </p>

                        <p className="mt-1 text-xs text-gray-300">
                          {alert.id}
                        </p>

                      </div>

                    </div>

                  </td>


                  {/* =================================================
                      CATEGORY
                      ================================================= */}

                  <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                    {alert.category}
                  </td>


                  {/* =================================================
                      SEVERITY
                      ================================================= */}

                  <td className="px-4 py-5">

                    <span
                      className={`rounded-full px-3 py-2 text-xs font-bold ${getSeverityStyle(
                        alert.severity
                      )}`}
                    >
                      {alert.severity}
                    </span>

                  </td>


                  {/* =================================================
                      STATUS
                      ================================================= */}

                  <td className="px-4 py-5">

                    <span
                      className={`rounded-full px-3 py-2 text-xs font-bold ${getStatusStyle(
                        alert.status
                      )}`}
                    >
                      {alert.status}
                    </span>

                  </td>


                  {/* =================================================
                      TIME
                      ================================================= */}

                  <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                    {alert.time}
                  </td>


                  {/* =================================================
                      ACTION
                      ================================================= */}

                  <td className="px-4 py-5">

                    <button
                      type="button"
                      className="text-sm font-bold text-brand-500 transition hover:text-brand-600"
                    >
                      View Details
                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>


      {/* =====================================================
          SYSTEM STATUS
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex items-center gap-3">

          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">

            <MdCheckCircle className="h-6 w-6" />

          </div>

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Alert Monitoring System
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Prototype monitoring status
            </p>

          </div>

        </div>


        <div className="mt-5 rounded-xl bg-green-50 p-5 dark:bg-green-500/10">

          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">

            <div>

              <p className="font-bold text-green-600 dark:text-green-400">
                Monitoring service operational
              </p>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                Port events can be monitored from a centralized operational
                dashboard.
              </p>

            </div>


            <span className="w-fit rounded-full bg-green-100 px-4 py-2 text-xs font-bold text-green-600 dark:bg-green-500/10 dark:text-green-400">
              System Online
            </span>

          </div>

        </div>

      </div>


      {/* =====================================================
          FOOTER / FUTURE INTEGRATION
          ===================================================== */}

      <div className="mt-5 rounded-[20px] border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-navy-800">

        <div className="flex items-start gap-3">

          <MdWarning className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-500" />

          <p className="text-sm leading-6 text-gray-500 dark:text-gray-300">

            <span className="font-bold text-navy-700 dark:text-white">
              Future integration:
            </span>{" "}

            Alert events will later be generated from the FastAPI backend
            using operational data from PostgreSQL and other monitoring
            services. The current records are demonstration data only.

          </p>

        </div>

      </div>

    </div>
  );
};

export default PortAlerts;