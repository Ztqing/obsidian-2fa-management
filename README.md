<div align="center">
  <h1>2FA Management</h1>
  <p><strong>A local-first Obsidian plugin for storing and generating encrypted TOTP codes.</strong></p>
  <p>English | <a href="README_ZH.md">中文</a> | <a href="CHANGELOG.md">Changelog</a></p>
</div>

## What it does

- Stores TOTP secrets locally in Obsidian plugin data.
- Encrypts all stored entries with a master password before saving.
- Shows codes in a dedicated sidebar view with automatic countdown refresh.
- Supports manual entry, `otpauth://` URI import, and QR image import.
- Supports bulk paste import for multi-line `otpauth://totp/...` links.
- Skips duplicates by default during bulk import and lets you selectively replace existing entries.
- Targets desktop use in this release. Mobile support will be revisited after dedicated validation.
- Follows the Obsidian interface language at runtime:
  - Simplified Chinese for `zh`, `zh-CN`, `zh-SG`, and `zh-Hans`
  - Traditional Chinese for `zh-TW`, `zh-HK`, `zh-MO`, and `zh-Hant`
  - English for every other language

## Project status

The desktop-first local encrypted TOTP workflow is already in place. The checklist below marks what is done and what we plan to tackle next.

- [x] Build a local encrypted vault with a master password and `PBKDF2 + AES-GCM`.
- [x] Support manual vault unlock and lock flows inside the plugin.
- [x] Detect corrupted or unsupported stored vault data and prompt the user before repair.
- [x] Add TOTP entry management for create, edit, delete, search, reorder, sidebar viewing, and code copy.
- [x] Support `otpauth://` URI import, QR image import, and multi-line bulk import.
- [x] Preview duplicates during bulk import and allow selective replacement.
- [x] Ship localization for English, Simplified Chinese, and Traditional Chinese.
- [x] Add preferences for sidebar placement and upcoming-code visibility.
- [x] Establish a desktop-first release baseline with tests for encryption, TOTP, import flows, view interactions, command guards, and the version script.
- [ ] Finish the current workspace polish around toolbar consolidation, copy feedback, code animation and layout, and unlock race hardening.
- [ ] Add encrypted export and import with preflight validation and recovery guidance, without adding plaintext export.
- [ ] Continue hardening session safety with additional lock-on-blur or resume behavior and optional clipboard auto-clear, building on the new inactivity timeout and restart lock policies.
- [ ] Move from clear-only repair toward safer data migration and compatibility handling.
- [ ] Expand the desktop regression checklist around real release flows and larger data sets.
- [ ] Revisit mobile support after dedicated validation beyond the current `isDesktopOnly: true` release scope.
- [ ] Consider any cloud sync or online service work only after a clear privacy and threat model exists.

The roadmap prioritizes data safety, offline usability, and desktop stability.

## Security model

- Secrets are stored in Obsidian plugin data, then encrypted locally with Web Crypto using PBKDF2 + AES-GCM before saving.
- The master password must be at least 6 characters long.
- The default lock policy is **On Obsidian restart**, which keeps the master password in memory only until you lock the vault manually or restart Obsidian.
- You can switch the lock policy to a custom inactivity timeout, **On Obsidian restart**, or **Never**. The **Never** policy stores the unlock secret for restart recovery.
- When the desktop exposes Electron `safeStorage`, **Never** uses that backend and may warn if the desktop only provides weak plain-text-backed protection.
- When restart-recoverable secure storage is unavailable, you can explicitly enable a low-security compatibility mode for **Never**. That fallback stores the unlock secret directly in plugin data and should only be used on a private device you trust.
- There is no password recovery flow. If you forget the master password, the vault must be cleared and recreated.
- Copying a code writes it to the system clipboard. The plugin does not automatically clear clipboard history.
- The plugin does not upload your data, but encrypted plugin data can still be copied by your own device backups or sync tools.
- No telemetry, remote code execution, or network sync is built into the plugin.

## Usage

1. Open **2FA Management: Open 2FA view** from the command palette.
2. Create the encrypted vault and choose a master password with at least 6 characters.
3. Add entries manually, paste an `otpauth://` URI, or import a QR image.
4. Choose a lock policy in Settings: a custom inactivity timeout, **On Obsidian restart**, or **Never**.
5. If this desktop cannot provide restart-recoverable secure storage and you still want **Never**, explicitly enable the low-security compatibility mode in Settings first.
6. For migration, use **Bulk import** in the 2FA view or the bulk import command, then review duplicates before saving.
7. Unlock the vault when needed to copy current TOTP codes.

## Bulk import scope

- Supported in this release: multi-line `otpauth://totp/...` paste import.
- Duplicate detection uses issuer + account name and skips matches by default.
- You can selectively choose which duplicates should replace existing entries.
- Not supported in this release: `otpauth-migration://` payloads and batch QR image import.

## Limitations and recovery

- This release is marked desktop-only in `manifest.json`.
- There is no export or recovery flow yet. Keep your original 2FA enrollment or backup material before relying on this vault as your only copy.
- If stored vault data becomes unreadable or incompatible, the plugin now asks you to clear it explicitly before creating a new vault.
- The low-security compatibility mode for **Never** is opt-in and device-local. Disabling it clears its saved restart-unlock data and may switch the lock policy back to **On Obsidian restart** if no secure backend is available.

## Development

```bash
npm install
npm run dev
```

Useful commands:

- `npm run build`
- `npm run lint`
- `npm run test`

## Release artifacts

For manual installation or release builds, copy these files into:

`<vault>/.obsidian/plugins/2fa-management/`

- `main.js`
- `manifest.json`
- `styles.css`

## Release checklist

Before publishing a release, run:

- `npm run test`
- `npm run lint`
- `npm run build`

Then verify in a clean desktop vault:

- create, unlock, and lock the vault
- add, edit, reorder, and delete entries
- bulk import otpauth links
- import a QR image
- change the master password
- clear the vault with the typed confirmation flow
