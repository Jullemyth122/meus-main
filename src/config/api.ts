// API Base URL for backend requests (Render / Localhost)
export const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL || "http://localhost:6003"
).replace(/\/$/, "");
