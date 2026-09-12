import React from "react";
import {
  MdDescription,
  MdPictureAsPdf,
  MdTableChart,
  MdImage,
  MdSearch,
  MdAdd,
  MdDownload,
  MdVisibility,
  MdDelete,
  MdFolder,
} from "react-icons/md";

const documents = [
  {
    id: 1,
    name: "Vessel Arrival Report",
    category: "Vessel Operations",
    type: "PDF",
    size: "2.4 MB",
    uploadedBy: "Marine Operations",
    date: "04 Sep 2026",
  },
  {
    id: 2,
    name: "Berth Allocation Schedule",
    category: "Berth Operations",
    type: "PDF",
    size: "1.8 MB",
    uploadedBy: "Port Operations",
    date: "04 Sep 2026",
  },
  {
    id: 3,
    name: "Cargo Handling Report",
    category: "Cargo",
    type: "XLSX",
    size: "856 KB",
    uploadedBy: "Cargo Department",
    date: "03 Sep 2026",
  },
  {
    id: 4,
    name: "Gate Entry Register",
    category: "Gate Operations",
    type: "XLSX",
    size: "1.2 MB",
    uploadedBy: "Security Department",
    date: "03 Sep 2026",
  },
  {
    id: 5,
    name: "Port Safety Inspection",
    category: "Safety",
    type: "PDF",
    size: "3.1 MB",
    uploadedBy: "Safety Officer",
    date: "02 Sep 2026",
  },
  {
    id: 6,
    name: "Equipment Inspection Photo",
    category: "Maintenance",
    type: "JPG",
    size: "642 KB",
    uploadedBy: "Maintenance Team",
    date: "01 Sep 2026",
  },
];

const getFileIcon = (type) => {
  if (type === "PDF") {
    return <MdPictureAsPdf className="h-7 w-7 text-red-500" />;
  }

  if (type === "XLSX") {
    return <MdTableChart className="h-7 w-7 text-green-500" />;
  }

  if (type === "JPG") {
    return <MdImage className="h-7 w-7 text-blue-500" />;
  }

  return <MdDescription className="h-7 w-7 text-gray-500" />;
};

const DocumentManagement = () => {
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("All");

  const filteredDocuments = documents.filter((document) => {
    const matchesSearch =
      document.name.toLowerCase().includes(search.toLowerCase()) ||
      document.category.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      category === "All" || document.category === category;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="mt-3">

      {/* =====================================================
          TOP CONTROLS
          ===================================================== */}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div>
          <p className="text-sm text-gray-500 dark:text-gray-300">
            Centralized storage and management of port documents and
            operational records.
          </p>
        </div>

        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600"
        >
          <MdAdd className="h-5 w-5" />
          Upload Document
        </button>

      </div>


      {/* =====================================================
          STATISTICS
          ===================================================== */}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-navy-700">
              <MdDescription className="h-6 w-6 text-blue-500" />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-300">
                Total Documents
              </p>
              <p className="text-2xl font-bold text-navy-700 dark:text-white">
                248
              </p>
            </div>
          </div>
        </div>


        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-navy-700">
              <MdPictureAsPdf className="h-6 w-6 text-red-500" />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-300">
                PDF Documents
              </p>
              <p className="text-2xl font-bold text-navy-700 dark:text-white">
                126
              </p>
            </div>
          </div>
        </div>


        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 dark:bg-navy-700">
              <MdTableChart className="h-6 w-6 text-green-500" />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-300">
                Reports & Sheets
              </p>
              <p className="text-2xl font-bold text-navy-700 dark:text-white">
                74
              </p>
            </div>
          </div>
        </div>


        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 dark:bg-navy-700">
              <MdFolder className="h-6 w-6 text-purple-500" />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-300">
                Storage Used
              </p>
              <p className="text-2xl font-bold text-navy-700 dark:text-white">
                3.8 GB
              </p>
            </div>
          </div>
        </div>

      </div>


      {/* =====================================================
          DOCUMENT LIBRARY
          ===================================================== */}

      <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">

        {/* Header */}

        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Document Library
            </h2>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
              Port operational documents and records
            </p>
          </div>


          {/* Search */}

          <div className="relative w-full lg:w-72">

            <MdSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="h-11 w-full rounded-xl bg-lightPrimary pl-10 pr-4 text-sm text-navy-700 outline-none dark:bg-navy-900 dark:text-white"
            />

          </div>

        </div>


        {/* Category Filter */}

        <div className="mb-5 flex flex-wrap gap-2">

          {[
            "All",
            "Vessel Operations",
            "Berth Operations",
            "Cargo",
            "Gate Operations",
            "Safety",
            "Maintenance",
          ].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                category === item
                  ? "bg-brand-500 text-white"
                  : "bg-lightPrimary text-gray-600 dark:bg-navy-900 dark:text-gray-300"
              }`}
            >
              {item}
            </button>
          ))}

        </div>


        {/* ===================================================
            DOCUMENT TABLE
            =================================================== */}

        <div className="overflow-x-auto">

          <table className="w-full min-w-[900px]">

            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Document
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Category
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Type
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Uploaded By
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">
                  Date
                </th>

                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-500">
                  Actions
                </th>

              </tr>
            </thead>


            <tbody>

              {filteredDocuments.map((document) => (

                <tr
                  key={document.id}
                  className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700/40"
                >

                  {/* Document */}

                  <td className="px-4 py-4">

                    <div className="flex items-center gap-3">

                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lightPrimary dark:bg-navy-900">
                        {getFileIcon(document.type)}
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-navy-700 dark:text-white">
                          {document.name}
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          {document.size}
                        </p>
                      </div>

                    </div>

                  </td>


                  {/* Category */}

                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {document.category}
                  </td>


                  {/* Type */}

                  <td className="px-4 py-4">

                    <span className="rounded-lg bg-lightPrimary px-3 py-1.5 text-xs font-bold text-gray-600 dark:bg-navy-900 dark:text-gray-300">
                      {document.type}
                    </span>

                  </td>


                  {/* Uploaded By */}

                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {document.uploadedBy}
                  </td>


                  {/* Date */}

                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {document.date}
                  </td>


                  {/* Actions */}

                  <td className="px-4 py-4">

                    <div className="flex justify-end gap-2">

                      <button
                        type="button"
                        title="View"
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightPrimary text-gray-500 transition hover:text-brand-500 dark:bg-navy-900"
                      >
                        <MdVisibility className="h-5 w-5" />
                      </button>

                      <button
                        type="button"
                        title="Download"
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightPrimary text-gray-500 transition hover:text-brand-500 dark:bg-navy-900"
                      >
                        <MdDownload className="h-5 w-5" />
                      </button>

                      <button
                        type="button"
                        title="Delete"
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightPrimary text-gray-500 transition hover:text-red-500 dark:bg-navy-900"
                      >
                        <MdDelete className="h-5 w-5" />
                      </button>

                    </div>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>


        {filteredDocuments.length === 0 && (
          <div className="py-12 text-center">

            <MdDescription className="mx-auto h-10 w-10 text-gray-300" />

            <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-300">
              No documents found.
            </p>

          </div>
        )}

      </div>

    </div>
  );
};

export default DocumentManagement;