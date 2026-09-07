# Keyfob

One phrase, split into cards. Turn one recovery phrase into a set of guardian cards using Shamir secret
sharing, write down the plan, and practise the recovery before you need it.

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
code anywhere in it. `js/mark.js` draws the app's mark, a key broken into one shard per card, which is
the same drawing as the launcher icon in `store/icon.svg`.

`test/` holds the headless browser scripts the app is driven with. `00-crypto-proof.js` is the one that
matters most: it splits a known 24 word phrase three ways of five, checks every one of the ten subsets of
three against the phrase word for word, checks that none of the ten pairs produces it, and reads the
cards back a second time with an independent GF(256) implementation and node's own SHA-256, so nothing
in the proof depends on the code it is testing. `04-upgrade.js` loads a record written by a previous
release and proves nothing in it is lost or misread. `08-contrast.js` measures WCAG contrast off the
running page, and `09-review.js` measures safe areas, back behaviour and double taps on every screen.

`android/` is a thin Kotlin WebView shell that serves `web/` from an app-private https origin.

`docs/` is the GitHub Pages site: landing page, privacy policy and a playable copy.

## Build

```sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease
```

Signing reads `android/keystore.properties`, which is not in this repository.
