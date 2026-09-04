import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/src/theme';

const MAP = {
  bag: 'bag-handle-outline',
  bagFilled: 'bag-handle',
  cart: 'cart-outline',
  search: 'search',
  user: 'person-circle-outline',
  heart: 'heart-outline',
  star: 'star',
  starOutline: 'star-outline',
  trash: 'trash-outline',
  plus: 'add',
  minus: 'remove',
  tag: 'pricetag-outline',
  truck: 'car-outline',
  shield: 'shield-checkmark-outline',
  box: 'cube-outline',

  bell: 'notifications-outline',
  bellFilled: 'notifications',

  // nav / chrome
  menu: 'menu',
  close: 'close',
  expand: 'expand-outline',
  chevronRight: 'chevron-forward',
  chevronLeft: 'chevron-back',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  arrowRight: 'arrow-forward',
  arrowLeft: 'arrow-back',
  home: 'home-outline',
  homeFilled: 'home',
  grid: 'grid-outline',
  check: 'checkmark',
  checkCircle: 'checkmark-circle',
  info: 'information-circle-outline',
  alert: 'alert-circle-outline',
  document: 'document-text-outline',
  settings: 'settings-outline',
  logout: 'log-out-outline',

  // marketing / events
  calendar: 'calendar-outline',
  pin: 'location-outline',
  ticket: 'ticket-outline',
  signal: 'cellular-outline',
  network: 'git-network-outline',
  pen: 'create-outline',
  chip: 'hardware-chip-outline',
  support: 'headset-outline',
  sparkles: 'sparkles-outline',
  send: 'send',
  play: 'play-circle-outline',
  trophy: 'trophy-outline',
  basketball: 'basketball-outline',
  refresh: 'refresh-outline',

  // contact / social
  whatsapp: 'logo-whatsapp',
  instagram: 'logo-instagram',
  facebook: 'logo-facebook',
  mail: 'mail-outline',
  phone: 'call-outline',
  share: 'share-social-outline',
  link: 'link-outline',
  google: 'logo-google'
};

export default function Icon({ name, size = 20, color, style, ...rest }) {
  const theme = useTheme();
  const glyph = MAP[name] || name || 'ellipse-outline';
  const resolved = color && theme.colors[color] ? theme.colors[color] : color || theme.colors.text;
  return <Ionicons name={glyph} size={size} color={resolved} style={style} {...rest} />;
}
