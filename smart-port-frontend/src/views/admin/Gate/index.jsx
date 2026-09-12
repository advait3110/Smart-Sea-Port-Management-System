import React from "react";

import {
  MdLocalShipping,
  MdQrCode2,
  MdLogin,
  MdLogout,
  MdPendingActions,
  MdWarning,
  MdSearch,
  MdRefresh,
} from "react-icons/md";

// =========================================================
// DEMONSTRATION DATA
// =========================================================

const truckData = [
  {
    id: "TRK-001",
    vehicle: "KA-47-M-2841",
    driver: "Ramesh Kumar",
    cargo: "Bitumen",
    purpose: "Cargo Delivery",
    entry: "08:15 AM",
    exit: "11:40 AM",
    status: "Exited",
  },
  {
    id: "TRK-002",
    vehicle: "KA-47-N-1932",
    driver: "Suresh Naik",
    cargo: "Bitumen",
    purpose: "Cargo Delivery",
    entry: "09:05 AM",
    exit: "—",
    status: "Inside Port",
  },
  {
    id: "TRK-003",
    vehicle: "KA-01-AB-7624",
    driver: "Mahesh Gowda",
    cargo: "Bulk Cargo",
    purpose: "Cargo Loading",
    entry: "09:40 AM",
    exit: "—",
    status: "Inside Port",
  },
  {
    id: "TRK-004",
    vehicle: "KA-47-P-5287",
    driver: "Prakash Shetty",
    cargo: "Bitumen",
    purpose: "Cargo Delivery",
    entry: "10:20 AM",
    exit: "01:15 PM",
    status: "Exited",
  },
  {
    id: "TRK-005",
    vehicle: "KA-20-X-4512",
    driver: "Ganesh Patil",
    cargo: "General Cargo",
    purpose: "Cargo Loading",
    entry: "11:05 AM",
    exit: "—",
    status: "Inside Port",
  },
  {
    id: "TRK-006",
    vehicle: "KA-47-Q-8126",
    driver: "Vijay Kumar",
    cargo: "Bitumen",
    purpose: "Cargo Delivery",
    entry: "12:10 PM",
    exit: "—",
    status: "Pending Verification",
  },
];

// =========================================================
// STATUS STYLES
// =========================================================

const statusStyles = {
  Exited:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",

  "Inside Port":
    "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",

  "Pending Verification":
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
};

// =========================================================
// GATE & TRUCK MANAGEMENT
// =========================================================

