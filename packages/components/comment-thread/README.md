# Comment Thread

`c2-comment-thread` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/comment-thread'
```

```html
<c2-comment-thread
  quote="border-radius: 6px"
  current-user='{"id":"ben","name":"Ben Ito"}'
  comments='[{"id":1,"author":{"id":"ana","name":"Ana Diaz"},"body":"Should this be a token?","time":"2026-10-27T08:00:00Z"}]'
></c2-comment-thread>
```

One conversation on a piece of content, like a Google Docs comment or a GitHub review thread: the first comment and
its replies, a reply box, edit and delete on your own comments, reactions and Resolve.

- Bodies are plain text: line breaks kept, `@mentions` highlighted, never read as HTML.
- Every change is a cancelable event fired before it is applied (`comment-add`, `comment-edit`, `comment-delete`,
  `resolve-change`, `reaction-change`), so the thread can be kept controlled while a server answers.
- Long threads fold their middle; a resolved thread folds to its first comment.
- Themed through `--c2-comment-thread*` custom properties; see the API page of the docs site.
