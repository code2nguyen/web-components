# @c2n/google-map

Google Maps as web components: a map, markers, the road route from A to B with its distance and travel time, and
Street View.

```bash
npm install @c2n/google-map
```

```js
import { configureGoogleMaps } from '@c2n/google-map'

configureGoogleMaps({ apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY })
```

```html
<c2-google-map center="10.7769,106.7009" zoom="14">
  <c2-google-map-marker position="10.7725,106.6980" label="Ben Thanh Market"></c2-google-map-marker>
  <c2-google-map-route origin="Ben Thanh Market, Ho Chi Minh City" destination="10.7950,106.7218"></c2-google-map-route>
</c2-google-map>

<c2-google-street-view position="48.8584,2.2945" heading="320"></c2-google-street-view>
```

## The API key

The Maps JavaScript API runs in the browser, so the key is always visible to the page — a server cannot hide it.
Protect it in the Google Cloud console:

- **Application restriction:** HTTP referrers, listing only your sites (and `http://localhost:*/*` for development).
- **API restriction:** Maps JavaScript API, plus Routes API if you use `c2-google-map-route`.
- **Quotas and a budget alert**, so a leaked key cannot run up a bill.

Markers need a map ID. Without `map-id`, the map uses Google's `DEMO_MAP_ID`, which is for development only: create
a map ID in the console for production.

Everything else the Maps JavaScript API offers is reachable through `element.map` (the `google.maps.Map`),
`marker.marker`, `route.route` and `streetView.panorama`.