const GateManagement = () => {
  // =======================================================
  // SEARCH STATE
  // =======================================================

  const [search, setSearch] = React.useState("");

  // =======================================================
  // FILTER TRUCK DATA
  // =======================================================

  const filteredTrucks = truckData.filter((truck) => {
    const value = search.toLowerCase();

    return (
      truck.id.toLowerCase().includes(value) ||
      truck.vehicle.toLowerCase().includes(value) ||
      truck.driver.toLowerCase().includes(value) ||
      truck.cargo.toLowerCase().includes(value) ||
      truck.purpose.toLowerCase().includes(value) ||
      truck.status.toLowerCase().includes(value)
    );
  });

  // =======================================================
  // SUMMARY STATISTICS
  // =======================================================

  const insidePort = truckData.filter(
    (truck) => truck.status === "Inside Port"
  ).length;

  const exited = truckData.filter(
    (truck) => truck.status === "Exited"
  ).length;

  const pending = truckData.filter(
    (truck) => truck.status === "Pending Verification"
  ).length;

  const totalEntries = truckData.length;

  // =======================================================
  // PAGE
  // =======================================================

  return (
    <div className="mt-3">

      {/* =====================================================
          PAGE HEADER
          ===================================================== */}

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">

        <div className="flex items-center gap-4">

          {/* Icon */}

          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">

            <MdLocalShipping className="h-8 w-8" />

          </div>

          {/* Description */}

          <div>

            <p className="text-sm text-navy-700 dark:text-white">
              Monitor truck movement, gate entries, exits and digital gate
              passes.
            </p>

          </div>

        </div>


        {/* Generate Gate Pass */}

        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
        >

          <MdQrCode2 className="h-5 w-5" />

          Generate Gate Pass

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
          The truck and gate records displayed here are prototype data for
          demonstrating the Smart Port Management interface. They do not
          represent confidential or live Karwar Port operational data.
        </p>

      </div>


      {/* =====================================================
          SUMMARY CARDS
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">

        {/* ===================================================
            TOTAL ENTRIES
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Total Gate Entries
              </p>

              <h2 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                {totalEntries}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

              <MdLogin className="h-6 w-6" />

            </div>

          </div>

        </div>


        {/* ===================================================
            INSIDE PORT
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Trucks Inside Port
              </p>

              <h2 className="mt-2 text-3xl font-bold text-blue-500">
                {insidePort}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-500/10">

              <MdLocalShipping className="h-6 w-6" />

            </div>

          </div>

        </div>


        {/* ===================================================
            EXITED
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Trucks Exited
              </p>

              <h2 className="mt-2 text-3xl font-bold text-green-500">
                {exited}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">

              <MdLogout className="h-6 w-6" />

            </div>

          </div>

        </div>


        {/* ===================================================
            PENDING
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Pending Verification
              </p>

              <h2 className="mt-2 text-3xl font-bold text-orange-500">
                {pending}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/10">

              <MdPendingActions className="h-6 w-6" />

            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          GATE OPERATIONS
          ===================================================== */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* ===================================================
            ENTRY GATE
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Entry Gate
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Current vehicle entry activity
              </p>

            </div>

            <MdLogin className="h-8 w-8 text-brand-500" />

          </div>


          <div className="mt-6 space-y-5">

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Entries today
              </span>

              <span className="font-bold text-navy-700 dark:text-white">
                124
              </span>

            </div>


            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Verified entries
              </span>

              <span className="font-bold text-green-500">
                118
              </span>

            </div>


            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Pending verification
              </span>

              <span className="font-bold text-orange-500">
                6
              </span>

            </div>

          </div>

        </div>


        {/* ===================================================
            EXIT GATE
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Exit Gate
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Current vehicle exit activity
              </p>

            </div>

            <MdLogout className="h-8 w-8 text-brand-500" />

          </div>


          <div className="mt-6 space-y-5">

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Exits today
              </span>

              <span className="font-bold text-navy-700 dark:text-white">
                87
              </span>

            </div>


            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Digital passes verified
              </span>

              <span className="font-bold text-green-500">
                82
              </span>

            </div>


            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Manual verification
              </span>

              <span className="font-bold text-orange-500">
                5
              </span>

            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          DIGITAL GATE PASS
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">

          <div className="flex items-center gap-4">

            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

              <MdQrCode2 className="h-8 w-8" />

            </div>


            <div>

              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Digital Gate Pass
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                QR-based vehicle identification and gate verification.
              </p>

            </div>

          </div>


          <button
            type="button"
            className="rounded-xl border border-brand-500 px-5 py-3 text-sm font-bold text-brand-500 transition hover:bg-brand-500 hover:text-white"
          >
            Scan QR Pass
          </button>

        </div>


        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Active Passes */}

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <p className="text-sm text-gray-400">
              Active Gate Passes
            </p>

            <p className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
              31
            </p>

          </div>


          {/* Verified */}

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <p className="text-sm text-gray-400">
              Verified Today
            </p>

            <p className="mt-2 text-2xl font-bold text-green-500">
              118
            </p>

          </div>


          {/* Expired */}

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <p className="text-sm text-gray-400">
              Expired Passes
            </p>

            <p className="mt-2 text-2xl font-bold text-orange-500">
              3
            </p>

          </div>

        </div>

      </div>


      {/* =====================================================
          TRUCK ACTIVITY TABLE
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        {/* Table Header */}

        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Truck Activity
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Current vehicle entries, exits and verification status
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
                placeholder="Search vehicle..."
                className="w-40 bg-transparent text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
              />

            </div>


            <button
              type="button"
              onClick={() => setSearch("")}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-lightPrimary text-gray-600 transition hover:bg-gray-200 dark:bg-navy-900 dark:text-white dark:hover:bg-navy-700"
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

          <table className="w-full min-w-[1000px]">

            <thead>

              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Vehicle
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Driver
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Cargo
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Purpose
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Entry
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Exit
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Status
                </th>

              </tr>

            </thead>


            <tbody>

              {filteredTrucks.map((truck) => (

                <tr
                  key={truck.id}
                  className="border-b border-gray-100 last:border-0 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
                >

                  {/* Vehicle */}

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
                          {truck.id}
                        </p>

                      </div>

                    </div>

                  </td>


                  {/* Driver */}

                  <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                    {truck.driver}
                  </td>


                  {/* Cargo */}

                  <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                    {truck.cargo}
                  </td>


                  {/* Purpose */}

                  <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                    {truck.purpose}
                  </td>


                  {/* Entry */}

                  <td className="px-4 py-5 text-sm font-medium text-navy-700 dark:text-white">
                    {truck.entry}
                  </td>


                  {/* Exit */}

                  <td className="px-4 py-5 text-sm font-medium text-navy-700 dark:text-white">
                    {truck.exit}
                  </td>


                  {/* Status */}

                  <td className="px-4 py-5">

                    <span
                      className={`rounded-full px-3 py-2 text-xs font-bold ${
                        statusStyles[truck.status]
                      }`}
                    >
                      {truck.status}
                    </span>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>


        {/* No Search Results */}

        {filteredTrucks.length === 0 && (

          <div className="py-10 text-center text-sm text-gray-400">

            No truck records found.

          </div>

        )}

      </div>


      {/* =====================================================
          SECURITY NOTICE
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-orange-50 p-5 dark:bg-orange-500/10">

        <div className="flex items-start gap-3">

          <MdWarning className="mt-1 h-6 w-6 flex-shrink-0 text-orange-500" />

          <div>

            <p className="font-bold text-orange-600 dark:text-orange-400">
              Gate Security Monitoring
            </p>

            <p className="mt-1 text-sm text-orange-500 dark:text-orange-300">
              All vehicle entries and exits should be verified through the
              designated gate verification process. Suspicious or invalid
              gate-pass activity should be flagged for security review.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
};

export default GateManagement;