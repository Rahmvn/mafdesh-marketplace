import React from 'react';
import { Navigate } from "react-router-dom";

export default function AdminRoute({ children }) {
  const storedUser = JSON.parse(localStorage.getItem("mafdesh_user") || "null");
  return storedUser?.role === "admin" ? children : <Navigate to="/login" replace />;
}
