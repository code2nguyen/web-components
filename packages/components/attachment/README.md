# @c2n/attachment

File and image attachments with metadata, upload progress, failure states, actions, and responsive grouping.

```html
<script type="module">
  import '@c2n/attachment'
</script>

<c2-attachment-group>
  <c2-attachment name="project-brief.pdf" type="PDF" size="2.4 MB" status="complete" removable></c2-attachment>
  <c2-attachment name="video.mp4" type="MP4" size="18 MB" status="uploading" progress="64" removable></c2-attachment>
</c2-attachment-group>
```

Importing the package root registers both `c2-attachment` and `c2-attachment-group`.
