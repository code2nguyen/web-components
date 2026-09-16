# Upload

`@c2n/upload` is a Lit web component for browsing or dropping files, validating them, uploading one or many files, and presenting the queue with `c2-attachment`.

```bash
npm install @c2n/upload
```

```html
<script type="module" src="/node_modules/@c2n/upload/dist/upload.js"></script>

<c2-upload id="documents" name="documents" multiple accept=".pdf,image/*" max-files="5" max-size="10485760"></c2-upload>

<script type="module">
  const upload = document.querySelector('#documents')
  upload.uploadHandler = async (file, { signal, onProgress }) => {
    // Connect XMLHttpRequest, an SDK, or another transport here.
    // Call onProgress(0–100), resolve with the server result, and honor signal for cancellation.
    onProgress(50)
    return { name: file.name }
  }
</script>
```

Set `auto-upload="false"` to prepare the queue and call `upload()` later. Failed handlers render the attachment retry action. Removing an active item aborts its signal. The form-associated element contributes every selected file under `name` and supports `required` validation.

Single-file uploaders hide the picker once a file is accepted and restore it after removal. Multiple uploaders remain open until `max-files` is reached and report the remaining capacity. Use `variant="compact"` for a button-only picker without drag-and-drop.
