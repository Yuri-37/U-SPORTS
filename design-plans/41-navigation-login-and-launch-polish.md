# 41 — Navigation that gets out of the way, a login that arrives smoothly, and no old-colour flash

- **Status**: DONE (Android 1.10.20)

## Navigation bar (portrait)
- The raised button is smaller (44px, rising 12px above the bar instead of 54px / 24px), so it covers less of the page.
- **Minimise while scrolling:** while the page scrolls vertically the bar slims down (64px to 44px), the raised button sinks into it as a small circle, the notch closes and the labels fade. It springs back out a moment after scrolling stops. Remove animations keeps it full-size.
- A tap on any tab, including "Sign in", gives a quick squash-and-spring press so it always feels acknowledged.

## Sign in
- Tapping "Sign in" in the bar (and "Sign in as an athlete" on Home) now pushes the login page: it rises about 14% and fades in over 380ms while the tab bar slides down out of the way, and back reverses it. Back from login returns to the tab you were on. Remove animations shows it at once.
- A custom page transition does not drive the page underneath it, so the page reports its progress through `navCover` / `NavCoverReporter` (in `app_shell.dart`), which the bar reads to slide itself away.

## Tabs
- Home, Rankings, Events and Profile are still kept alive, but switching fades the old tab out while the new one fades in and slides a little from its side (`BranchFader`, 300ms). Remove animations swaps at once.

## Old look flashing at launch
- Cause: the app started with built-in default colours (the old navy `#002D62`) and only picked up the school's real colours, name and logo after the server answered.
- Fix: the school's last-seen look is saved on the device (`InstitutionCache`) and applied before the first frame, so the app opens already in the school's colours and name. The built-in defaults are now the school's current blue `#0066FF` and gold `#F4C430`, so even a fresh install matches the splash colour.
