import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const SessionWatcher = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    let isChecking = false;

    const checkSession = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        await api.get('/admin/verify-token');
      } catch (err) {
        // If 401 occurs, axios interceptor already handles localStorage removal & redirect
        if (err?.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('userRole');
          navigate('/login', { replace: true });
        }
      } finally {
        isChecking = false;
      }
    };

    // 1. Initial check when component mounts
    checkSession();

    // 2. Interval check every 30 seconds
    const interval = setInterval(checkSession, 30000);

    // 3. Tab visibility change & focus check
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    };

    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [navigate]);

  return children;
};

export default SessionWatcher;
