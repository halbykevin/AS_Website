// Picks a meaningful Icon name for a solution "item" (a service under a solution
// on the What We Do detail pages) from its title, so each service shows a fitting
// icon instead of a generic arrow or number. An explicit `item.icon` wins, so a
// per-item override can be added later without touching this map.
//
// Rules are tested in order — first match wins — so more specific concepts sit
// above broader ones (e.g. "maintenance" before "security", "support" before
// "remote"). Anything unmatched falls back to a clean check badge.
const RULES = [
  [/maintenance|maintain|servicing/, 'wrench'],
  [/cctv|surveillance/, 'camera'],
  [/intrusion|alarm/, 'bell'],
  [/access control|door/, 'lock'],
  [/fire/, 'flame'],
  [/intercom|videophone|voice|telephon|\bphone/, 'phone'],
  [/public address|speaker|\baudio/, 'audio'],
  [/safe|vault/, 'vault'],
  [/money|counter|cash/, 'calculator'],
  [/cloud/, 'cloud'],
  [/backup|disaster|recovery|continuit/, 'backup'],
  [/storage|server/, 'database'],
  [/virtualization|virtual/, 'layers'],
  [/cabling|cable|structured/, 'cable'],
  [/management|administration/, 'cog'],
  [/consultanc|advisory|consulting/, 'bulb'],
  [/security|firewall|protection/, 'shield'],
  [/network/, 'network'],
  [/support|assistance|onsite|on-demand|on demand|technical|helpdesk|help desk/, 'support'],
  [/monitor|remote/, 'monitor'],
  [/filing|archive|record/, 'folder'],
  [/infrastructure|\bsystem/, 'layers'],
  [/computer|keyboard|peripheral|mouse/, 'keyboard'],
  [/ink|toner|print|copy/, 'printer'],
  [/presentation|visual|whiteboard|projector/, 'presentation'],
  [/climate|temperature|hvac|cooling|heating|thermostat/, 'climate'],
  [/lighting|\blight|lamp/, 'bulb'],
  [/writing|\bpen|instrument/, 'pen'],
  [/glue|adhesive|tape/, 'droplet'],
  [/desk/, 'desk'],
  [/paper|document|supplies|stationery|office/, 'document'],
]

export function serviceIcon(item) {
  if (item?.icon) return item.icon
  const t = String(item?.title || '').toLowerCase()
  for (const [re, name] of RULES) {
    if (re.test(t)) return name
  }
  return 'check'
}
