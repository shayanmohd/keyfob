# Keyfob

Split the phrase, rehearse the day. Turn one recovery phrase into a set of guardian cards using Shamir
secret sharing, write down the plan, and practise the recovery before you need it.

It is not a wallet. It never sees an address, a balance or a transaction, and it declares no INTERNET
permission.

- **Play listing:** https://play.google.com/store/apps/details?id=com.mohdshayan.keyfob
- **Site:** https://shayanmohd.github.io/keyfob/
- **Try it in a browser:** https://shayanmohd.github.io/keyfob/play/
- **Privacy policy:** https://shayanmohd.github.io/keyfob/privacy-policy.html

## How it is built

`web/` is the whole app: plain HTML, CSS and JavaScript, no build step and no dependencies. The
cryptography is `js/shamir.js` (Shamir secret sharing over GF(256), byte by byte) and `js/bip39.js` (the
official 2048 word list, phrase to entropy and back, with checksum validation). There is no networking
code anywhere in it.

`android/` is a thin Kotlin WebView shell that serves `web/` from an app-private https origin.

`docs/` is the GitHub Pages site: landing page, privacy policy and a playable copy.

## Build

```sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease
```

Signing reads `android/keystore.properties`, which is not in this repository.
