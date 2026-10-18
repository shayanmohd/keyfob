# Keyfob: Play Store listing

**Package:** com.mohdshayan.keyfob
**Category:** Tools
**Pricing:** Free, no in-app purchases, no ads

## Title (30 max)
Keyfob: Split Your Phrase

## Short description (80 max)
Turn one recovery phrase into guardian cards. Offline, and never a wallet.

## Full description (4000 max)
A recovery phrase on one piece of paper has two ways to end badly: the paper is lost, or you are, and
nobody left knows what the paper was for. Keyfob is for both, and it does nothing else.

WHAT IT DOES
You already hold a recovery phrase. Keyfob turns it into a set of cards and spreads them across people
and places, so losing any one of them is a shrug rather than a catastrophe. Choose how many cards exist
and how many are needed to rebuild the phrase: three of five is the usual answer. Any two cards, held
apart, tell an attacker nothing at all.

WHAT IT IS NOT
It is not a wallet. It never sees an address, a balance or a transaction, and it cannot move anything.
It cannot even reach the network to try: the app declares no internet permission, which you can check on
this listing before you install it.

THE MATHEMATICS, PLAINLY
Your phrase is a number. Keyfob picks a random curve through that number and hands each guardian one
point on it. Fewer points than the threshold and every possible phrase stays exactly as likely as it was
before, which is a stronger promise than encryption can make. Reach the threshold and the curve, and the
phrase, come back. This is Shamir secret sharing over the field of 256 elements, the same arithmetic
behind SLIP-39 hardware wallet backups.

CARDS A HUMAN CAN HANDLE
Each card is written in the same 2048 BIP-39 words a recovery phrase uses, so a guardian is copying out
one familiar kind of thing. The card carries its own number, the threshold and a checksum, so a mistyped
or swapped word is caught before anything is built on it. Print them, write them out, seal them.

THE PLAN, WRITTEN DOWN
Who holds which card, where it lives, and what the person who has to do this without you should do first.
A letter you write once, kept with the plan. A rehearsal drill: ring the people holding the cards, type
them back in, and watch the app rebuild the phrase and check it against its fingerprint without ever
showing it. A recovery plan nobody has practised is a wish. There is also a short quiz that checks you
understood what you just set up, and a threat model in plain words about what this defends against and
what it does not.

WHAT IT LOOKS LIKE
One drawing carries the whole app: a key, broken cleanly into as many shards as you have cards. A shard
is solid when its holder has confirmed the card, hatched when nobody has checked lately, and drifted out
of line when it is gone. During a drill the shards light up one by one as the cards come in, and when the
threshold is reached the key is whole again for a moment.

YOUR PHRASE IS NEVER STORED
It is held in memory only while the cards are being built and is gone the moment you leave that screen.
It is never written to storage, to a log, or to any file the app makes. The plan and the guardians' names
stay on your device. There is no account, no cloud, no analytics and no advertising ID.

Free and complete. A tool for the day something goes wrong should not have a subscription.

## Contact
Email: shayanm2002@gmail.com
Website: https://shayanmohd.github.io/keyfob/
Privacy policy: https://apps.mohdshayan.com/privacy-policies/keyfob-privacy-policy.html

## Declarations (read off the built manifest and the code)
- Permissions declared: VIBRATE. No INTERNET.
- Ads: none. Data collected or shared: none. Advertising ID: not used.
- App access: all functionality available without any login.
- Financial features: none. The app holds no funds, no keys to funds, no address, no balance and no
  transaction, performs no exchange or custody, and has no network access. It splits a secret the user
  already possesses and writes down a plan.
- Government / health features: none.
- Target audience: 18 and over.
- Content rating: no violence, sexuality, profanity, controlled substances, gambling, user-to-user
  communication or location sharing. No cryptocurrency is bought, sold, held or transferred.
- AI-generated assets: none. The icon and the feature graphic are hand-written SVG and HTML in store/,
  rendered by a headless browser; the screenshots are captures of the running app.
- Note for review: this app is adjacent to the crypto wallet category and deliberately outside it. If a
  reviewer needs the distinction, the whole of `web/js/shamir.js` and `web/js/bip39.js` is the app's
  cryptography, and there is no networking code anywhere in the build.
