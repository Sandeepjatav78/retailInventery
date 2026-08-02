import axios from 'axios';

const instance = axios.create({
  baseURL: `${import.meta.env.VITE_BACKEND_URL}/api`,
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
    const code = error?.response?.data?.code;

    const isAuthError = status === 401 || (
      status === 401 && (
        code === 'VERSION_MISMATCH' ||
        message.includes('token') ||
        message.includes('unauthorized') ||
        message.includes('invalid token') ||
        message.includes('expired')
      )
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