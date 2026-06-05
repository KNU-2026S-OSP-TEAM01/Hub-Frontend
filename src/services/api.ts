import axios from "axios";
import type { AxiosRequestConfig } from "axios";

export const apiBaseURL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const axiosApiInstance = axios.create({
  baseURL: apiBaseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const mutationInstance = async <T>(
  config: AxiosRequestConfig,
): Promise<T> => {
  const response = await axiosApiInstance(config);
  return response.data;
};
