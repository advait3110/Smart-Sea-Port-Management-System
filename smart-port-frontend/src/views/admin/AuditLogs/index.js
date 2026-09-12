import React from "react";
import {
  MdHistory,
  MdSearch,
  MdFilterList,
  MdLogin,
  MdLogout,
  MdEdit,
  MdDelete,
  MdAdd,
  MdSecurity,
  MdCheckCircle,
  MdWarning,
} from "react-icons/md";

const auditLogs = [
  {
    id: 1,
    user: "Port Administrator",
    role: "Super Admin",
    action: "Logged In",
    module: "Authentication",
    description: "Administrator successfully logged into the system.",
    time: "04 Sep 2026, 09:12 PM",
    status: "Success",
    type: "login",
  },
  {
    id: 2,
    user: "Marine Operations",
    role: "Marine Officer",
    action: "Updated Vessel",
    module: "Vessel Management",
    description: "Updated vessel arrival information.",
    time: "04 Sep 2026, 08:54 PM",
    status: "Success",
    type: "edit",
  },
  {
    id: 3,
    user: "Port Operations",
    role: "Operations Manager",
    action: "Updated Berth",
    module: "Berth Management",
    description: "Modified berth allocation schedule.",
    time: "04 Sep 2026, 08:41 PM",
    status: "Success",
    type: "edit",
  },
  {
    id: 4,
    user: "Security Officer",
    role: "Gate Security",
    action: "Logged In",
    module: "Authentication",
    description: "Security officer authenticated successfully.",
    time: "04 Sep 2026, 08:30 PM",
    status: "Success",
    type: "login",
  },
  {
    id: 5,
    user: "Cargo Department",
    role: "Cargo Manager",
    action: "Added Record",
    module: "Cargo Operations",
    description: "Added a new cargo handling record.",
    time: "04 Sep 2026, 07:48 PM",
    status: "Success",
    type: "add",
  },
  {
    id: 6,
    user: "Maintenance Team",
    role: "Maintenance Officer",
    action: "Updated Asset",
    module: "Asset & Maintenance",
    description: "Updated equipment maintenance status.",
    time: "04 Sep 2026, 07:22 PM",
    status: "Success",
    type: "edit",
  },
  {
    id: 7,
    user: "Port Administrator",
    role: "Super Admin",
    action: "Deleted Record",
    module: "Document Management",
    description: "Removed an outdated operational document.",
    time: "04 Sep 2026, 06:55 PM",
    status: "Warning",
    type: "delete",
  },
  {
    id: 8,
    user: "Unknown User",
    role: "Unknown",
    action: "Failed Login",
    module: "Authentication",
    description: "Invalid credentials were entered.",
    time: "04 Sep 2026, 06:31 PM",
    status: "Failed",
    type: "warning",
  },
  {
    id: 9,
    user: "Port Operations",
    role: "Operations Manager",
    action: "Logged Out",
    module: "Authentication",
    description: "User successfully logged out.",
    time: "04 Sep 2026, 05:46 PM",
    status: "Success",
    type: "logout",
  },
];

const getActionIcon = (type) => {
  switch (type) {
    case "login":
      return <MdLogin className="h-5 w-5 text-green-500" />;

    case "logout":
      return <MdLogout className="h-5 w-5 text-blue-500" />;

    case "edit":
      return <MdEdit className="h-5 w-5 text-orange-500" />;

    case "delete":
      return <MdDelete className="h-5 w-5 text-red-500" />;

    case "add":
      return <MdAdd className="h-5 w-5 text-purple-500" />;

    case "warning":
      return <MdWarning className="h-5 w-5 text-red-500" />;

    default:
      return <MdHistory className="h-5 w-5 text-gray-500" />;
  }
};

