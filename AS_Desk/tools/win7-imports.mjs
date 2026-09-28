import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Proves a Windows 7 build can load on Windows 7 SP1: Windows refuses to start a program if any DLL or
// function it imports is missing ("entry point not found"), before a single line of it runs. Usage:
//   node tools/win7-imports.mjs <exe> [x64|x86]
// Checks, from the executable's own import tables:
// 1. every imported DLL exists on Windows 7 (API-set DLLs such as api-ms-win-core-winrt-* do not);
// 2. no imported function is newer than Windows 7: the function names are looked up in the Windows SDK
//    headers compiled for Windows 7 and for Windows 10 (the headers gate each API by version), plus a
//    list of known newer APIs that the headers do not gate;
// 3. the PE header does not demand a newer OS version.
// Delay-loaded imports (build.rs) are allowed to be newer: they are resolved only when called, and the
// code calls them only where they exist. Names the headers do not declare at all are listed in
// REVIEWED below after checking them by hand; anything else unknown fails the check.
const [exe, arch = 'x64'] = process.argv.slice(2);
if (!exe || !existsSync(exe)) throw new Error('Usage: node tools/win7-imports.mjs <exe> [x64|x86]');

// DLLs present on every Windows 7 SP1 installation (only those this app could plausibly import).
const WIN7_DLLS = new Set(['advapi32.dll', 'bcrypt.dll', 'comctl32.dll', 'comdlg32.dll', 'crypt32.dll', 'dbghelp.dll', 'dwmapi.dll',
  'gdi32.dll', 'gdiplus.dll', 'imm32.dll', 'iphlpapi.dll', 'kernel32.dll', 'msimg32.dll', 'ncrypt.dll', 'ntdll.dll', 'ole32.dll',
  'oleaut32.dll', 'powrprof.dll', 'psapi.dll', 'rpcrt4.dll', 'secur32.dll', 'setupapi.dll', 'shell32.dll', 'shlwapi.dll', 'user32.dll',
  'userenv.dll', 'uxtheme.dll', 'version.dll', 'winmm.dll', 'ws2_32.dll', 'wtsapi32.dll', 'winspool.drv', 'dnsapi.dll', 'netapi32.dll']);
// Newer than Windows 7 but not version-gated in the SDK headers (or gated only by a WINAPI_FAMILY).
const KNOWN_NEWER = new Set(['GetSystemTimePreciseAsFileTime', 'WaitOnAddress', 'WakeByAddressSingle', 'WakeByAddressAll', 'ProcessPrng',
  'SetThreadDescription', 'GetThreadDescription', 'CreateFile2', 'CoIncrementMTAUsage', 'CoDecrementMTAUsage', 'RoGetActivationFactory',
  'RoInitialize', 'RoOriginateErrorW', 'RoGetAgileReference', 'SetProcessDpiAwarenessContext', 'SetThreadDpiAwarenessContext',
  'GetDpiForWindow', 'GetDpiForSystem', 'GetDpiForMonitor', 'SetProcessDpiAwareness', 'AdjustWindowRectExForDpi', 'EnableNonClientDpiScaling',
  'GetSystemMetricsForDpi', 'SystemParametersInfoForDpi', 'GetOverlappedResultEx', 'SetDefaultDllDirectories', 'AddDllDirectory',
  'GetCurrentThreadStackLimits', 'PrefetchVirtualMemory', 'EventSetInformation']);
// Not declared in the public headers; checked by hand against Windows 7 SP1 (ntdll has had these since
// XP; SystemFunction036 is advapi32's RtlGenRandom, also XP).
const REVIEWED = new Set(['SystemFunction036', 'NtReadFile', 'NtWriteFile', 'NtOpenFile', 'NtCreateNamedPipeFile', 'NtQueryInformationFile',
  'NtSetInformationFile', 'NtQueryObject', 'NtCancelIoFileEx', 'RtlGetVersion', 'NtQuerySystemInformation', 'RtlCaptureContext']);

// ── PE import tables ──────────────────────────────────────────────────────────────────────────
const pe = readFileSync(exe);
const header = pe.readUInt32LE(0x3c);
if (pe.toString('latin1', header, header + 4) !== 'PE\0\0') throw new Error(`${exe} is not a PE file`);
const sections = pe.readUInt16LE(header + 6), optional = header + 24, optionalSize = pe.readUInt16LE(header + 20);
const wide = pe.readUInt16LE(optional) === 0x20b; // PE32+ (64-bit)
const machine = { 0x8664: 'x64', 0x14c: 'x86' }[pe.readUInt16LE(header + 4)];
if (machine !== arch) throw new Error(`${exe} is ${machine ?? 'another architecture'}, expected ${arch}`);
const osVersion = [pe.readUInt16LE(optional + 40), pe.readUInt16LE(optional + 42)], subsystem = [pe.readUInt16LE(optional + 48), pe.readUInt16LE(optional + 50)];
const directory = index => { const at = optional + (wide ? 112 : 96) + index * 8; return { rva: pe.readUInt32LE(at), size: pe.readUInt32LE(at + 4) }; };
const table = optional + optionalSize;
const offset = rva => {
  for (let i = 0; i < sections; i++) {
    const s = table + i * 40, va = pe.readUInt32LE(s + 12), size = Math.max(pe.readUInt32LE(s + 8), pe.readUInt32LE(s + 16));
    if (rva >= va && rva < va + size) return rva - va + pe.readUInt32LE(s + 20);
  }
  throw new Error(`RVA ${rva.toString(16)} is outside every section`);
};
const cstring = rva => { const start = offset(rva); return pe.toString('latin1', start, pe.indexOf(0, start)); };
function thunks(rva) {
  const names = [], step = wide ? 8 : 4;
  for (let at = offset(rva); ; at += step) {
    const value = wide ? pe.readBigUInt64LE(at) : BigInt(pe.readUInt32LE(at));
    if (value === 0n) return names;
    const ordinal = wide ? value >> 63n : value >> 31n;
    names.push(ordinal ? `#${value & 0xffffn}` : cstring(Number(value & 0x7fffffffn) + 2));
  }
}
const imports = [];
for (let at = directory(1).rva && offset(directory(1).rva); at && pe.readUInt32LE(at + 12); at += 20) {
  const dll = cstring(pe.readUInt32LE(at + 12)).toLowerCase();
  for (const name of thunks(pe.readUInt32LE(at) || pe.readUInt32LE(at + 16))) imports.push({ dll, name, delayed: false });
}
for (let at = directory(13).rva && offset(directory(13).rva); at && pe.readUInt32LE(at + 4); at += 32) {
  const dll = cstring(pe.readUInt32LE(at + 4)).toLowerCase();
  for (const name of thunks(pe.readUInt32LE(at + 16))) imports.push({ dll, name, delayed: true });
}

