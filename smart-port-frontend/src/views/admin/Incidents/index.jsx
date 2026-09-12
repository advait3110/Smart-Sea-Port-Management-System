import React from "react";
import {
  MdAdd,
  MdSearch,
  MdWarning,
  MdError,
  MdAccessTime,
  MdCheckCircle,
  MdClose,
  MdDirectionsBoat,
} from "react-icons/md";

const initialIncidents = [
  {
    id: "INC-2026-001",
    type: "Vessel Incident",
    location: "Berth 2",
    severity: "High",
    status: "Under Investigation",
    reportedBy: "Marine Officer",
    assignedTo: "Harbour Master",
    date: "04 Sep 2026",
    time: "08:42 AM",
    description: "Minor contact incident reported during vessel berthing.",
    vessel: "MV Coastal Star",
  },
  {
    id: "INC-2026-002",
    type: "Equipment Failure",
    location: "Cargo Yard A",
    severity: "Medium",
    status: "Action Required",
    reportedBy: "Cargo Supervisor",
    assignedTo: "Maintenance Officer",
    date: "04 Sep 2026",
    time: "07:15 AM",
    description: "Cargo handling equipment requires inspection.",
    vessel: "—",
  },
  {
    id: "INC-2026-003",
    type: "Gate/Security Incident",
    location: "Main Gate",
    severity: "Low",
    status: "Resolved",
    reportedBy: "Security Officer",
    assignedTo: "Gate Supervisor",
    date: "03 Sep 2026",
    time: "06:30 PM",
    description: "Unauthorized access attempt detected and handled.",
    vessel: "—",
  },
  {
    id: "INC-2026-004",
    type: "Environmental Incident",
    location: "Berth 1",
    severity: "Critical",
    status: "Reported",
    reportedBy: "Port Safety Officer",
    assignedTo: "Environmental Officer",
    date: "03 Sep 2026",
    time: "03:20 PM",
    description: "Possible minor oil discharge reported near berth area.",
    vessel: "MV Ocean Pearl",
  },
  {
    id: "INC-2026-005",
    type: "Fire/Safety",
    location: "Warehouse 2",
    severity: "High",
    status: "Closed",
    reportedBy: "Safety Officer",
    assignedTo: "Fire & Safety Team",
    date: "02 Sep 2026",
    time: "11:05 AM",
    description: "Smoke detection triggered. Area inspected and cleared.",
    vessel: "—",
  },
];

const severityClasses = {
  Critical: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  High: "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  Medium: "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400",
  Low: "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
};

