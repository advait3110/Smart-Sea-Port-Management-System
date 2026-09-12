import React from "react";
import {
  MdBuild,
  MdCheckCircle,
  MdWarning,
  MdError,
  MdSchedule,
  MdEngineering,
  MdDirectionsBoat,
  MdLocalShipping,
  MdElectricBolt,
  MdPrecisionManufacturing,
} from "react-icons/md";

const assets = [
  {
    id: "CRN-001",
    name: "Container Crane 01",
    category: "Crane",
    location: "Berth 1",
    status: "Operational",
    lastMaintenance: "28 Aug 2026",
    nextMaintenance: "28 Sep 2026",
  },
  {
    id: "CRN-002",
    name: "Container Crane 02",
    category: "Crane",
    location: "Berth 2",
    status: "Operational",
    lastMaintenance: "25 Aug 2026",
    nextMaintenance: "25 Sep 2026",
  },
  {
    id: "GEN-002",
    name: "Generator 02",
    category: "Generator",
    location: "Power House",
    status: "Maintenance",
    lastMaintenance: "20 Aug 2026",
    nextMaintenance: "05 Sep 2026",
  },
  {
    id: "FLT-004",
    name: "Forklift 04",
    category: "Forklift",
    location: "Cargo Yard",
    status: "Inspection Due",
    lastMaintenance: "15 Aug 2026",
    nextMaintenance: "07 Sep 2026",
  },
  {
    id: "PMP-003",
    name: "Harbour Pump 03",
    category: "Pump",
    location: "Utility Area",
    status: "Operational",
    lastMaintenance: "18 Aug 2026",
    nextMaintenance: "18 Sep 2026",
  },
  {
    id: "WB-001",
    name: "Weighbridge 01",
    category: "Weighbridge",
    location: "Main Gate",
    status: "Operational",
    lastMaintenance: "30 Aug 2026",
    nextMaintenance: "30 Sep 2026",
  },
];

const maintenanceAlerts = [
  {
    title: "Generator GEN-002 under maintenance",
    message: "Maintenance activity is currently in progress.",
    type: "warning",
  },
  {
    title: "Forklift FLT-004 inspection due",
    message: "Scheduled inspection is due on 07 Sep 2026.",
    type: "info",
  },
  {
    title: "Crane CRN-003 maintenance overdue",
    message: "Immediate inspection is recommended.",
    type: "critical",
  },
];

const statusStyles = {
  Operational:
    "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  Maintenance:
    "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  "Inspection Due":
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
};

