import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const PrivateRoute = () => {
  const token = localStorage.getItem('token');

  // If token exists, show the inner pages (Outlet)
  // If no token, redirect to Login
  return token ? <Outlet /> : <Navigate to="/login" />;
};

export default PrivateRoute;