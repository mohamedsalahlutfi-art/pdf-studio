# MoCall Private v0.2.0

Arabic-first **self-hosted one-to-one audio/video calling** with Android APK and browser guests.

## Implemented
- Own Node.js + WebSocket signaling. No Jitsi, Google Meet, or redirects.
- WebRTC media encryption in transit via DTLS-SRTP; optional self-hosted coturn relay.
- ECDSA P-256 device/browser public/private key pair generated locally. The 22-character ID is derived from the public key, not a MAC address. Private keys remain in IndexedDB; the signaling server challenges signatures.
- Contacts stored locally, not in a central contacts database.
- Voice/video incoming call, accept/reject, microphone mute, video toggle and hangup while both devices are connected.
- Share an HTTPS URL with a public call ID; guests join through a browser without installing MoCall.
- Native Android WebView with microphone/camera permissions restricted to the configured HTTPS server.
- No audio/video recording code, server call-content logging, or telemetry.

## Reality checks
A public HTTPS/WSS server must run continuously. GitHub Releases can store the APK and GitHub can host source, but GitHub Pages cannot host live WebSockets or TURN. The APK initially opens a server URL setup screen until you deploy. **This APK does not independently provide live calls without a server.**

To reach cellular/Wi-Fi users behind NAT, configure public-IP TURN (Docker Compose service included). Carrier networks can still block or disrupt calls. This product does not disguise VoIP or contain blocking-evasion features. In the UAE, VoIP is regulated; verify licensing/TDRA requirements. No 100% privacy guarantee: the server and ISP see metadata, peers may see IP addresses and may record on their own phones, and a malicious or compromised signaling server can mount an active attack unless fingerprints are independently verified (not included in this prototype).

**Background incoming calls are NOT implemented.** Both participants must have the app/browser open and remain connected. Native call-screen notifications and private push are future work.

## Deploy on your own server
1. Obtain a domain and public IPv4 server, point DNS A record to the server. Allow TCP 80/443/3478 and UDP 3478 plus 49160-49200.
2. Copy .env.example to .env and replace DOMAIN, PUBLIC_IP, and TURN_SECRET (unique random 64-character hex). Keep .env out of Git.
3. Install Docker Compose on the server. Run: docker compose up -d --build
4. Caddy provisions HTTPS for your domain, Node serves the web app and WSS signaling, coturn provides relay traversal.
5. Check https://YOUR_DOMAIN/healthz. Open Android APK and enter https://YOUR_DOMAIN.
6. Share the displayed link with someone who opens it in their browser. Both sides must stay connected.

**Local test:** cd server && npm install && npm test && npm start ; open http://localhost:8787 in two separate browser profiles on the same computer. For two devices on the public Internet you need real HTTPS and reachable TURN.

## Android APK
GitHub Actions runs signaling tests, builds an Android debug-signed APK, and uploads it to a direct GitHub Release:
https://github.com/mohamedsalahlutfi-art/pdf-studio/releases/tag/mocall-v0.2.0

This is a test APK, not a production-signed release or audited private communications product. Android browser data deletion erases the identity, and contacts need manual re-pairing. A permanent Android signing key is needed for stable future production updates.

## Files
- server/server.js: authentication and WebSocket signaling
- server/public/: Arabic-first UI, identity and browser WebRTC
- server/test/: signaling smoke tests
- server/Dockerfile, server/Caddyfile, docker-compose.yml: deployment
- .env.example: example only — must set secret on server
- app/: native Android shell with trusted WebRTC permissions
- .github/workflows/build-apk.yml: test, build, publish

## Future
Independent verification of peer identity, encryption-independent contact backup, background call notifications via a privacy-conscious approach, group conferencing, stronger abuse protections and security audits.
