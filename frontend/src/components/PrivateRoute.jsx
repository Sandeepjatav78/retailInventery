import React from 'react';
import { Navigate } from 'react-router-dom';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  
  // Logic: If token exists, render the page (children).
  // If not, redirect to Login. 
  // 'replace' prevents the user from clicking 'Back' to return to this restricted route.
  return token ? children : <Navigate to="/login" replace />;
};

export default PrivateRoute;