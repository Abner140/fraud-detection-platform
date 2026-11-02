
import axios from "axios"

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "")

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})
