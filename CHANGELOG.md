# Changelog

All notable user-facing changes for this plugin are documented in this file.

## [1.0.0]

### Added

- Encrypted local TOTP vault storage backed by a master password.
- Dedicated sidebar management view for browsing, searching, reordering, and copying current codes.
- Manual entry creation and editing for TOTP accounts.
- `otpauth://` link import and QR image import for quickly filling entry details.
- Bulk multi-line `otpauth://totp/...` import with duplicate preview and selective replacement.
- Desktop-focused documentation, release checklist, and split language documentation via `README.md` and `README_ZH.md`.

### Changed

- Release positioning is now explicitly desktop-only for `v1`.
- Repository documentation is organized into English README, Chinese README, and changelog entry points.

### Security / Reliability

- Stored vault corruption or unsupported formats are surfaced explicitly instead of being treated like an uninitialized vault.
- Clearing the vault now uses a stronger typed confirmation flow.
- Master password creation and rotation now require a stronger minimum length.
- QR image handling now applies image scaling limits to reduce memory and UI freeze risk on oversized inputs.
- Release workflow guidance now includes `npm test`, and CI runs tests alongside build and lint checks.
