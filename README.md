# 2FA Management

2FA Management is an Obsidian community plugin for storing and generating TOTP codes inside your vault.

## What it does

- Stores TOTP secrets locally in Obsidian plugin data.
- Encrypts all stored entries with a master password before saving.
- Shows codes in a dedicated sidebar view with automatic countdown refresh.
- Supports manual entry, `otpauth://` URI import, and QR image import.
- Follows the Obsidian interface language at runtime:
  - Simplified Chinese for `zh`, `zh-CN`, `zh-SG`, and `zh-Hans`
  - Traditional Chinese for `zh-TW`, `zh-HK`, `zh-MO`, and `zh-Hant`
  - English for every other language

## Security model

- Secrets are encrypted with Web Crypto using PBKDF2 + AES-GCM.
- The master password is only kept in memory for the current Obsidian session after unlock.
- There is no password recovery flow. If you forget the master password, the vault must be cleared and recreated.
- No telemetry, remote code execution, or network sync is built into the plugin.

## Usage

1. Open **2FA Management: Open 2FA view** from the command palette.
2. Create the encrypted vault and choose a master password.
3. Add entries manually, paste an `otpauth://` URI, or import a QR image.
4. Unlock the vault when needed to copy current TOTP codes.

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

---

# 2FA Management 中文说明

2FA Management 是一个 Obsidian 社区插件，用于在你的库中本地保存并生成 TOTP 双重验证验证码。

## 功能简介

- 将 TOTP 密钥保存在 Obsidian 插件数据中。
- 使用主密码加密所有条目后再写入本地数据。
- 在专用侧边栏中显示验证码，并自动刷新倒计时。
- 支持手动录入、`otpauth://` 链接导入和二维码图片导入。
- 运行时会自动跟随 Obsidian 语言：
  - 简体中文：`zh`、`zh-CN`、`zh-SG`、`zh-Hans`
  - 繁体中文：`zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant`
  - 其他语言：英文

## 安全模型

- 使用 Web Crypto 的 PBKDF2 + AES-GCM 加密已保存的密钥。
- 解锁后，主密码只保留在当前 Obsidian 会话内存中。
- 不提供密码找回功能；如果忘记主密码，只能清空保险库后重新创建。
- 插件不包含遥测、远程代码执行或云端同步。

## 使用方法

1. 在命令面板中打开 **2FA Management: Open 2FA view**。
2. 创建加密保险库，并设置主密码。
3. 手动添加条目，或导入 `otpauth://` 链接、二维码图片。
4. 需要复制验证码时，先解锁保险库。

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
