import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4001/api/v1';

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle common errors
    if (error.response) {
      // Server responded with error status
      return Promise.reject({
        message: error.response.data?.message || `HTTP error! status: ${error.response.status}`,
        status: error.response.status,
        response: error.response.data,
      });
    } else if (error.request) {
      // Request made but no response
      return Promise.reject({
        message: 'Network error occurred',
        status: 0,
        response: null,
      });
    } else {
      // Something else happened
      return Promise.reject({
        message: error.message || 'Unknown error occurred',
        status: 0,
        response: null,
      });
    }
  }
);
