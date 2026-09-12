import React from "react";

import {
  MdInventory,
  MdDirectionsBoat,
  MdScale,
  MdLocalShipping,
  MdSearch,
  MdAdd,
  MdRefresh,
  MdTrendingUp,
} from "react-icons/md";

// =========================================================
// DEMONSTRATION CARGO DATA
// =========================================================

const cargoData = [
  {
    id: "CG-001",
    vessel: "Cheng X",
    cargo: "Bitumen",
    operation: "Import",
    quantity: 3100,
    unit: "MT",
    berth: "B-01",
    status: "Completed",
  },
  {
    id: "CG-002",
    vessel: "MT Padmanabh",
    cargo: "Bitumen",
    operation: "Import",
    quantity: 4460.5,
    unit: "MT",
    berth: "B-02",
    status: "In Progress",
  },
  {
    id: "CG-003",
    vessel: "MT R Ocean",
    cargo: "Bitumen",
    operation: "Import",
    quantity: 2850,
    unit: "MT",
    berth: "B-03",
    status: "Scheduled",
  },
  {
    id: "CG-004",
    vessel: "MT Clayton II",
    cargo: "Bitumen",
    operation: "Import",
    quantity: 3200,
    unit: "MT",
    berth: "B-04",
    status: "Completed",
  },
  {
    id: "CG-005",
    vessel: "MT Stellar Ruby",
    cargo: "Bitumen",
    operation: "Import",
    quantity: 4100,
    unit: "MT",
    berth: "—",
    status: "Scheduled",
  },
  {
    id: "CG-006",
    vessel: "Bitumen Princess 2",
    cargo: "Asphalt / Bitumen",
    operation: "Import",
    quantity: 3600,
    unit: "MT",
    berth: "B-05",
    status: "In Progress",
  },
  {
    id: "CG-007",
    vessel: "African Avocet",
    cargo: "Bulk Cargo",
    operation: "Export",
    quantity: 5200,
    unit: "MT",
    berth: "B-06",
    status: "Completed",
  },
  {
    id: "CG-008",
    vessel: "JW Liberty",
    cargo: "Bulk Cargo",
    operation: "Export",
    quantity: 4750,
    unit: "MT",
    berth: "—",
    status: "Scheduled",
  },
  {
    id: "CG-009",
    vessel: "MARIVEX",
    cargo: "Petroleum Products",
    operation: "Import",
    quantity: 3900,
    unit: "MT",
    berth: "—",
    status: "Scheduled",
  },
  {
    id: "CG-010",
    vessel: "M S G",
    cargo: "Bitumen",
    operation: "Import",
    quantity: 3050,
    unit: "MT",
    berth: "B-07",
    status: "In Progress",
  },
];

// =========================================================
// STATUS STYLES
// =========================================================

const statusStyles = {
  Completed:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",

  "In Progress":
    "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",

  Scheduled:
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
};

// =========================================================
// CARGO OPERATIONS
// =========================================================

