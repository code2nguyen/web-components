# OTP Input

A form-associated, themeable one-time-code field that renders one cell per character.

```bash
npm install @c2n/otp-input
```

```html
<c2-otp-input name="code" length="6" required aria-label="Verification code"></c2-otp-input>
```

A single native input sits over the cells, so paste, undo and SMS autofill (`autocomplete="one-time-code"`) work as they do in a
plain text field. Listen for `complete` to submit as soon as every cell is filled.
