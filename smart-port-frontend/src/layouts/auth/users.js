// =========================================================
// KARWAR PORT
// USER DIRECTORY
// =========================================================
//
// DEVELOPMENT USER DIRECTORY
//
// This file is used only while the frontend prototype is
// running without the FastAPI/PostgreSQL backend.
//
// Production architecture:
//
// React
//   ↓
// FastAPI
//   ↓
// PostgreSQL
//   ↓
// Users / Roles / Permissions
//
// Port officials will eventually manage users through
// User & Role Management instead of editing this file.
//
// =========================================================


// =========================================================
// DEVELOPMENT USERS
// =========================================================
//
// IMPORTANT:
// These are demonstration accounts.
//
// DO NOT use these passwords in production.
//
// When FastAPI + PostgreSQL is connected, authentication
// will move to the backend and passwords will be securely
// hashed there.
//
// =========================================================

const users = [

  // =======================================================
  // U001 — PORT ADMINISTRATOR
  // =======================================================

  {
    id: "U001",

    adminId: "admin",

    name: "Port Administrator",

    email: "admin@karwarport.com",

    password: "admin123",

    role: "Port Administrator",

    department: "Administration",

    enabled: true,
  },


  // =======================================================
  // U002 — MARINE OFFICER
  // =======================================================

  {
    id: "U002",

    adminId: "marine",

    name: "Marine Officer",

    email: "marine@karwarport.com",

    password: "marine123",

    role: "Marine Officer",

    department: "Marine Operations",

    enabled: true,
  },


  // =======================================================
  // U003 — PORT MANAGER
  // =======================================================

  {
    id: "U003",

    adminId: "manager",

    name: "Port Manager",

    email: "manager@karwarport.com",

    password: "manager123",

    role: "Port Manager",

    department: "Port Operations",

    enabled: true,
  },


  // =======================================================
  // U004 — CARGO OFFICER
  // =======================================================

  {
    id: "U004",

    adminId: "cargo",

    name: "Cargo Officer",

    email: "cargo@karwarport.com",

    password: "cargo123",

    role: "Cargo Officer",

    department: "Cargo Operations",

    enabled: true,
  },


  // =======================================================
  // U005 — GATE & SECURITY OFFICER
  // =======================================================

  {
    id: "U005",

    adminId: "gate",

    name: "Gate & Security Officer",

    email: "gate@karwarport.com",

    password: "gate123",

    role: "Gate & Security Officer",

    department: "Gate & Security",

    enabled: true,
  },


  // =======================================================
  // U006 — MAINTENANCE OFFICER
  // =======================================================

  {
    id: "U006",

    adminId: "maintenance",

    name: "Maintenance Officer",

    email: "maintenance@karwarport.com",

    password: "maintenance123",

    role: "Maintenance Officer",

    department: "Engineering",

    enabled: true,
  },


  // =======================================================
  // U007 — PORT EXECUTIVE
  // =======================================================

  {
    id: "U007",

    adminId: "executive",

    name: "Port Executive",

    email: "executive@karwarport.com",

    password: "executive123",

    role: "Executive",

    department: "Management",

    enabled: true,
  },

];


// =========================================================
// USER LOOKUP HELPERS
// =========================================================
//
// These helpers keep user access centralized.
//
// The rest of the application should NOT directly search
// this array.
//
// =========================================================


// Find user by ID

export const getUserById = (id) => {

  return users.find(
    (user) => user.id === id
  ) || null;

};


// Find user by Admin ID

export const getUserByAdminId = (adminId) => {

  const value =
    String(adminId || "")
      .trim()
      .toLowerCase();

  return users.find(
    (user) =>
      user.adminId.toLowerCase() === value
  ) || null;

};


// Find user by email

export const getUserByEmail = (email) => {

  const value =
    String(email || "")
      .trim()
      .toLowerCase();

  return users.find(
    (user) =>
      user.email.toLowerCase() === value
  ) || null;

};


// Get all users

export const getAllUsers = () => {

  return [...users];

};


// Get only enabled accounts

export const getEnabledUsers = () => {

  return users.filter(
    (user) => user.enabled
  );

};


// =========================================================
// USER INITIALS
// =========================================================
//
// Used by the Navbar.
//
// Examples:
//
// Port Administrator → PA
// Marine Officer → MO
// Port Manager → PM
// Cargo Officer → CO
// Gate & Security Officer → GS
// Maintenance Officer → MO
// Port Executive → PE
//
// =========================================================

export const getUserInitials = (user) => {

  if (!user?.name) {
    return "US";
  }

  const words =
    user.name
      .trim()
      .split(/\s+/);

  if (words.length === 1) {

    return words[0]
      .substring(0, 2)
      .toUpperCase();

  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();

};


// =========================================================
// EXPORT
// =========================================================

export default users;