// ── Which names the SDK declares for Windows 7, and for Windows 10 ───────────────────────────────
function vcvars() {
  const vswhere = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const found = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-find', 'VC\\Auxiliary\\Build\\vcvarsall.bat'], { encoding: 'utf8' });
  const path = found.stdout?.trim().split(/\r?\n/)[0];
  if (!path) throw new Error('MSVC build tools not found (needed to read the Windows SDK headers)');
  return path;
}
function declared(names, winnt) {
  const dir = mkdtempSync(join(tmpdir(), 'asdesk-win7-'));
  try {
    const source = [`#define WINVER ${winnt}`, `#define _WIN32_WINNT ${winnt}`, `#define NTDDI_VERSION ${winnt}0000`, '#define SECURITY_WIN32',
      ...['winsock2.h', 'ws2tcpip.h', 'windows.h', 'winternl.h', 'shellapi.h', 'shlobj.h', 'shlwapi.h', 'commctrl.h', 'dwmapi.h', 'uxtheme.h',
        'wtsapi32.h', 'wincrypt.h', 'dpapi.h', 'bcrypt.h', 'ncrypt.h', 'sddl.h', 'aclapi.h', 'userenv.h', 'psapi.h', 'tlhelp32.h', 'dbghelp.h',
        'shellscalingapi.h', 'roapi.h', 'winstring.h', 'combaseapi.h', 'ole2.h', 'oleauto.h', 'olectl.h', 'powrprof.h', 'security.h',
        'schannel.h', 'imm.h', 'mmsystem.h', 'iphlpapi.h', 'winspool.h', 'objbase.h', 'evntprov.h'].map(h => `#include <${h}>`),
      '#include <stdio.h>', 'int main() {',
      ...names.map(n => `__if_exists(::${n}) { puts("${n}"); }`), 'return 0; }'].join('\n');
    writeFileSync(join(dir, 'probe.cpp'), source);
    writeFileSync(join(dir, 'probe.cmd'), ['@echo off', `call "${vcvars()}" ${arch === 'x86' ? 'x64_x86' : 'x64'} >nul || exit /b 2`,
      'cl /nologo /EHsc /W0 probe.cpp /link /nologo >build.log 2>&1 || exit /b 3', '"%~dp0probe.exe" > names.txt || exit /b 4'].join('\r\n'));
    const build = spawnSync('cmd.exe', ['/d', '/c', join(dir, 'probe.cmd')], { cwd: dir, encoding: 'utf8' });
    if (build.status !== 0) {
      const log = existsSync(join(dir, 'build.log')) ? readFileSync(join(dir, 'build.log'), 'utf8').slice(-3000) : '';
      throw new Error(`Could not compile the SDK probe (step ${build.status}):\n${log}${build.stdout}${build.stderr}`);
    }
    return new Set(readFileSync(join(dir, 'names.txt'), 'utf8').split(/\r?\n/).filter(Boolean));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const named = [...new Set(imports.filter(i => !i.name.startsWith('#')).map(i => i.name))].filter(n => /^[A-Za-z_]\w*$/.test(n));
const win7 = declared(named, '0x0601'), win10 = declared(named, '0x0A00');
const problems = [], allowed = [];
if (osVersion[0] * 100 + osVersion[1] > 601 || subsystem[0] * 100 + subsystem[1] > 601) {
  problems.push(`PE header requires Windows ${osVersion.join('.')} (subsystem ${subsystem.join('.')}); Windows 7 is 6.1`);
}
for (const { dll, name, delayed } of imports) {
  const why = !WIN7_DLLS.has(dll) ? `${dll} does not exist on Windows 7`
    : name.startsWith('#') ? 'imported by ordinal (cannot be verified)'
    : KNOWN_NEWER.has(name) ? 'newer than Windows 7'
    : !win7.has(name) && win10.has(name) ? 'the SDK declares it only for Windows 8 or later'
    : !win7.has(name) && !REVIEWED.has(name) ? 'not in the SDK headers and not reviewed (add it to REVIEWED after checking)' : '';
  if (!why) continue;
  (delayed ? allowed : problems).push(`${dll}!${name}: ${why}`);
}
const dlls = [...new Set(imports.map(i => `${i.dll}${i.delayed ? ' (delay-loaded)' : ''}`))];
console.log(`${exe}: ${imports.length} imports from ${dlls.length} DLLs (${dlls.join(', ')}); PE requires Windows ${osVersion.join('.')}`);
for (const line of allowed) console.log(`  delay-loaded, never called on Windows 7: ${line}`);
if (problems.length) {
  console.error(`\nThis build would not start on Windows 7 SP1:\n${problems.map(p => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Windows 7 SP1 compatible: every load-time import exists there.');
