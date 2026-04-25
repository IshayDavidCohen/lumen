import type { ApiErrorCode, ApiErrorResponse } from "@/constants/apiTypes";

const BASE_URL = import.meta.env.VITE_BASE_URL;

export class ApiError extends Error {
  code: ApiErrorCode;
  status?: number;
  detail?: string;

  constructor(response: ApiErrorResponse) {
    super(response.message);
    this.name = "ApiError";
    this.code = response.code;
    this.status = response.status;
    this.detail = response.detail;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorBody: Partial<ApiErrorResponse> = {};
    try {
      errorBody = (await response.json()) as Partial<ApiErrorResponse>;
    } catch {
      // non-JSON error response
    }

    throw new ApiError({
      code: errorBody.code ?? "SERVER_ERROR",
      status: response.status,
      message: errorBody.message ?? `Request failed with status ${response.status}`,
      detail: errorBody.detail,
    });
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    return handleResponse<T>(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: "Unable to connect to the server",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function apiPost<T>(
  path: string,
  body: unknown,
): Promise<T> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: "Unable to connect to the server",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  onProgress?: (progress: number) => void,
): Promise<T> {
  try {
    if (onProgress) {
      return await uploadWithProgress<T>(path, formData, onProgress);
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      body: formData,
    });
    return handleResponse<T>(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({
      code: "UPLOAD_FAILED",
      message: "File upload failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress: (progress: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}${path}`);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(
            new ApiError({
              code: "SERVER_ERROR",
              status: xhr.status,
              message: "Invalid response from server",
            }),
          );
        }
      } else {
        let errorBody: Partial<ApiErrorResponse> = {};
        try {
          errorBody = JSON.parse(xhr.responseText) as Partial<ApiErrorResponse>;
        } catch {
          // non-JSON error
        }
        reject(
          new ApiError({
            code: errorBody.code ?? "UPLOAD_FAILED",
            status: xhr.status,
            message: errorBody.message ?? `Upload failed with status ${xhr.status}`,
            detail: errorBody.detail,
          }),
        );
      }
    });

    xhr.addEventListener("error", () => {
      reject(
        new ApiError({
          code: "NETWORK_ERROR",
          message: "Unable to connect to the server",
        }),
      );
    });

    xhr.addEventListener("abort", () => {
      reject(
        new ApiError({
          code: "UPLOAD_FAILED",
          message: "Upload was cancelled",
        }),
      );
    });

    xhr.send(formData);
  });
}
