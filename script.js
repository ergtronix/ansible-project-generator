/* ===================================================
   Ansible Project Generator — script.js
   =================================================== */

'use strict';

// -------------------------------------------------------
// 定数定義
// -------------------------------------------------------
const MIDDLEWARE_OPTIONS = {
  web:     ['nginx', 'apache2', 'httpd'],
  app:     ['nodejs', 'python3', 'git'],
  db:      ['mysql-server', 'postgresql'],
  monitor: ['prometheus', 'node-exporter', 'htop', 'curl'],
};

const VALID_SERVER_TYPES = new Set(['web', 'app', 'db', 'monitor']);
const VALID_MIDDLEWARE    = new Set(Object.values(MIDDLEWARE_OPTIONS).flat());

const SERVER_TYPE_LABELS = {
  web:     'Webサーバー',
  app:     'APサーバー',
  db:      'DBサーバー',
  monitor: '監視サーバー',
};

const STORAGE_KEY = 'ansible-generator-servers';

// -------------------------------------------------------
// 状態
// -------------------------------------------------------
let servers = loadFromStorage();

// -------------------------------------------------------
// DOM要素
// -------------------------------------------------------
const elServerType  = document.getElementById('server-type');
const elGroupName   = document.getElementById('group-name');
const elHostName    = document.getElementById('host-name');
const elIpAddress   = document.getElementById('ip-address');
const elSshUser     = document.getElementById('ssh-user');
const elMiddleware  = document.getElementById('middleware');
const elErrorMsg    = document.getElementById('error-message');
const elServerTbody = document.getElementById('server-tbody');
const elEmptyRow    = document.getElementById('empty-row');
const elOutputSec   = document.getElementById('output-section');
const elCopyAllMsg  = document.getElementById('copy-all-message');

// -------------------------------------------------------
// 初期化
// -------------------------------------------------------
elServerType.addEventListener('change', onServerTypeChange);
document.getElementById('btn-add').addEventListener('click', addServer);
document.getElementById('btn-generate').addEventListener('click', generateFiles);
document.getElementById('btn-copy-all').addEventListener('click', copyAll);
document.getElementById('btn-clear').addEventListener('click', clearAll);

document.querySelectorAll('.btn-copy').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const msgId    = 'msg-' + targetId.replace('output-', '');
    copyToClipboard(
      document.getElementById(targetId).textContent,
      document.getElementById(msgId),
      targetId.replace('output-', '') + ' をコピーしました。'
    );
  });
});

document.querySelectorAll('.btn-dl').forEach(btn => {
  btn.addEventListener('click', () => {
    const content  = document.getElementById(btn.dataset.target).textContent;
    const filename = btn.dataset.filename;
    downloadFile(filename, content);
  });
});

document.getElementById('btn-zip-download').addEventListener('click', downloadZip);

// 初回レンダリング
renderTable();

