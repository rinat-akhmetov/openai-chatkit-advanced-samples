# Quick Reference - ChatKit Azure Upload Fix

## The Problem
ChatKit sends: `POST + multipart/form-data`
Azure requires: `PUT + raw binary bytes`

## The Solution (One File Change)

**File:** `src/lib/chatkit-fetch.ts`

Replace entire file with the implementation that:
1. Detects Azure Blob Storage URLs
2. Extracts file from FormData
3. Transforms: POST → PUT, multipart → raw bytes
4. Adds Azure headers: `x-ms-blob-type`, `Content-Type`, `Content-Length`
5. Removes custom headers that break Azure SAS auth

## Request Transformation

### Before (Failed)
```http
POST /blob?sig=... HTTP/1.1
Content-Type: multipart/form-data
Authorization: Bearer debug-token
x-page-context: {...}

------WebKitFormBoundary...
[file data]
------WebKitFormBoundary--
```
**Result:** 400 UnsupportedHttpVerb ❌

### After (Success)
```http
PUT /blob?sig=... HTTP/1.1
x-ms-blob-type: BlockBlob
Content-Type: application/pdf
Content-Length: 222902

[raw binary bytes]
```
**Result:** 201 Created ✅

## Key Implementation Details

### 1. Azure URL Detection
```typescript
function isAzureBlobUrl(url: string): boolean {
  return url.includes('.blob.core.windows.net') && url.includes('sig=');
}
```

### 2. File Extraction
```typescript
async function extractFileFromFormData(body: BodyInit): Promise<File | null> {
  if (body instanceof FormData) {
    const file = body.get('file');
    return file instanceof File ? file : null;
  }
  return null;
}
```

### 3. Core Transformation
```typescript
// Extract file
const file = await extractFileFromFormData(options.body);
const fileBytes = await file.arrayBuffer();

// Create clean headers (Azure only)
const headers = new Headers();
headers.set('x-ms-blob-type', 'BlockBlob');
headers.set('Content-Length', String(fileBytes.byteLength));
headers.set('Content-Type', file.type || 'application/octet-stream');

// Return transformed request
return {
  url,
  options: {
    method: 'PUT',
    headers,
    body: fileBytes,
  }
};
```

### 4. Critical: Header Management
```typescript
const isAzureRequest = isAzureBlobUrl(urlString);

if (!isAzureRequest) {
  // Only add custom headers to backend API calls
  headers.set('X-Page-Context', JSON.stringify(pageContext));
  headers.set('Authorization', 'Bearer debug-token');
}
// Azure requests get NO custom headers (SAS token auth only)
```

**Why:** Azure SAS tokens authenticate via query string. Extra headers like `Authorization: Bearer ...` cause 401 authentication errors.

## ChatKit Configuration Required

```typescript
const chatkit = useChatKit({
  api: {
    uploadStrategy: { type: 'two_phase' },
    fetch: createChatkitFetch(pageContext),  // ← Custom fetch
  },
  composer: {
    attachments: {
      enabled: true,
      maxSize: 10 * 1024 * 1024  // 10MB
    }
  }
});
```

## Backend Requirements

Return Azure SAS URL in Phase 1:
```json
{
  "id": "atc_123",
  "upload_url": "https://storage.blob.core.windows.net/container/file.pdf?sig=..."
}
```

**SAS Token Permissions:** `racw` (Read, Add, Create, Write)
**Expiry:** 5-15 minutes recommended

## Verification

### Console Logs (Success)
```
[ChatKit Fetch] Request intercepted: { isAzure: true, bodyType: 'FormData' }
[ChatKit Azure Upload] Transforming POST multipart to PUT raw bytes
[ChatKit Azure Upload] File extracted: { size: 222902 }
[ChatKit Azure Upload] Transformed request: { method: 'PUT' }
```

### Network Tab (Success)
- Method: **PUT** ✅
- `x-ms-blob-type: BlockBlob` ✅
- NO `authorization` header ✅
- Status: **201 Created** ✅

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Still POST | Custom fetch not applied | Verify ChatKit config, restart dev server |
| 401 Auth Error | Extra headers breaking SAS | Verify headers only added to non-Azure requests |
| 400 UnsupportedHttpVerb | Transformation not applied | Check console logs for errors |
| File corrupted | Multipart data in bytes | Verify `extractFileFromFormData` works |

## Production Checklist

- [ ] Remove/reduce console.log statements
- [ ] Use short-lived SAS tokens (5-15 min)
- [ ] Configure Azure CORS policy
- [ ] Validate file types on backend
- [ ] Test various file sizes
- [ ] Monitor Azure costs

## Performance

- **Latency:** +50-200ms (file read)
- **Memory:** File size in memory during upload
- **Network:** Saves ~5KB (no multipart overhead)

---

**Full Documentation:** See `IMPLEMENTATION_GUIDE.md`