const statusClasses = {
  Reported: "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  "Under Investigation":
    "bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  "Action Required":
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  Resolved:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  Closed:
    "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

const IncidentManagement = () => {
  const [incidents, setIncidents] = React.useState(initialIncidents);
  const [search, setSearch] = React.useState("");
  const [severityFilter, setSeverityFilter] = React.useState("All");
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [typeFilter, setTypeFilter] = React.useState("All");
  const [selectedIncident, setSelectedIncident] = React.useState(null);
  const [showForm, setShowForm] = React.useState(false);

  const [form, setForm] = React.useState({
    type: "Vessel Incident",
    location: "",
    severity: "Medium",
    description: "",
    vessel: "",
  });

  const filteredIncidents = incidents.filter((incident) => {
    const matchesSearch =
      incident.id.toLowerCase().includes(search.toLowerCase()) ||
      incident.type.toLowerCase().includes(search.toLowerCase()) ||
      incident.location.toLowerCase().includes(search.toLowerCase()) ||
      incident.vessel.toLowerCase().includes(search.toLowerCase());

    const matchesSeverity =
      severityFilter === "All" || incident.severity === severityFilter;

    const matchesStatus =
      statusFilter === "All" || incident.status === statusFilter;

    const matchesType =
      typeFilter === "All" || incident.type === typeFilter;

    return (
      matchesSearch &&
      matchesSeverity &&
      matchesStatus &&
      matchesType
    );
  });

  const openIncidents = incidents.filter(
    (i) => i.status !== "Resolved" && i.status !== "Closed"
  ).length;

  const criticalIncidents = incidents.filter(
    (i) => i.severity === "Critical"
  ).length;

  const investigationIncidents = incidents.filter(
    (i) => i.status === "Under Investigation"
  ).length;

  const resolvedToday = incidents.filter(
    (i) => i.status === "Resolved" && i.date === "04 Sep 2026"
  ).length;

  const handleFormChange = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleCreateIncident = (e) => {
    e.preventDefault();

    if (!form.location || !form.description) return;

    const newIncident = {
      id: `INC-2026-${String(incidents.length + 1).padStart(3, "0")}`,
      type: form.type,
      location: form.location,
      severity: form.severity,
      status: "Reported",
      reportedBy: "Current User",
      assignedTo: "Pending Assignment",
      date: "04 Sep 2026",
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      description: form.description,
      vessel: form.vessel || "—",
    };

    setIncidents((previous) => [newIncident, ...previous]);
    setForm({
      type: "Vessel Incident",
      location: "",
      severity: "Medium",
      description: "",
      vessel: "",
    });
    setShowForm(false);
  };

  return (
    <div className="mt-3">

      {/* SUBTITLE */}
      <div className="mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-300">
          Monitor, report and manage operational incidents across Karwar Port.
        </p>
      </div>

      {/* KPI CARDS */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Open Incidents
              </p>
              <p className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                {openIncidents}
              </p>
            </div>
            <div className="rounded-xl bg-blue-100 p-3 text-blue-500 dark:bg-blue-500/10">
              <MdWarning className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Critical Incidents
              </p>
              <p className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                {criticalIncidents}
              </p>
            </div>
            <div className="rounded-xl bg-red-100 p-3 text-red-500 dark:bg-red-500/10">
              <MdError className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Under Investigation
              </p>
              <p className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                {investigationIncidents}
              </p>
            </div>
            <div className="rounded-xl bg-purple-100 p-3 text-purple-500 dark:bg-purple-500/10">
              <MdAccessTime className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Resolved Today
              </p>
              <p className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                {resolvedToday}
              </p>
            </div>
            <div className="rounded-xl bg-green-100 p-3 text-green-500 dark:bg-green-500/10">
              <MdCheckCircle className="h-6 w-6" />
            </div>
          </div>
        </div>

      </div>

      {/* INCIDENT TABLE CARD */}
      <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">

        {/* HEADER */}
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Incident Register
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Track current and historical port incidents.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600"
          >
            <MdAdd className="h-5 w-5" />
            Report Incident
          </button>

        </div>

        {/* FILTERS */}
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">

          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search incidents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
          >
            <option value="All">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
          >
            <option value="All">All Statuses</option>
            <option value="Reported">Reported</option>
            <option value="Under Investigation">
              Under Investigation
            </option>
            <option value="Action Required">Action Required</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
          >
            <option value="All">All Incident Types</option>
            <option value="Vessel Incident">Vessel Incident</option>
            <option value="Equipment Failure">Equipment Failure</option>
            <option value="Gate/Security Incident">
              Gate/Security Incident
            </option>
            <option value="Environmental Incident">
              Environmental Incident
            </option>
            <option value="Fire/Safety">Fire/Safety</option>
          </select>

        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">

          <table className="w-full min-w-[1000px]">

            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10">
                <th className="px-3 py-4 text-left text-xs font-bold uppercase text-gray-500">
                  Incident
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase text-gray-500">
                  Type
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase text-gray-500">
                  Location
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase text-gray-500">
                  Severity
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase text-gray-500">
                  Status
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase text-gray-500">
                  Date / Time
                </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase text-gray-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredIncidents.map((incident) => (
                <tr
                  key={incident.id}
                  className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <td className="px-3 py-4">
                    <p className="text-sm font-bold text-navy-700 dark:text-white">
                      {incident.id}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {incident.reportedBy}
                    </p>
                  </td>

                  <td className="px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {incident.type}
                  </td>

                  <td className="px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {incident.location}
                  </td>

                  <td className="px-3 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${severityClasses[incident.severity]}`}
                    >
                      {incident.severity}
                    </span>
                  </td>

                  <td className="px-3 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses[incident.status]}`}
                    >
                      {incident.status}
                    </span>
                  </td>

                  <td className="px-3 py-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {incident.date}
                    </p>
                    <p className="text-xs text-gray-500">
                      {incident.time}
                    </p>
                  </td>

                  <td className="px-3 py-4">
                    <button
                      type="button"
                      onClick={() => setSelectedIncident(incident)}
                      className="rounded-lg bg-lightPrimary px-3 py-2 text-xs font-bold text-brand-500 transition hover:bg-brand-500 hover:text-white dark:bg-navy-900"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}

              {filteredIncidents.length === 0 && (
                <tr>
                  <td
                    colSpan="7"
                    className="px-3 py-12 text-center text-sm text-gray-500"
                  >
                    No incidents found.
                  </td>
                </tr>
              )}
            </tbody>

          </table>

        </div>

      </div>

      {/* REPORT INCIDENT MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-5">

          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800">

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                  Report New Incident
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Record an operational incident.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-4">

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white">
                  Incident Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => handleFormChange("type", e.target.value)}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-navy-900 dark:text-white"
                >
                  <option>Vessel Incident</option>
                  <option>Equipment Failure</option>
                  <option>Gate/Security Incident</option>
                  <option>Environmental Incident</option>
                  <option>Fire/Safety</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white">
                  Location
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) =>
                    handleFormChange("location", e.target.value)
                  }
                  placeholder="e.g. Berth 2"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-navy-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white">
                    Severity
                  </label>
                  <select
                    value={form.severity}
                    onChange={(e) =>
                      handleFormChange("severity", e.target.value)
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-navy-900 dark:text-white"
                  >
                    <option>Critical</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white">
                    Vessel
                  </label>
                  <input
                    type="text"
                    value={form.vessel}
                    onChange={(e) =>
                      handleFormChange("vessel", e.target.value)
                    }
                    placeholder="Optional"
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-navy-900 dark:text-white"
                  />
                </div>

              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    handleFormChange("description", e.target.value)
                  }
                  placeholder="Describe the incident..."
                  rows="4"
                  className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white hover:bg-brand-600"
              >
                Submit Incident Report
              </button>

            </form>

          </div>
        </div>
      )}

      {/* INCIDENT DETAILS MODAL */}
      {selectedIncident && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-5">

          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800">

            <div className="mb-5 flex items-start justify-between">

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-500">
                  Incident Details
                </p>

                <h2 className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
                  {selectedIncident.id}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <MdClose className="h-5 w-5" />
              </button>

            </div>

            <div className="grid grid-cols-2 gap-4">

              <div>
                <p className="text-xs text-gray-500">Incident Type</p>
                <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                  {selectedIncident.type}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Location</p>
                <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                  {selectedIncident.location}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Severity</p>
                <span
                  className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${severityClasses[selectedIncident.severity]}`}
                >
                  {selectedIncident.severity}
                </span>
              </div>

              <div>
                <p className="text-xs text-gray-500">Status</p>
                <span
                  className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${statusClasses[selectedIncident.status]}`}
                >
                  {selectedIncident.status}
                </span>
              </div>

              <div>
                <p className="text-xs text-gray-500">Reported By</p>
                <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                  {selectedIncident.reportedBy}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Assigned To</p>
                <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                  {selectedIncident.assignedTo}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Vessel</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-navy-700 dark:text-white">
                  <MdDirectionsBoat className="h-4 w-4 text-brand-500" />
                  {selectedIncident.vessel}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Reported</p>
                <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                  {selectedIncident.date} · {selectedIncident.time}
                </p>
              </div>

            </div>

            <div className="mt-5 rounded-xl bg-lightPrimary p-4 dark:bg-navy-900">
              <p className="text-xs font-bold uppercase text-gray-500">
                Description
              </p>

              <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                {selectedIncident.description}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedIncident(null)}
              className="mt-5 h-11 w-full rounded-xl bg-brand-500 text-sm font-bold text-white hover:bg-brand-600"
            >
              Close
            </button>

          </div>

        </div>
      )}

    </div>
  );
};

export default IncidentManagement;