const CargoOperations = () => {
  const [search, setSearch] = React.useState("");

  // =======================================================
  // SEARCH
  // =======================================================

  const filteredCargo = cargoData.filter((item) => {
    const value = search.toLowerCase();

    return (
      item.vessel.toLowerCase().includes(value) ||
      item.cargo.toLowerCase().includes(value) ||
      item.operation.toLowerCase().includes(value) ||
      item.id.toLowerCase().includes(value)
    );
  });

  // =======================================================
  // CARGO STATISTICS
  // =======================================================

  const totalCargo = cargoData.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const importCargo = cargoData
    .filter((item) => item.operation === "Import")
    .reduce((total, item) => total + item.quantity, 0);

  const exportCargo = cargoData
    .filter((item) => item.operation === "Export")
    .reduce((total, item) => total + item.quantity, 0);

  const activeOperations = cargoData.filter(
    (item) => item.status === "In Progress"
  ).length;

  const completedOperations = cargoData.filter(
    (item) => item.status === "Completed"
  ).length;

  const scheduledOperations = cargoData.filter(
    (item) => item.status === "Scheduled"
  ).length;

  const importPercentage =
    totalCargo > 0 ? (importCargo / totalCargo) * 100 : 0;

  const exportPercentage =
    totalCargo > 0 ? (exportCargo / totalCargo) * 100 : 0;

  return (
    <div className="mt-3">

      {/* =====================================================
          PAGE HEADER
          ===================================================== */}

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">

        <div className="flex items-center gap-4">

          {/* Cargo Icon */}

          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">

            <MdInventory className="h-8 w-8" />

          </div>

          {/* Description */}

          <p className="text-sm text-gray-500 dark:text-gray-300">
            Monitor cargo handling, throughput and vessel operations.
          </p>

        </div>


        {/* Add Cargo */}

        <button className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600">

          <MdAdd className="h-5 w-5" />

          Add Cargo Operation

        </button>

      </div>


      {/* =====================================================
          DEMONSTRATION DATA NOTICE
          ===================================================== */}

      <div className="mb-6 rounded-[20px] border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-navy-800">

        <p className="font-medium text-blue-600 dark:text-blue-300">
          Demonstration data
        </p>

        <p className="mt-1 text-sm text-blue-500 dark:text-blue-200">
          The cargo records displayed here are prototype data for
          demonstrating the Smart Sea Port Management System. They do not
          represent confidential or live Karwar Port operational data.
        </p>

      </div>


      {/* =====================================================
          SUMMARY CARDS
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">

        {/* ===================================================
            TOTAL CARGO
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Total Cargo
              </p>

              <h2 className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
                {totalCargo.toLocaleString()} MT
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

              <MdScale className="h-6 w-6" />

            </div>

          </div>

          <p className="mt-3 text-xs text-gray-400">
            Total recorded throughput
          </p>

        </div>


        {/* ===================================================
            IMPORT CARGO
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Import Cargo
              </p>

              <h2 className="mt-2 text-2xl font-bold text-blue-500">
                {importCargo.toLocaleString()} MT
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-500/10">

              <MdInventory className="h-6 w-6" />

            </div>

          </div>

          <p className="mt-3 text-xs text-gray-400">
            Incoming cargo
          </p>

        </div>


        {/* ===================================================
            EXPORT CARGO
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Export Cargo
              </p>

              <h2 className="mt-2 text-2xl font-bold text-green-500">
                {exportCargo.toLocaleString()} MT
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">

              <MdTrendingUp className="h-6 w-6" />

            </div>

          </div>

          <p className="mt-3 text-xs text-gray-400">
            Outgoing cargo
          </p>

        </div>


        {/* ===================================================
            ACTIVE OPERATIONS
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Active Operations
              </p>

              <h2 className="mt-2 text-2xl font-bold text-orange-500">
                {activeOperations}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/10">

              <MdLocalShipping className="h-6 w-6" />

            </div>

          </div>

          <p className="mt-3 text-xs text-gray-400">
            Currently in progress
          </p>

        </div>

      </div>


      {/* =====================================================
          OPERATIONAL SUMMARY
          ===================================================== */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* ===================================================
            CARGO DISTRIBUTION
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Cargo Distribution
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Import versus export activity
              </p>

            </div>

            <MdInventory className="h-8 w-8 text-brand-500" />

          </div>


          <div className="mt-8">

            {/* Import */}

            <div className="mb-3 flex items-center justify-between">

              <span className="text-sm font-medium text-gray-500 dark:text-gray-300">
                Import
              </span>

              <span className="text-sm font-bold text-navy-700 dark:text-white">
                {importCargo.toLocaleString()} MT
              </span>

            </div>


            <div className="h-4 overflow-hidden rounded-full bg-lightPrimary dark:bg-navy-700">

              <div
                className="h-full rounded-full bg-brand-500"
                style={{
                  width: `${importPercentage}%`,
                }}
              />

            </div>


            {/* Export */}

            <div className="mb-3 mt-7 flex items-center justify-between">

              <span className="text-sm font-medium text-gray-500 dark:text-gray-300">
                Export
              </span>

              <span className="text-sm font-bold text-navy-700 dark:text-white">
                {exportCargo.toLocaleString()} MT
              </span>

            </div>


            <div className="h-4 overflow-hidden rounded-full bg-lightPrimary dark:bg-navy-700">

              <div
                className="h-full rounded-full bg-green-500"
                style={{
                  width: `${exportPercentage}%`,
                }}
              />

            </div>


            {/* Percentages */}

            <div className="mt-5 flex justify-between text-xs text-gray-400">

              <span>
                Import: {importPercentage.toFixed(1)}%
              </span>

              <span>
                Export: {exportPercentage.toFixed(1)}%
              </span>

            </div>

          </div>

        </div>


        {/* ===================================================
            OPERATIONAL INFORMATION
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Cargo Operations Overview
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Current handling activity
              </p>

            </div>

            <MdDirectionsBoat className="h-8 w-8 text-brand-500" />

          </div>


          <div className="mt-7 space-y-5">

            {/* Total Records */}

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Total cargo records
              </span>

              <span className="font-bold text-navy-700 dark:text-white">
                {cargoData.length}
              </span>

            </div>


            {/* Completed */}

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Completed operations
              </span>

              <span className="font-bold text-green-500">
                {completedOperations}
              </span>

            </div>


            {/* Active */}

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Operations in progress
              </span>

              <span className="font-bold text-blue-500">
                {activeOperations}
              </span>

            </div>


            {/* Scheduled */}

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Scheduled operations
              </span>

              <span className="font-bold text-orange-500">
                {scheduledOperations}
              </span>

            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          CARGO TABLE
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        {/* Table Header */}

        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Cargo Operations
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Vessel-linked cargo handling records
            </p>

          </div>


          {/* Search + Refresh */}

          <div className="flex gap-2">

            <div className="flex h-11 items-center rounded-xl bg-lightPrimary px-3 dark:bg-navy-900">

              <MdSearch className="mr-2 h-5 w-5 text-gray-400" />

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cargo..."
                className="w-44 bg-transparent text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
              />

            </div>


            <button
              onClick={() => setSearch("")}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-lightPrimary text-gray-600 dark:bg-navy-900 dark:text-white"
              title="Clear search"
            >

              <MdRefresh className="h-5 w-5" />

            </button>

          </div>

        </div>


        {/* ===================================================
            TABLE
            =================================================== */}

        <div className="overflow-x-auto">

          <table className="w-full min-w-[1050px]">

            <thead>

              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Cargo ID
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Vessel
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Cargo Type
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Operation
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Quantity
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Berth
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Status
                </th>

              </tr>

            </thead>


            <tbody>

              {filteredCargo.map((item) => (

                <tr
                  key={item.id}
                  className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
                >

                  {/* Cargo ID */}

                  <td className="px-4 py-5">

                    <span className="font-bold text-brand-500">
                      {item.id}
                    </span>

                  </td>


                  {/* Vessel */}

                  <td className="px-4 py-5">

                    <div className="flex items-center gap-3">

                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-900">

                        <MdDirectionsBoat className="h-5 w-5" />

                      </div>

                      <span className="font-bold text-navy-700 dark:text-white">
                        {item.vessel}
                      </span>

                    </div>

                  </td>


                  {/* Cargo Type */}

                  <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                    {item.cargo}
                  </td>


                  {/* Operation */}

                  <td className="px-4 py-5">

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        item.operation === "Import"
                          ? "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                          : "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                      }`}
                    >
                      {item.operation}
                    </span>

                  </td>


                  {/* Quantity */}

                  <td className="px-4 py-5 text-sm font-bold text-navy-700 dark:text-white">

                    {item.quantity.toLocaleString()} {item.unit}

                  </td>


                  {/* Berth */}

                  <td className="px-4 py-5 text-sm font-bold text-navy-700 dark:text-white">

                    {item.berth}

                  </td>


                  {/* Status */}

                  <td className="px-4 py-5">

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        statusStyles[item.status]
                      }`}
                    >
                      {item.status}
                    </span>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>


        {/* No Results */}

        {filteredCargo.length === 0 && (

          <div className="py-10 text-center text-sm text-gray-400">

            No cargo records found.

          </div>

        )}

      </div>


      {/* =====================================================
          OPERATIONAL NOTE
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex items-start gap-4">

          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

            <MdInventory className="h-6 w-6" />

          </div>


          <div>

            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Cargo Management Objective
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-300">
              This module provides a centralized view of cargo operations
              associated with vessels and berths. In the production version,
              these records will be connected to the backend database and can
              support throughput analysis, operational planning and revenue
              analytics.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
};

export default CargoOperations;