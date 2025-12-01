import type { PageContext } from "../types/page-context";

/**
 * Detects if a URL is an Azure Blob Storage SAS URL
 */
function isAzureBlobUrl(url: string): boolean {
  return url.includes('.blob.core.windows.net') && url.includes('sig=');
}

/**
 * Extracts file from FormData in the request body
 */
async function extractFileFromFormData(body: BodyInit | null | undefined): Promise<File | null> {
  if (!body) return null;

  if (body instanceof FormData) {
    // FormData is already parsed
    const file = body.get('file');
    return file instanceof File ? file : null;
  }

  // Body might be a Blob, ReadableStream, or other format
  // For now, return null if we can't extract
  return null;
}

/**
 * Transforms a POST multipart/form-data upload request to Azure-compatible PUT request
 */
async function transformAzureUploadRequest(
  url: string,
  options: RequestInit
): Promise<{ url: string; options: RequestInit }> {
  // First check if this is an Azure URL
  if (!isAzureBlobUrl(url)) {
    return { url, options };
  }

  console.log('[ChatKit Azure Upload] Azure URL detected, checking request details...');

  // Check if body is FormData (the key indicator of a file upload)
  const hasFormData = options.body instanceof FormData;

  console.log('[ChatKit Azure Upload] Request details:', {
    method: options.method || 'default',
    hasFormData,
    bodyType: options.body?.constructor.name,
  });

  if (!hasFormData) {
    console.log('[ChatKit Azure Upload] Body is not FormData, skipping transformation');
    return { url, options };
  }

  console.log('[ChatKit Azure Upload] Transforming POST multipart to PUT raw bytes');

  // Extract file from FormData
  const file = await extractFileFromFormData(options.body);

  if (!file) {
    console.error('[ChatKit Azure Upload] Could not extract file from FormData');
    return { url, options };
  }

  console.log('[ChatKit Azure Upload] File extracted:', {
    name: file.name,
    size: file.size,
    type: file.type
  });

  // Read file as ArrayBuffer for raw bytes
  const fileBytes = await file.arrayBuffer();

  // Create new headers for Azure Blob Storage
  // IMPORTANT: Azure SAS auth is sensitive to extra headers
  // Only include headers required by Azure Blob Storage API
  const headers = new Headers();
  headers.set('x-ms-blob-type', 'BlockBlob');  // Required by Azure
  headers.set('Content-Length', String(fileBytes.byteLength));
  headers.set('Content-Type', file.type || 'application/octet-stream');

  // DO NOT preserve other headers for Azure requests
  // ChatKit-specific headers (authorization, x-page-context, chatkit-frame-instance-id)
  // interfere with Azure SAS token authentication

  console.log('[ChatKit Azure Upload] Transformed request:', {
    method: 'PUT',
    contentLength: fileBytes.byteLength,
    contentType: file.type,
    fileName: file.name
  });

  return {
    url,
    options: {
      ...options,
      method: 'PUT',  // Change to PUT
      headers,
      body: fileBytes,  // Raw bytes instead of FormData
    }
  };
}

/**
 * Creates a custom fetch function that:
 * 1. Injects the X-Page-Context header into all ChatKit API requests
 * 2. Transforms Azure Blob Storage upload requests from POST multipart to PUT raw bytes
 *
 * The backend requires channelCode and instance fields for multi-tenant
 * thread isolation.
 *
 * @param pageContext - The page context to send with requests
 * @returns Custom fetch function for ChatKit
 */
export function createChatkitFetch(pageContext: PageContext, authToken?: string) {
  return async (url: string | Request, options?: RequestInit): Promise<Response> => {
    // Convert Request object to string URL if needed
    const urlString = typeof url === 'string' ? url : url.url;
    const requestOptions = options || (typeof url === 'string' ? {} : {
      method: url.method,
      headers: url.headers,
      body: url.body,
    });

    // Debug logging
    console.log('[ChatKit Fetch] Request intercepted:', {
      url: urlString,
      method: requestOptions.method || 'GET',
      bodyType: requestOptions.body?.constructor.name,
      isAzure: isAzureBlobUrl(urlString)
    });

    const headers = new Headers(requestOptions.headers);

    // Only add custom headers for backend API requests, NOT for Azure Blob Storage
    // Azure SAS tokens use query string auth and extra headers break authentication
    const isAzureRequest = isAzureBlobUrl(urlString);

    if (!isAzureRequest) {
      // Add page context as header so the backend can extract it
      // Include currentPath dynamically at request time
      const contextWithPath: PageContext = {
        ...pageContext,
        currentPath: typeof window !== 'undefined' ? window.location.pathname : undefined,
      };
      headers.set('X-Page-Context', JSON.stringify(contextWithPath));

      // Add authorization header if token provided
      if (authToken) {
        headers.set('Authorization', `Bearer ${authToken}`);
      }
    }

    // Transform Azure upload requests if needed
    const { url: finalUrl, options: finalOptions } = await transformAzureUploadRequest(
      urlString,
      { ...requestOptions, headers }
    );

    // Execute the request with the modified options
    return fetch(finalUrl, finalOptions);
  };
}
