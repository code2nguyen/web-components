/**
 * The Google Maps key of the docs site, set at build time from the `PUBLIC_GOOGLE_MAPS_API_KEY` environment variable
 * (a GitHub Actions secret in `deploy.yml`). It ends up in the page, as every Maps JavaScript API key does: the key is
 * restricted in the Google Cloud console to the site's referrers. Without it, the map examples say a key is needed.
 */
import { configureGoogleMaps } from '@c2n/components/google-map'

const apiKey: string | undefined = import.meta.env.PUBLIC_GOOGLE_MAPS_API_KEY
if (apiKey) configureGoogleMaps({ apiKey })
