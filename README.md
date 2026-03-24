<div align="center">
  <h1>2FA Management</h1>
  <p><strong>A local-first Obsidian plugin for storing and generating encrypted TOTP codes.</strong></p>
  <p>English | <a href="README_ZH.md">中文</a> | <a href="CHANGELOG.md">Changelog</a></p>
</div>

<hr>

2FA Management is an Obsidian community plugin for storing and generating TOTP codes inside your vault.
This release is desktop-first and currently targets Obsidian Desktop.

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

## Security model

- Secrets are stored in Obsidian plugin data, then encrypted locally with Web Crypto using PBKDF2 + AES-GCM before saving.
- The master password is only kept in memory for the current Obsidian session after unlock, and the vault stays unlocked until you lock it manually or restart Obsidian.
- There is no password recovery flow. If you forget the master password, the vault must be cleared and recreated.
- Copying a code writes it to the system clipboard. The plugin does not automatically clear clipboard history.
- The plugin does not upload your data, but encrypted plugin data can still be copied by your own device backups or sync tools.
- No telemetry, remote code execution, or network sync is built into the plugin.

## Usage

1. Open **2FA Management: Open 2FA view** from the command palette.
2. Create the encrypted vault and choose a master password.
3. Add entries manually, paste an `otpauth://` URI, or import a QR image.
4. For migration, use **Bulk import** in the 2FA view or the bulk import command, then review duplicates before saving.
5. Unlock the vault when needed to copy current TOTP codes.

## Bulk import scope

- Supported in this release: multi-line `otpauth://totp/...` paste import.
- Duplicate detection uses issuer + account name and skips matches by default.
- You can selectively choose which duplicates should replace existing entries.
- Not supported in this release: `otpauth-migration://` payloads and batch QR image import.

## Limitations and recovery

- This release is marked desktop-only in `manifest.json`.
- There is no export or recovery flow yet. Keep your original 2FA enrollment or backup material before relying on this vault as your only copy.
- If stored vault data becomes unreadable or incompatible, the plugin now asks you to clear it explicitly before creating a new vault.

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

`<vault>/.obsidian/plugins/obsidian-2fa-management/`

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