const AssetMaintenance = () => {
  return (
    <div className="mt-3 space-y-6">

      {/* =====================================================
          INTRO
          ===================================================== */}

      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-700">
          <MdBuild className="h-7 w-7" />
        </div>

        <div>
          <p className="text-sm text-gray-500 dark:text-gray-300">
            Monitor port assets, equipment health and maintenance activities.
          </p>
        </div>
      </div>

      {/* =====================================================
          KPI CARDS
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-300">
                Total Assets
              </p>
              <h3 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                48
              </h3>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-500 dark:bg-blue-500/10">
              <MdPrecisionManufacturing className="h-6 w-6" />
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-400">
            Registered port equipment
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-300">
                Operational
              </p>
              <h3 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                41
              </h3>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-500 dark:bg-green-500/10">
              <MdCheckCircle className="h-6 w-6" />
            </div>
          </div>

          <p className="mt-3 text-xs text-green-500">
            85.4% of total assets
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-300">
                Under Maintenance
              </p>
              <h3 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                4
              </h3>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-500 dark:bg-orange-500/10">
              <MdBuild className="h-6 w-6" />
            </div>
          </div>

          <p className="mt-3 text-xs text-orange-500">
            Active maintenance jobs
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-300">
                Critical / Due
              </p>
              <h3 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                3
              </h3>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-500 dark:bg-red-500/10">
              <MdError className="h-6 w-6" />
            </div>
          </div>

          <p className="mt-3 text-xs text-red-500">
            Requires attention
          </p>
        </div>

      </div>

      {/* =====================================================
          ASSET CATEGORIES
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-700">
              <MdEngineering className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-navy-700 dark:text-white">
                Asset Categories
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Distribution of registered port equipment
              </p>
            </div>
          </div>

          <div className="space-y-4">

            {[
              ["Cranes", 8, "17%"],
              ["Forklifts", 12, "25%"],
              ["Trucks", 10, "21%"],
              ["Generators", 6, "13%"],
              ["Pumps", 7, "15%"],
              ["Other Equipment", 5, "9%"],
            ].map(([name, count, percentage]) => (
              <div key={name}>

                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-navy-700 dark:text-white">
                    {name}
                  </span>

                  <span className="text-gray-500 dark:text-gray-400">
                    {count}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-navy-700">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: percentage }}
                  />
                </div>

              </div>
            ))}

          </div>
        </div>

        {/* =================================================
            MAINTENANCE SUMMARY
            ================================================= */}

        <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-700">
              <MdSchedule className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-navy-700 dark:text-white">
                Maintenance Summary
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Current maintenance workload
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-navy-700">
              <p className="text-xs text-gray-500 dark:text-gray-300">
                Scheduled
              </p>
              <p className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
                7
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-navy-700">
              <p className="text-xs text-gray-500 dark:text-gray-300">
                In Progress
              </p>
              <p className="mt-2 text-2xl font-bold text-orange-500">
                4
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-navy-700">
              <p className="text-xs text-gray-500 dark:text-gray-300">
                Completed
              </p>
              <p className="mt-2 text-2xl font-bold text-green-500">
                23
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-navy-700">
              <p className="text-xs text-gray-500 dark:text-gray-300">
                Overdue
              </p>
              <p className="mt-2 text-2xl font-bold text-red-500">
                3
              </p>
            </div>

          </div>
        </div>

      </div>

      {/* =====================================================
          ASSET REGISTER
          ===================================================== */}

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">

          <div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
              Asset Register
            </h3>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Monitor equipment status and maintenance schedules
            </p>
          </div>

          <button className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
            + Add Asset
          </button>

        </div>

        <div className="overflow-x-auto">

          <table className="w-full min-w-[850px]">

            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Asset ID
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Asset
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Category
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Location
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Status
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Last Maintenance
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Next Maintenance
                </th>
              </tr>
            </thead>

            <tbody>

              {assets.map((asset) => (
                <tr
                  key={asset.id}
                  className="border-b border-gray-100 last:border-0 dark:border-white/5"
                >

                  <td className="px-4 py-4 text-sm font-bold text-brand-500">
                    {asset.id}
                  </td>

                  <td className="px-4 py-4 text-sm font-medium text-navy-700 dark:text-white">
                    {asset.name}
                  </td>

                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                    {asset.category}
                  </td>

                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                    {asset.location}
                  </td>

                  <td className="px-4 py-4">

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        statusStyles[asset.status] ||
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {asset.status}
                    </span>

                  </td>

                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                    {asset.lastMaintenance}
                  </td>

                  <td className="px-4 py-4 text-sm font-medium text-navy-700 dark:text-white">
                    {asset.nextMaintenance}
                  </td>

                </tr>
              ))}

            </tbody>

          </table>

        </div>
      </div>

      {/* =====================================================
          MAINTENANCE ALERTS
          ===================================================== */}

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-500 dark:bg-red-500/10">
            <MdWarning className="h-5 w-5" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
              Maintenance Alerts
            </h3>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Equipment requiring attention
            </p>
          </div>

        </div>

        <div className="space-y-3">

          {maintenanceAlerts.map((alert, index) => {

            const styles =
              alert.type === "critical"
                ? "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5"
                : alert.type === "warning"
                ? "border-orange-200 bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/5"
                : "border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/5";

            const icon =
              alert.type === "critical"
                ? <MdError className="h-5 w-5 text-red-500" />
                : alert.type === "warning"
                ? <MdBuild className="h-5 w-5 text-orange-500" />
                : <MdSchedule className="h-5 w-5 text-blue-500" />;

            return (
              <div
                key={index}
                className={`flex items-start gap-3 rounded-xl border p-4 ${styles}`}
              >
                <div className="mt-0.5">
                  {icon}
                </div>

                <div>
                  <p className="text-sm font-bold text-navy-700 dark:text-white">
                    {alert.title}
                  </p>

                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {alert.message}
                  </p>
                </div>
              </div>
            );
          })}

        </div>
      </div>

      {/* =====================================================
          FUTURE PREDICTIVE MAINTENANCE
          ===================================================== */}

      <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5 dark:border-brand-500/20 dark:bg-brand-500/5">

        <div className="flex items-start gap-3">

          <MdElectricBolt className="mt-1 h-6 w-6 text-brand-500" />

          <div>
            <h3 className="font-bold text-navy-700 dark:text-white">
              Predictive Maintenance
            </h3>

            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Future integration can use equipment history, maintenance
              records and sensor data to identify assets that may require
              maintenance before failure occurs.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};

export default AssetMaintenance;