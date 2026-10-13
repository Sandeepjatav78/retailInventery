import React from 'react';
import { Navigate } from 'react-router-dom';

// Optional `roles` limits a page to those user roles (others go to home).
const PrivateRoute = ({ children, roles }) => {
  const token = localStorage.getItem('token');
  if (token && roles && !roles.includes(localStorage.getItem('userRole'))) {
    return <Navigate to="/" replace />;
  }
  
  // Logic: If token exists, render the page (children).
  // If not, redirect to Login. 
  // 'replace' prevents the user from clicking 'Back' to return to this restricted route.
  return token ? children : <Navigate to="/login" replace />;
};

export default PrivateRoute;