# ChatKit File Upload to Azure Blob Storage - Analysis Report

## Executive Summary

ChatKit file uploads to Azure Blob Storage are failing because of an HTTP verb mismatch. ChatKit's two-phase upload strategy sends POST requests with `multipart/form-data`, while Azure Blob Storage requires PUT requests with raw binary bytes. Additionally, the backend currently rejects all attachment uploads. A proxy solution is required to bridge this incompatibility.

---

## 1. Current ChatKit Uploader Implementation

### Frontend Configuration
**Location:** `src/components/ChatKitPanel.tsx:46-82`

```typescript
const chatkit = useChatKit({
  api: {
    url: CHATKIT_API_URL,
    domainKey: CHATKIT_API_DOMAIN_KEY,
    uploadStrategy: {
      type: 'two_phase'  // ← Two-phase upload strategy
    },
    fetch: createChatkitFetch(pageContext),
  },
  composer: {
    attachments: {
      enabled: true,
      accept: { 'application/*': ['.pdf'] },
      maxCount: 1,
      maxSize: 10 * 1024 * 1024  // 10MB
    },
  },
});
```

### How Two-Phase Upload Works

According to OpenAI ChatKit documentation and TypeScript definitions (`node_modules/@openai/chatkit/types/index.d.ts:445-447`):

**Phase 1 - Registration:**
- Client calls `attachments.create` on the backend
- Backend creates attachment metadata and returns an `Attachment` object with `upload_url` set
- The `upload_url` should be a SAS URL pointing to Azure Blob Storage

**Phase 2 - Upload:**
- **ChatKit client sends:** `POST` request to the `upload_url`
- **Request format:** `multipart/form-data` with field name `file`
- **Body:** Multipart-encoded file bytes

### Custom Fetch Implementation
**Location:** `src/lib/chatkit-fetch.ts:4-17`

All ChatKit requests include:
- `X-Page-Context` header (multi-tenant context: channelCode, instance)
- `Authorization: Bearer debug-token` header

### Backend Handler
**Location:** `../backend/app/chat.py:249-250`

```python
async def to_message_content(self, _input: Attachment) -> ResponseInputContentParam:
    raise RuntimeError("File attachments are not supported in this demo.")
```

**Current State:** Backend explicitly rejects all file attachments before Phase 1 can complete.

---

## 2. Azure Blob Storage Requirements

### Source Documentation
- **Put Blob:** https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob
- **Put Block:** https://learn.microsoft.com/en-us/rest/api/storageservices/put-block

### Required HTTP Method
**Mandatory:** `PUT` (not POST, not multipart)

From Microsoft documentation:
> "The Put Blob operation creates a new block blob, or updates the content of an existing block blob."
> - **HTTP Method:** PUT
> - **Request URI:** `https://{account}.blob.core.windows.net/{container}/{blob}?{sas_token}`

### Required Headers

| Header | Requirement | Purpose |
|--------|-------------|---------|
| `x-ms-blob-type` | **REQUIRED** | Must be "BlockBlob", "PageBlob", or "AppendBlob" |
| `Content-Length` | **REQUIRED** | Size of blob in bytes (must be > 0 for BlockBlob) |
| `Authorization` | **REQUIRED** | SAS token (in query string) or Shared Key |
| `x-ms-version` | **REQUIRED** | API version (e.g., "2021-08-06") |
| `Date` or `x-ms-date` | **REQUIRED** | UTC timestamp |
| `Content-Type` | Optional | Defaults to `application/octet-stream` |
| `Content-MD5` | Optional | For integrity verification |

### Request Body Format
**Mandatory:** Raw binary bytes (NOT multipart/form-data)

From Microsoft documentation:
> "The request body contains the content of the blob."
> - For **BlockBlob**: Body contains the actual file bytes
> - Max size: 5,000 MiB (API version 2019-12-12+)

### Authentication
SAS (Shared Access Signature) URL format:
```
https://mlexperiments3670906687.blob.core.windows.net/rebatexpert-chatkit/attachments/{path}?sv=...&sig=...
```

The SAS token in the query string provides authentication. No additional `Authorization` header is needed when using SAS URLs.

---

## 3. Gap Analysis: ChatKit vs Azure

