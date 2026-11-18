# MoCall Personal 0.1.0
برنامج شخصي للمكالمات والاجتماعات، عربي أولاً. APK للأندرويد وواجهة ويب ثابتة.

## Functionality
- Create cryptographically random Jitsi Meet room link.
- Share invite through Android share sheet, including WhatsApp.
- Guest joins through HTTPS browser link without installing *MoCall*.
- Join an existing Jitsi room.
- Store local recent links only in browser/app storage.
- No paid APIs or GitHub Actions credits required for public-repo workflows (subject to GitHub policy).

## Important limitations
- This is a **meeting-link client**, not an independently hosted calling stack. Audio/video media is provided by Jitsi Meet, not GitHub.
- On meet.jit.si the **first participant must sign in** (Google / GitHub etc.) to create the room; guests normally join anonymously once moderator is present.
- Android app **opens the meeting in the device browser**, for compatibility with meeting permissions and OAuth; calls are not embedded in this initial APK.
- Jitsi's own mobile browser landing page may suggest downloading Jitsi, but provides a **Continue on the web** option.
- Calls require internet; no true incoming phone-style background ringing or contact directory in this version.
- Public meeting links should be treated as invitations: send only to intended people. Confidential calls should use appropriate host settings.
- This is a prototype for personal use, not tested or licensed as a UAE commercial VoIP service.
- Release APK is signed with GitHub's temporary **debug** certificate; updates/install signing for a production app require a persistent private signing key.

## Android
Run via GitHub Actions on branch mocall-personal; it generates app-debug.apk signed for testing and publishes it automatically to GitHub Release:
https://github.com/mohamedsalahlutfi-art/pdf-studio/releases/tag/mocall-v0.1.0

Build locally (JDK 17, Android SDK 35, Gradle 8.10.2):
gradle :app:assembleDebug

## Web
Open web/index.html in a browser; for production publish web/ on any HTTPS static host.
The guest's invite link points directly to https://meet.jit.si, so no web hosting is required for guests.

## Source separation
This app is stored on the isolated "mocall-personal" branch of an existing user repository. The default branch and original PDF Studio project were not modified. Prefer migrating to a dedicated repository later.
