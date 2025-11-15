# Frontend-Only Solution: ChatKit Azure Blob Upload Fix

## Problem Summary

ChatKit sends **POST requests with multipart/form-data** to Azure Blob Storage SAS URLs, but Azure requires **PUT requests with raw binary bytes**. This causes `UnsupportedHttpVerb` errors.

---

## Solution: Custom Fetch Interceptor ✅

**Implementation:** Modified `src/lib/chatkit-fetch.ts` to intercept and transform upload requests **client-side only**.

### How It Works

```
┌──────────────┐       ┌─────────────────────┐       ┌─────────────┐
│   ChatKit    │       │  Custom Fetch       │       │   Azure     │
│  Component   │       │  (chatkit-fetch.ts) │       │   Blob      │
└──────┬───────┘       └──────────┬──────────┘       └──────┬──────┘
       │                          │                         │
       │ POST multipart/form-data │                         │
       ├─────────────────────────>│                         │
       │                          │                         │
       │                          │ 1. Detect Azure URL     │
       │                          │ 2. Extract file bytes   │
       │                          │ 3. Transform to PUT     │
       │                          │ 4. Add Azure headers    │
       │                          │                         │
       │                          │ PUT raw bytes           │
       │                          │ + x-ms-blob-type        │
       │                          ├────────────────────────>│
       │                          │                         │
       │                          │        201 Created      │
       │                          │<────────────────────────┤
       │                          │                         │
       │      Response            │                         │
       │<─────────────────────────┤                         │
       │                          │                         │
```

---

## Code Changes

### Modified File: `src/lib/chatkit-fetch.ts`

#### Key Functions

**1. `isAzureBlobUrl(url: string)`** (Line 6-8)
- Detects Azure Blob Storage SAS URLs
- Checks for `.blob.core.windows.net` and `sig=` parameters

**2. `extractFileFromFormData(body)`** (Line 13-25)
- Extracts the `File` object from FormData
- Handles ChatKit's multipart payload format

**3. `transformAzureUploadRequest(url, options)`** (Line 30-94)
- **Line 35-39**: Checks if request is POST multipart to Azure
- **Line 52**: Extracts file from FormData
- **Line 60**: Converts file to raw `ArrayBuffer`
- **Line 64**: Adds required `x-ms-blob-type: BlockBlob` header
- **Line 65**: Sets correct `Content-Length` (file bytes, not multipart size)
- **Line 66**: Sets `Content-Type` from file MIME type
- **Line 89**: Changes method from `POST` to `PUT`
- **Line 91**: Replaces FormData body with raw bytes

**4. `createChatkitFetch(pageContext)`** (Line 107-134)
- **Line 126-129**: Applies transformation to Azure uploads
- **Line 132**: Executes transformed request
- Non-Azure requests pass through unchanged

---

## What Gets Transformed

### Before (ChatKit's Default)
```http
POST https://storage.blob.core.windows.net/container/file.pdf?sig=...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...
Content-Length: 10485900  (includes multipart overhead)

------WebKitFormBoundary...
Content-Disposition: form-data; name="file"; filename="document.pdf"
Content-Type: application/pdf

<binary data>
------WebKitFormBoundary...--
```

### After (Azure-Compatible)
```http
PUT https://storage.blob.core.windows.net/container/file.pdf?sig=...
x-ms-blob-type: BlockBlob
Content-Type: application/pdf
Content-Length: 10485760  (exact file size)

<raw binary bytes>
```

---

## Required Azure Headers Added

| Header | Value | Purpose |
|--------|-------|---------|
| `x-ms-blob-type` | `BlockBlob` | **Required** by Azure - specifies blob type |
| `Content-Length` | File byte size | Correct size of raw bytes (not multipart) |
| `Content-Type` | File MIME type | Preserves original file type (e.g., `application/pdf`) |

**Source:** https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob

---

## Configuration Required

### ChatKit Configuration (Already Set)
**Location:** `src/components/ChatKitPanel.tsx:46-82`

```typescript
uploadStrategy: {
  type: 'two_phase'  // Backend returns SAS URLs
}
```

No changes needed to existing ChatKit configuration.

### Backend Requirements

Your backend (implemented elsewhere) must:

1. **Phase 1:** Return Azure SAS URLs with upload permissions
   ```json
   {
     "id": "att_123",
     "upload_url": "https://storage.blob.core.windows.net/container/file.pdf?sig=..."
   }
   ```

2. **SAS URL Permissions:**
   - **Write** (`w`) permission
   - **Create** (`c`) permission
   - Valid expiry (e.g., 15 minutes)

3. **Container:** Must exist and be accessible with the SAS token

---

## Testing Checklist

- [ ] Backend returns valid Azure SAS URL with write permissions
- [ ] Upload a PDF file through ChatKit composer (max 10MB)
- [ ] Check browser console for transformation logs:
  ```
  [ChatKit Azure Upload] Transforming POST multipart to PUT raw bytes
  [ChatKit Azure Upload] Transformed request: { method: 'PUT', contentLength: 1234567, ... }
  ```
- [ ] Verify Azure responds with `201 Created` (not `400 UnsupportedHttpVerb`)
- [ ] Confirm file appears in Azure Blob Storage
- [ ] Verify file is readable and not corrupted

---

## Console Logging

The solution includes debug logging to help diagnose issues:

