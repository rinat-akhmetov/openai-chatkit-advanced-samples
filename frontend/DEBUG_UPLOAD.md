# Debug ChatKit Upload Issue

## Steps to Test

1. **Restart the dev server:**
   ```bash
   npm run dev
   ```

2. **Open browser console** (F12 or Cmd+Option+I)

3. **Upload a PDF file** through ChatKit

4. **Check console logs** - you should see:
   ```
   [ChatKit Fetch] Request intercepted: { url: '...', method: '...', bodyType: '...', isAzure: true/false }
   [ChatKit Azure Upload] Azure URL detected, checking request details...
   [ChatKit Azure Upload] Request details: { method: '...', hasFormData: true/false, bodyType: '...' }
   ```

## Expected Log Output

### If transformation works ✅
```
[ChatKit Fetch] Request intercepted: {
  url: 'https://...blob.core.windows.net/...',
  method: 'POST',
  bodyType: 'FormData',
  isAzure: true
}
[ChatKit Azure Upload] Azure URL detected, checking request details...
[ChatKit Azure Upload] Request details: {
  method: 'POST',
  hasFormData: true,
  bodyType: 'FormData'
}
[ChatKit Azure Upload] Transforming POST multipart to PUT raw bytes
[ChatKit Azure Upload] File extracted: {
  name: 'document.pdf',
  size: 1048576,
  type: 'application/pdf'
}
[ChatKit Azure Upload] Transformed request: {
  method: 'PUT',
  contentLength: 1048576,
  contentType: 'application/pdf',
  fileName: 'document.pdf'
}
```

### If body is not FormData ❌
```
[ChatKit Fetch] Request intercepted: {
  url: 'https://...blob.core.windows.net/...',
  method: 'POST',
  bodyType: 'Blob',  ← Not FormData!
  isAzure: true
}
[ChatKit Azure Upload] Azure URL detected, checking request details...
[ChatKit Azure Upload] Request details: {
  method: 'POST',
  hasFormData: false,  ← Problem!
  bodyType: 'Blob'
}
[ChatKit Azure Upload] Body is not FormData, skipping transformation
```

## What to Report Back

Please share:
1. **All console logs** with `[ChatKit` prefix
2. **Network tab** - what HTTP method was actually sent (POST or PUT)?
3. **Network tab** - Request Headers, especially `Content-Type` and `x-ms-blob-type`
4. **Network tab** - Response status (still 400 UnsupportedHttpVerb?)

## Possible Issues

### Issue 1: Body is not FormData
**Symptom:** Logs show `bodyType: 'Blob'` or `bodyType: 'ReadableStream'`
**Cause:** ChatKit may be pre-serializing the FormData
**Solution:** Need to parse multipart body from Blob/string

### Issue 2: Custom fetch not called
**Symptom:** No console logs at all
**Cause:** Dev server not restarted, or ChatKit not using custom fetch
**Solution:** Restart dev server, verify `ChatKitPanel.tsx` has `fetch: createChatkitFetch(pageContext)`

### Issue 3: Azure URL not detected
**Symptom:** Logs show `isAzure: false`
**Cause:** URL format different than expected
**Solution:** Check actual upload URL format

### Issue 4: File extraction fails
**Symptom:** Error "Could not extract file from FormData"
**Cause:** FormData field name is not 'file'
**Solution:** Log FormData keys to see actual field name

## Quick Verification

Run this in browser console to verify custom fetch is active:
```javascript
// Should see the custom fetch function
console.log(window.fetch.toString().includes('createChatkitFetch'));
```

## If Still Not Working

We may need to:
1. Parse multipart body manually if body is already serialized
2. Use a different interception point (Service Worker, or modify ChatKit component)
3. Check if ChatKit is using a different upload mechanism

---

**Next step:** Restart dev server, try upload, report back console logs
