# @c2n/cascader

`<c2-cascader>` selects a path through nested data in one multi-column floating panel.

```bash
npm install @c2n/cascader
```

```html
<c2-cascader id="location" aria-label="Choose a location" placeholder="Please select"></c2-cascader>
```

```js
import '@c2n/cascader'

const cascader = document.querySelector('#location')
cascader.options = [
  {
    value: 'zhejiang',
    label: 'Zhejiang',
    children: [
      {
        value: 'hangzhou',
        label: 'Hangzhou',
        children: [{ value: 'west-lake', label: 'West Lake' }],
      },
    ],
  },
]

cascader.addEventListener('cascader-change', (event) => {
  console.log(event.detail.value) // ['zhejiang', 'hangzhou', 'west-lake']
})
```

Set `expand-trigger="hover"` to open child columns on hover. Set `change-on-select` when branches as well as leaves are valid values. The component is form-associated and submits its selected path separated by semicolons.