// -------------------------------------------------------
// サーバー種別変更 → ミドルウェア候補を更新
// -------------------------------------------------------
function onServerTypeChange() {
  const type = elServerType.value;
  elMiddleware.innerHTML = '';

  if (!type) {
    elMiddleware.innerHTML = '<option value="">-- サーバー種別を選択してください --</option>';
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- 選択してください --';
  elMiddleware.appendChild(placeholder);

  (MIDDLEWARE_OPTIONS[type] || []).forEach(mw => {
    const opt = document.createElement('option');
    opt.value = mw;
    opt.textContent = mw;
    elMiddleware.appendChild(opt);
  });
}

// -------------------------------------------------------
// サーバー追加
// -------------------------------------------------------
function addServer() {
  clearError();

  const serverType = elServerType.value.trim();
  const groupName  = elGroupName.value.trim();
  const hostName   = elHostName.value.trim();
  const ipAddress  = elIpAddress.value.trim();
  const sshUser    = elSshUser.value.trim();
  const middleware = elMiddleware.value.trim();

  // バリデーション
  if (!serverType)  return showError('サーバー種別を選択してください。');
  if (!groupName)   return showError('グループ名を入力してください。');
  if (!hostName)    return showError('ホスト名を入力してください。');
  if (!ipAddress)   return showError('IPアドレスを入力してください。');
  if (!isValidIPv4(ipAddress)) return showError('有効なIPv4アドレスを入力してください（例: 192.168.56.10）。');
  if (!sshUser)     return showError('SSHユーザーを入力してください。');
  if (!middleware)  return showError('ミドルウェアを選択してください。');

  const entry = { serverType, groupName, hostName, ipAddress, sshUser, middleware };
  servers.push(entry);
  saveToStorage();
  renderTable();

  // フォームリセット（種別は維持してミドルウェアだけリセット）
  elGroupName.value  = '';
  elHostName.value   = '';
  elIpAddress.value  = '';
  elSshUser.value    = '';
  elMiddleware.value = '';
}

// -------------------------------------------------------
// テーブル描画
// -------------------------------------------------------
function renderTable() {
  // emptyRow以外の行をすべて削除
  Array.from(elServerTbody.querySelectorAll('tr:not(#empty-row)')).forEach(r => r.remove());

  if (servers.length === 0) {
    elEmptyRow.hidden = false;
    return;
  }

  elEmptyRow.hidden = true;

  servers.forEach((s, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="サーバー種別"><span class="badge badge-${s.serverType}">${SERVER_TYPE_LABELS[s.serverType] || s.serverType}</span></td>
      <td data-label="グループ名">${escHtml(s.groupName)}</td>
      <td data-label="ホスト名">${escHtml(s.hostName)}</td>
      <td data-label="IPアドレス">${escHtml(s.ipAddress)}</td>
      <td data-label="SSHユーザー">${escHtml(s.sshUser)}</td>
      <td data-label="ミドルウェア"><code>${escHtml(s.middleware)}</code></td>
      <td data-label="操作"><button class="btn btn-sm btn-danger btn-delete" data-index="${index}">削除</button></td>
    `;
    elServerTbody.appendChild(tr);
  });

  elServerTbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteServer(Number(btn.dataset.index)));
  });
}

// -------------------------------------------------------
// サーバー削除
// -------------------------------------------------------
function deleteServer(index) {
  servers.splice(index, 1);
  saveToStorage();
  renderTable();
}

// -------------------------------------------------------
// Ansibleファイル生成
// -------------------------------------------------------
function generateFiles() {
  if (servers.length === 0) {
    showError('サーバーが1件も登録されていません。サーバーを追加してから生成してください。');
    return;
  }

  clearError();

  document.getElementById('output-inventory').textContent  = generateInventory();
  document.getElementById('output-playbook').textContent   = generatePlaybook();
  document.getElementById('output-groupvars').textContent  = generateGroupVars();
  document.getElementById('output-readme').textContent     = generateAnsibleReadme();

  elOutputSec.classList.remove('hidden');
  elOutputSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// -------------------------------------------------------
// inventory.ini 生成
// -------------------------------------------------------
function generateInventory() {
  const groups = groupByGroup(servers);
  const lines = [];

  for (const [group, members] of Object.entries(groups)) {
    lines.push(`[${group}]`);
    members.forEach(s => {
      lines.push(`${s.hostName} ansible_host=${s.ipAddress} ansible_user=${s.sshUser}`);
    });
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// -------------------------------------------------------
// playbook.yml 生成
// -------------------------------------------------------
function generatePlaybook() {
  const groups = groupByGroup(servers);
  const lines = ['---'];

  for (const [group, members] of Object.entries(groups)) {
    const representative = members[0];
    const type = representative.serverType;
    const typeName = {
      web:     'Web',
      app:     'AP',
      db:      'DB',
      monitor: 'Monitoring',
    }[type] || type;

    lines.push(`- name: Setup ${typeName} servers`);
    lines.push(`  hosts: ${group}`);
    lines.push(`  become: true`);
    lines.push(`  tasks:`);

    const middlewares = [...new Set(members.map(s => s.middleware))];

    middlewares.forEach(mw => {
      lines.push(`    - name: Install ${mw}`);
      lines.push(`      ansible.builtin.package:`);
      lines.push(`        name: ${mw}`);
      lines.push(`        state: present`);
      lines.push('');

      // Webサーバー系はサービス起動タスクも追加
      if (type === 'web') {
        lines.push(`    - name: Start and enable ${mw}`);
        lines.push(`      ansible.builtin.service:`);
        lines.push(`        name: ${mw}`);
        lines.push(`        state: started`);
        lines.push(`        enabled: true`);
        lines.push('');
      }
    });
  }

  return lines.join('\n').trimEnd();
}

// -------------------------------------------------------
// group_vars/all.yml 生成
// -------------------------------------------------------
function generateGroupVars() {
  return `---
ansible_become: true
# ansible_ssh_common_args: '-o StrictHostKeyChecking=no'
# 注意: 上記は開発・テスト環境専用の設定です。本番環境では使用しないでください。

project_name: ansible-project-generator
environment: development`;
}

// -------------------------------------------------------
// README_ansible.md 生成
// -------------------------------------------------------
function generateAnsibleReadme() {
  const groups = groupByGroup(servers);
  const groupList = Object.keys(groups).join(', ');
  const now = new Date().toISOString().slice(0, 10);

  const hostLines = Object.entries(groups)
    .map(([g, ms]) => ms.map(s => `  - ${s.hostName} (${s.ipAddress})`).join('\n'))
    .join('\n');

  return `# Ansible 実行手順

## 概要

このAnsible構成は、Ansible Project Generator によって生成された学習用の構成例です。

生成日: ${now}
対象グループ: ${groupList}

## 生成ファイル

- inventory.ini
- playbook.yml
- group_vars/all.yml

## ホスト一覧

${hostLines}

## 実行コマンド

\`\`\`bash
ansible-playbook -i inventory.ini playbook.yml
\`\`\`

接続テスト:

\`\`\`bash
ansible all -i inventory.ini -m ping
\`\`\`

## 注意事項

このPlaybookは学習課題用の雛形です。
実環境で利用する場合は、以下を必ず確認してください。

- 対象OSに対応したパッケージ名
- SSH接続ユーザーと鍵認証の設定
- sudo権限（become設定）
- ファイアウォール・セキュリティグループ設定
- サービス名（OS・バージョンにより異なる場合あり）
- 本番環境への影響範囲

## 今後の拡張予定

- YAML形式のInventory生成
- host_vars生成
- group_varsの詳細設定
- OS種別ごとのPlaybook出し分け
- Docker構築用Playbook生成
- nginx設定ファイルのテンプレート生成
- DB初期設定Playbook生成`;
}

// -------------------------------------------------------
// すべてコピー
// -------------------------------------------------------
function copyAll() {
  if (elOutputSec.classList.contains('hidden')) {
    showMessage(elCopyAllMsg, 'error', '先に「Ansibleファイル生成」ボタンを押してください。');
    return;
  }

  const files = [
    { name: 'inventory.ini',      id: 'output-inventory' },
    { name: 'playbook.yml',       id: 'output-playbook'  },
    { name: 'group_vars/all.yml', id: 'output-groupvars' },
    { name: 'README_ansible.md',  id: 'output-readme'    },
  ];

  const combined = files
    .map(f => `===== ${f.name} =====\n\n${document.getElementById(f.id).textContent}`)
    .join('\n\n');

  copyToClipboard(combined, elCopyAllMsg, 'すべてのファイル内容をコピーしました。');
}

// -------------------------------------------------------
// クリア
// -------------------------------------------------------
function clearAll() {
  servers = [];
  saveToStorage();
  renderTable();
  clearError();
  elOutputSec.classList.add('hidden');
  elCopyAllMsg.hidden = true;
  document.querySelectorAll('.copy-msg').forEach(el => { el.textContent = ''; });
}

// -------------------------------------------------------
// ユーティリティ
// -------------------------------------------------------
function isValidIPv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function groupByGroup(list) {
  const result = {};
  list.forEach(s => {
    if (!result[s.groupName]) result[s.groupName] = [];
    result[s.groupName].push(s);
  });
  return result;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function showError(msg) {
  elErrorMsg.textContent = msg;
  elErrorMsg.hidden = false;
  elErrorMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearError() {
  elErrorMsg.hidden = true;
  elErrorMsg.textContent = '';
}

function showMessage(el, type, msg) {
  el.textContent = msg;
  el.className = `message ${type}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

function copyToClipboard(text, msgEl, successText) {
  if (!navigator.clipboard) {
    // フォールバック
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    displayCopySuccess(msgEl, successText);
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    displayCopySuccess(msgEl, successText);
  }).catch(() => {
    if (msgEl.classList.contains('message')) {
      showMessage(msgEl, 'error', 'コピーに失敗しました。手動でテキストを選択してコピーしてください。');
    } else {
      msgEl.textContent = 'コピーに失敗しました。';
    }
  });
}

function displayCopySuccess(msgEl, text) {
  if (msgEl.classList.contains('message')) {
    showMessage(msgEl, 'success', text);
  } else {
    msgEl.textContent = text;
    setTimeout(() => { msgEl.textContent = ''; }, 2500);
  }
}

// -------------------------------------------------------
// ダウンロード機能
// -------------------------------------------------------
function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename.includes('/') ? filename.split('/').pop() : filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadZip() {
  if (elOutputSec.classList.contains('hidden')) {
    showMessage(elCopyAllMsg, 'error', '先に「Ansibleファイル生成」ボタンを押してください。');
    return;
  }

  const files = [
    { path: 'inventory.ini',         id: 'output-inventory' },
    { path: 'playbook.yml',          id: 'output-playbook'  },
    { path: 'group_vars/all.yml',    id: 'output-groupvars' },
    { path: 'README_ansible.md',     id: 'output-readme'    },
  ];

  const zip = new JSZip();
  files.forEach(f => {
    zip.file(f.path, document.getElementById(f.id).textContent);
  });

  zip.generateAsync({ type: 'blob' }).then(blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = 'ansible-project.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMessage(elCopyAllMsg, 'success', 'ansible-project.zip をダウンロードしました。');
  });
}

// -------------------------------------------------------
// localStorage
// -------------------------------------------------------
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  } catch (_) {}
}

function validateServer(s) {
  return (
    s !== null && typeof s === 'object' &&
    VALID_SERVER_TYPES.has(s.serverType) &&
    typeof s.groupName === 'string' && s.groupName.length > 0 &&
    typeof s.hostName  === 'string' && s.hostName.length  > 0 &&
    typeof s.ipAddress === 'string' && isValidIPv4(s.ipAddress) &&
    typeof s.sshUser   === 'string' && s.sshUser.length   > 0 &&
    VALID_MIDDLEWARE.has(s.middleware)
  );
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validateServer) : [];
  } catch (_) {
    return [];
  }
}
