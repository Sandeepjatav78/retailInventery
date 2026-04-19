import axios from 'axios';

const instance = axios.create({
  baseURL: `${import.meta.env.VITE_BACKEND_URL}/api`, // Your Backend URL
});

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message = String(error?.response?.data?.message || '').toLowerCase();
    const isAuthError = status === 401 && (
      message.includes('token') ||
      message.includes('unauthorized') ||
      message.includes('invalid token')
    );

    if (isAuthError) {
      localStorage.removeItem('token');
      localStorage.removeItem('userRole');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default instance;