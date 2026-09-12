import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "views/auth/Login";

// =========================================================
// KARWAR PORT AUTHENTICATION LAYOUT
// =========================================================

const AuthLayout = () => {
  return (
    <Routes>

      {/* =====================================================
          KARWAR PORT LOGIN
          ===================================================== */}

      <Route
        path="login"
        element={<Login />}
      />

      {/* =====================================================
          UNKNOWN AUTH ROUTES
          ===================================================== */}

      <Route
        path="*"
        element={
          <Navigate
            to="/auth/login"
            replace
          />
        }
      />

    </Routes>
  );
};

export default AuthLayout;