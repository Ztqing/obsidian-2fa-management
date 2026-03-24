# 2FA Management

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

---

# 2FA Management 中文说明

2FA Management 是一个 Obsidian 社区插件，用于在你的库中本地保存并生成 TOTP 双重验证验证码。
当前版本以桌面端为主，正式支持目标为 Obsidian Desktop。

## 功能简介

- 将 TOTP 密钥保存在 Obsidian 插件数据中。
- 使用主密码加密所有条目后再写入本地数据。
- 在专用侧边栏中显示验证码，并自动刷新倒计时。
- 支持手动录入、`otpauth://` 链接导入和二维码图片导入。
- 支持批量粘贴多行 `otpauth://totp/...` 链接进行导入。
- 批量导入时默认跳过重复条目，并允许你按需选择覆盖现有条目。
- 当前版本以桌面端为主，移动端支持会在单独验证后再开放。
- 运行时会自动跟随 Obsidian 语言：
  - 简体中文：`zh`、`zh-CN`、`zh-SG`、`zh-Hans`
  - 繁体中文：`zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant`
  - 其他语言：英文

## 安全模型

- TOTP 密钥保存在 Obsidian 插件数据中，并在写入前使用 Web Crypto 的 PBKDF2 + AES-GCM 在本地完成加密。
- 解锁后，主密码只保留在当前 Obsidian 会话内存中；保险库会持续保持解锁状态，直到你手动锁定或重启 Obsidian。
- 不提供密码找回功能；如果忘记主密码，只能清空保险库后重新创建。
- 复制验证码会写入系统剪贴板，插件不会自动清空剪贴板历史。
- 插件不会主动上传你的数据，但加密后的插件数据仍可能被你自己的备份或同步工具带走。
- 插件不包含遥测、远程代码执行或云端同步。

## 使用方法

1. 在命令面板中打开 **2FA Management: Open 2FA view**。
2. 创建加密保险库，并设置主密码。
3. 手动添加条目，或导入 `otpauth://` 链接、二维码图片。
4. 如需迁移多个账户，可在 2FA 视图中使用 **批量导入**，先预览再决定是否覆盖重复条目。
5. 需要复制验证码时，先解锁保险库。

## 批量导入范围

- 当前版本支持：批量粘贴多行 `otpauth://totp/...` 链接。
- 重复检测基于服务方和账户名称，默认跳过重复项。
- 你可以手动勾选需要覆盖的重复条目。
- 当前版本暂不支持：`otpauth-migration://` 数据和多张二维码图片批量导入。

## 当前限制与恢复边界

- 当前版本在 `manifest.json` 中按桌面专用发布。
- 暂时还没有导出或恢复流程。如果你准备把它作为主要 2FA 管理工具，请先保留原始绑定资料或其他备份。
- 如果已保存的保险库数据损坏或格式不兼容，插件现在会明确提示你先手动清空，再重新创建新的保险库。

## 开发

```bash
npm install
npm run dev
```

常用命令：

- `npm run build`
- `npm run lint`
- `npm run test`

## 发布文件

手动安装或发布时，请将以下文件复制到：

`<vault>/.obsidian/plugins/obsidian-2fa-management/`

- `main.js`
- `manifest.json`
- `styles.css`

## 发版检查清单

正式发版前请运行：

- `npm run test`
- `npm run lint`
- `npm run build`

然后在一个干净的桌面测试库里手动验证：

- 创建、解锁、锁定保险库
- 添加、编辑、排序、删除条目
- 批量导入 otpauth 链接
- 导入二维码图片
- 修改主密码
- 使用输入确认文本的清空流程清空保险库
