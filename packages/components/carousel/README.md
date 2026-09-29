# @c2n/carousel

Carousel built with Lit: a swipeable slideshow of its children, with previous/next controls, indicators, looping and
optional autoplay.

```bash
npm install @c2n/carousel
```

```html
<script type="module">
  import '@c2n/carousel'
</script>

<c2-carousel label="Featured" loop>
  <img src="one.jpg" alt="…" />
  <img src="two.jpg" alt="…" />
  <img src="three.jpg" alt="…" />
</c2-carousel>

<!-- Three slides per view, rotating every 4 seconds -->
<c2-carousel label="Products" autoplay interval="4000" style="--c2-carousel__slide--width: calc((100% - 32px) / 3)"> … </c2-carousel>
```

```js
document.querySelector('c2-carousel').addEventListener('slide-change', (event) => {
  console.log(`now on slide ${event.detail.index + 1} of ${event.detail.count}`)
})
```

Every child element is a slide. The track scrolls natively with CSS scroll snapping, so touch, trackpad and keyboard
all work. Slide width, gap, and whether the controls and indicators show are CSS variables; see the API page of the
docs site for the full list.