| Aspect | ChatKit Sends | Azure Expects | Match? |
|--------|---------------|---------------|--------|
| **HTTP Method** | `POST` | `PUT` | ❌ **MISMATCH** |
| **Request Body** | `multipart/form-data` with field `file` | Raw binary bytes | ❌ **MISMATCH** |
| **Content-Type** | `multipart/form-data; boundary=...` | `application/octet-stream` or file MIME type | ❌ **MISMATCH** |
| **x-ms-blob-type** | Not sent | **REQUIRED:** `BlockBlob` | ❌ **MISSING** |
| **Content-Length** | Multipart length (includes boundaries) | Raw file size in bytes | ❌ **INCORRECT VALUE** |
| **Authentication** | SAS token in URL | SAS token in URL | ✅ **MATCH** |

### Azure Error Response
```
HTTP 400 Bad Request
<?xml version="1.0" encoding="utf-8"?>
<Error>
  <Code>UnsupportedHttpVerb</Code>
  <Message>The resource doesn't support specified Http Verb.</Message>
</Error>
```

**Root Cause:** Azure Blob Storage REST API does not accept POST for blob uploads. Only PUT is supported for Put Blob and Put Block operations.

---

## 4. Can the Current Client Contract Remain Intact?

### Answer: YES ✅

The existing ChatKit client contract (POST multipart to upload_url) can remain unchanged by implementing a **backend proxy solution**.

### Prerequisites

1. **Backend must implement `AttachmentStore` interface** (`chat.py:249-250`)
2. **Backend must provide a proxy endpoint** to intercept uploads
3. **Proxy must parse multipart data** and extract file bytes
4. **Proxy must forward to Azure** using correct HTTP method and headers

### Proxy Flow

```
┌─────────────┐                ┌──────────────────┐                ┌───────────────┐
│  ChatKit    │                │  Backend Proxy   │                │ Azure Blob    │
│  Client     │                │  (FastAPI)       │                │ Storage       │
└──────┬──────┘                └────────┬─────────┘                └───────┬───────┘
       │                                 │                                  │
       │ Phase 1: Create Attachment      │                                  │
       ├────────────────────────────────>│                                  │
       │                                 │                                  │
       │ Returns {upload_url: "/upload/proxy/{id}"}                        │
       │<────────────────────────────────┤                                  │
       │                                 │                                  │
       │ Phase 2: POST multipart/form-data                                 │
       ├────────────────────────────────>│                                  │
       │                                 │                                  │
       │                                 │ Parse multipart payload          │
       │                                 │ Extract file bytes               │
       │                                 │                                  │
       │                                 │ PUT raw bytes + headers          │
       │                                 ├─────────────────────────────────>│
       │                                 │                                  │
       │                                 │ 201 Created                      │
       │                                 │<─────────────────────────────────┤
       │                                 │                                  │
       │ 200 OK                          │                                  │
       │<────────────────────────────────┤                                  │
       │                                 │                                  │
```

### Implementation Blockers

**Current:** Backend raises `RuntimeError` for all attachments (`chat.py:250`)

**Required Changes:**
1. Remove the error and implement `to_message_content` method
2. Implement `AttachmentStore` interface to handle Phase 1
3. Create proxy upload endpoint for Phase 2
4. Parse multipart/form-data to extract file bytes
5. Forward to Azure with PUT + required headers

**No Client Changes Required:** The ChatKit frontend can remain unchanged.

---

## 5. Recommended Approach

### Option A: Backend Proxy (Recommended) ✅

**Pros:**
- No changes to frontend/ChatKit configuration
- Centralized upload handling
- Can validate, scan, or transform files before Azure upload
- Can track upload metrics and errors
- Maintains ChatKit's two-phase contract

**Cons:**
- Requires backend implementation effort
- Files flow through backend (increased bandwidth/latency)
- Backend becomes a potential bottleneck for large files

### Implementation Steps

1. **Implement AttachmentStore** (`backend/app/chat.py`)
   ```python
   async def to_message_content(self, _input: Attachment) -> ResponseInputContentParam:
       # Return upload proxy URL instead of raising error
       upload_url = f"/upload/proxy/{_input.id}"
       return {"upload_url": upload_url}
   ```