### Successful Upload
```
[ChatKit Azure Upload] Transforming POST multipart to PUT raw bytes
[ChatKit Azure Upload] Transformed request: {
  method: 'PUT',
  contentLength: 10485760,
  contentType: 'application/pdf',
  fileName: 'document.pdf'
}
```

### Failed File Extraction
```
[ChatKit Azure Upload] Could not extract file from FormData
```

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Non-Azure upload | Request passes through unchanged |
| GET/HEAD request | No transformation |
| Non-multipart POST | No transformation |
| Missing file in FormData | Logs error, passes original request |
| Backend upload (not Azure) | No transformation (only Azure URLs are intercepted) |

---

## Limitations & Caveats

### 1. FormData Detection
- Assumes ChatKit uses `FormData` with field name `file`
- If ChatKit changes format, extraction may fail

### 2. Azure URL Detection
- Uses heuristic: `.blob.core.windows.net` + `sig=` in URL
- Could theoretically match non-Azure URLs with similar patterns (unlikely)

### 3. Browser Compatibility
- Requires `File.arrayBuffer()` (available in all modern browsers)
- Requires `Headers` API

### 4. Large Files
- Entire file is loaded into memory as `ArrayBuffer`
- For files >100MB, consider using Put Block List for chunked uploads
- Current ChatKit config limits files to 10MB (`maxSize: 10 * 1024 * 1024`)

### 5. CORS
- Azure SAS URL must allow origin (usually handled automatically with SAS tokens)
- Required headers must be allowed in Azure CORS policy:
  - `x-ms-blob-type`
  - `Content-Type`
  - `Content-Length`

---

## Troubleshooting

### Error: `UnsupportedHttpVerb` (Still Occurs)

**Possible Causes:**
1. Custom fetch not being used - check `ChatKitPanel.tsx:51` has `fetch: createChatkitFetch(pageContext)`
2. Azure URL not detected - check console for transformation logs
3. SAS token missing write permissions - regenerate SAS token with `w` and `c` permissions

### Error: `403 Forbidden`

**Possible Causes:**
1. SAS token expired - use shorter expiry windows
2. Missing required permission in SAS token (`w` or `c`)
3. Container doesn't exist

### Error: `411 Length Required`

**Possible Causes:**
1. `Content-Length` header not set - check transformation is applying
2. Network proxy stripping headers

### File Corrupted After Upload

**Possible Causes:**
1. File not fully read - check `File.arrayBuffer()` completed
2. Multipart parsing issue - file may contain multipart boundaries

### Upload Hangs/Timeout

**Possible Causes:**
1. Large file (>10MB) - check `maxSize` config
2. Slow network connection
3. Azure throttling

---

## Performance Considerations

| Metric | Impact |
|--------|--------|
| **Latency** | +50-200ms (file read to ArrayBuffer) |
| **Memory** | File size loaded into memory |
| **Network** | Slightly reduced (no multipart overhead) |
| **CPU** | Minimal (one ArrayBuffer conversion) |

For a 10MB PDF:
- Memory: ~10MB additional during upload
- Latency: ~100-150ms to read file
- Network: Saves ~5KB (multipart boundaries/headers)

---

## Alternative Approaches (Rejected)

### Option 1: Modify ChatKit Library ❌
- Requires forking `@openai/chatkit-react`
- Maintenance burden for future updates
- Complex build process

### Option 2: Backend Proxy ❌
- Requires backend changes (you said backend is elsewhere)
- Doubles bandwidth (client → backend → Azure)
- Adds latency

### Option 3: Direct Upload Strategy ❓
```typescript
uploadStrategy: {
  type: 'direct',
  uploadUrl: 'https://storage.blob.core.windows.net/...'
}
```
- Documentation unclear on HTTP method used
- May still send POST multipart (same problem)
- Would still need custom fetch transformation

**Chosen:** Custom fetch interceptor (minimal changes, no external dependencies)

---

## Security Considerations

### SAS Token Exposure
- SAS URLs contain secrets in query string
- Logged to console (consider removing in production)
- Visible in network tab

**Recommendation:** Use short-lived SAS tokens (5-15 minutes)

### File Validation
- Current implementation trusts file MIME type from browser
- Backend should validate file type after upload
- Consider virus scanning for production

### CORS
- Azure SAS tokens typically don't have CORS restrictions
- Ensure CORS policy allows origin if issues occur

---

## Next Steps

1. **Deploy frontend changes** (only `chatkit-fetch.ts` modified)
2. **Ensure backend returns Azure SAS URLs** in Phase 1 response
3. **Test with sample PDF upload** (<10MB)
4. **Monitor console logs** for transformation confirmation
5. **Verify file in Azure Blob Storage** after successful upload

---

## Summary

✅ **No backend changes required**
✅ **No ChatKit configuration changes required**
✅ **Single file modified:** `src/lib/chatkit-fetch.ts`
✅ **Fully client-side solution**
✅ **Transparent to ChatKit component**

The custom fetch interceptor automatically transforms ChatKit's POST multipart requests into Azure-compatible PUT requests with the required headers and raw binary payload.

---

**File Modified:** `src/lib/chatkit-fetch.ts` (Lines 1-135)
**Testing Required:** Yes (upload functionality)
**Breaking Changes:** None
**Dependencies Added:** None