const AuditLogs = () => {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("All");

  const filteredLogs = auditLogs.filter((log) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      log.user.toLowerCase().includes(searchText) ||
      log.action.toLowerCase().includes(searchText) ||
      log.module.toLowerCase().includes(searchText) ||
      log.description.toLowerCase().includes(searchText);

    const matchesFilter =
      filter === "All" || log.status === filter;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="mt-3">

      {/* =====================================================
          DESCRIPTION + FILTER
          ===================================================== */}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <p className="text-sm text-gray-500 dark:text-gray-300">
          Monitor system activity, user actions and security events
          across the port management system.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">

          {/* Search */}

          <div className="relative">

            <MdSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search audit logs..."
              className="h-11 w-full rounded-xl bg-white pl-10 pr-4 text-sm text-navy-700 shadow-sm outline-none dark:bg-navy-800 dark:text-white sm:w-64"
            />

          </div>

          {/* Filter */}

          <div className="relative">

            <MdFilterList className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-11 rounded-xl bg-white pl-10 pr-8 text-sm font-medium text-navy-700 shadow-sm outline-none dark:bg-navy-800 dark:text-white"
            >
              <option value="All">All Events</option>
              <option value="Success">Success</option>
              <option value="Warning">Warning</option>
              <option value="Failed">Failed</option>
            </select>

          </div>

        </div>

      </div>


      {/* =====================================================
          SUMMARY CARDS
          ===================================================== */}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        {/* Total Events */}

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-4">

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-navy-700">
              <MdHistory className="h-6 w-6 text-blue-500" />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-300">
                Total Events
              </p>

              <p className="text-2xl font-bold text-navy-700 dark:text-white">
                1,284
              </p>
            </div>

          </div>

        </div>


        {/* Successful */}

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-4">

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 dark:bg-navy-700">
              <MdCheckCircle className="h-6 w-6 text-green-500" />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-300">
                Successful Events
              </p>

              <p className="text-2xl font-bold text-navy-700 dark:text-white">
                1,246
              </p>
            </div>

          </div>

        </div>


        {/* Security Events */}

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-4">

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 dark:bg-navy-700">
              <MdSecurity className="h-6 w-6 text-purple-500" />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-300">
                Security Events
              </p>

              <p className="text-2xl font-bold text-navy-700 dark:text-white">
                31
              </p>
            </div>

          </div>

        </div>


        {/* Warnings */}

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-4">

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-navy-700">
              <MdWarning className="h-6 w-6 text-red-500" />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-300">
                Warnings
              </p>

              <p className="text-2xl font-bold text-navy-700 dark:text-white">
                7
              </p>
            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          AUDIT LOG TABLE
          ===================================================== */}

      <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">

        <div className="mb-5">

          <h2 className="text-lg font-bold text-navy-700 dark:text-white">
            Activity Log
          </h2>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
            Recent system and security activity
          </p>

        </div>


        <div className="overflow-x-auto">

          <table className="w-full min-w-[1000px]">

            <thead>

              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  User
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Action
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Module
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Description
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Time
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Status
                </th>

              </tr>

            </thead>


            <tbody>

              {filteredLogs.map((log) => (

                <tr
                  key={log.id}
                  className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700/40"
                >

                  {/* User */}

                  <td className="px-4 py-4">

                    <div>

                      <p className="text-sm font-semibold text-navy-700 dark:text-white">
                        {log.user}
                      </p>

                      <p className="mt-1 text-xs text-gray-400">
                        {log.role}
                      </p>

                    </div>

                  </td>


                  {/* Action */}

                  <td className="px-4 py-4">

                    <div className="flex items-center gap-2">

                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightPrimary dark:bg-navy-900">
                        {getActionIcon(log.type)}
                      </div>

                      <span className="text-sm font-medium text-navy-700 dark:text-white">
                        {log.action}
                      </span>

                    </div>

                  </td>


                  {/* Module */}

                  <td className="px-4 py-4">

                    <span className="rounded-lg bg-lightPrimary px-3 py-1.5 text-xs font-semibold text-gray-600 dark:bg-navy-900 dark:text-gray-300">
                      {log.module}
                    </span>

                  </td>


                  {/* Description */}

                  <td className="max-w-xs px-4 py-4">

                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {log.description}
                    </p>

                  </td>


                  {/* Time */}

                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                    {log.time}
                  </td>


                  {/* Status */}

                  <td className="px-4 py-4">

                    {log.status === "Success" && (
                      <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-600 dark:bg-green-500/10 dark:text-green-400">
                        Success
                      </span>
                    )}

                    {log.status === "Warning" && (
                      <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
                        Warning
                      </span>
                    )}

                    {log.status === "Failed" && (
                      <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 dark:bg-red-500/10 dark:text-red-400">
                        Failed
                      </span>
                    )}

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>


        {filteredLogs.length === 0 && (
          <div className="py-12 text-center">

            <MdHistory className="mx-auto h-10 w-10 text-gray-300" />

            <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-300">
              No audit events found.
            </p>

          </div>
        )}

      </div>

    </div>
  );
};

export default AuditLogs;