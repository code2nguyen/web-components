import { installFakeGoogle } from './fake-google'

const scope = window as unknown as { noFakeGoogle?: boolean; installFakeGoogle: typeof installFakeGoogle; configureGoogleMaps: unknown }
// The loader test turns the fake off and serves it from the script URL instead.
scope.installFakeGoogle = installFakeGoogle
if (!scope.noFakeGoogle) installFakeGoogle()

scope.configureGoogleMaps = (await import('../src/google-map')).configureGoogleMaps
document.documentElement.dataset.modulesReady = 'true'