2. **Create Upload Proxy Endpoint** (`backend/app/main.py`)
   ```python
   @app.post("/upload/proxy/{attachment_id}")
   async def upload_proxy(attachment_id: str, file: UploadFile = File(...)):
       # Parse multipart payload
       file_bytes = await file.read()

       # Get Azure SAS URL for this attachment
       azure_sas_url = get_azure_sas_url(attachment_id)

       # Forward to Azure with PUT
       async with httpx.AsyncClient() as client:
           response = await client.put(
               azure_sas_url,
               content=file_bytes,
               headers={
                   "x-ms-blob-type": "BlockBlob",
                   "Content-Length": str(len(file_bytes)),
                   "Content-Type": file.content_type or "application/octet-stream",
               }
           )

       if response.status_code != 201:
           raise HTTPException(status_code=500, detail="Azure upload failed")

       return {"status": "success"}
   ```

3. **Generate Azure SAS URLs** with appropriate permissions:
   - Permission: Write (`w`) and Create (`c`)
   - Expiry: Short-lived (e.g., 15 minutes)
   - Container: `rebatexpert-chatkit/attachments/...`

4. **Update AttachmentStore Implementation**
   - Store attachment metadata in database
   - Associate attachment ID with Azure blob path
   - Return proxy URL instead of direct SAS URL

### Option B: Direct Upload (Not Recommended for This Scenario) ❌

**Approach:** Modify ChatKit library or create custom upload client

**Pros:**
- Files go directly to Azure (reduced backend load)
- Lower latency

**Cons:**
- **Requires forking/patching `@openai/chatkit-react`** (maintenance burden)
- Breaks ChatKit's standard upload contract
- Complex frontend implementation
- No backend validation/scanning opportunity
- Potential CORS issues

**Verdict:** Not feasible without modifying ChatKit library source code.

---

## 6. Code References

| Component | File Path | Lines | Description |
|-----------|-----------|-------|-------------|
| ChatKit Config | `src/components/ChatKitPanel.tsx` | 46-82 | Upload strategy configuration |
| Upload Strategy Type | `node_modules/@openai/chatkit/types/index.d.ts` | 445-447 | TypeScript definition for two-phase |
| Custom Fetch | `src/lib/chatkit-fetch.ts` | 4-17 | Header injection for requests |
| Backend Attachment Handler | `../backend/app/chat.py` | 249-250 | **Current blocker:** Raises error |
| Backend Main Endpoint | `../backend/app/main.py` | 35-45 | ChatKit request handler |

---

## 7. Azure Documentation References

| Topic | URL | Key Requirements |
|-------|-----|------------------|
| Put Blob | https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob | **HTTP PUT**, `x-ms-blob-type`, raw bytes |
| Put Block | https://learn.microsoft.com/en-us/rest/api/storageservices/put-block | **HTTP PUT**, `Content-Length`, raw bytes |
| Put Block List | https://learn.microsoft.com/en-us/rest/api/storageservices/put-block-list | Commit uncommitted blocks |
| SAS Authorization | https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-access-signature | Query string authentication |

**Specific Quote from Put Blob Documentation:**
> "The Put Blob operation creates a new block blob"
> - **Request Syntax:** `PUT https://myaccount.blob.core.windows.net/mycontainer/myblob HTTP/1.1`
> - **Required Request Header:** `x-ms-blob-type: BlockBlob`
> - **Request Body:** "The request body contains the content of the blob."

---

## 8. Conclusion

### Current State
- ❌ Backend rejects all attachments (`chat.py:250`)
- ❌ ChatKit sends POST with multipart/form-data
- ❌ Azure requires PUT with raw bytes
- ❌ Missing required headers: `x-ms-blob-type`

### Recommended Solution
**Implement a backend proxy** that:
1. Accepts ChatKit's POST multipart/form-data (Phase 2)
2. Parses the multipart payload to extract file bytes
3. Forwards to Azure using PUT with raw bytes and required headers
4. Maintains the existing ChatKit client contract

### Next Steps
1. Remove `RuntimeError` from `backend/app/chat.py:250`
2. Implement `AttachmentStore` interface to return proxy URLs
3. Create `/upload/proxy/{attachment_id}` endpoint in `backend/app/main.py`
4. Implement multipart parsing and Azure PUT forwarding
5. Generate short-lived Azure SAS URLs with write permissions
6. Test with 10MB PDF file upload

### Estimated Effort
- Backend changes: ~4-6 hours (including testing)
- No frontend changes required
- Azure configuration: ~1 hour (SAS URL generation setup)

---

**Report Generated:** 2025-11-15
**Author:** Claude Code Analysis
**Codebase:** openai-chatkit-advanced-samples
