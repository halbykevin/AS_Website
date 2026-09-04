// The seat picker, in the app — the same halls the ticketing hub draws, read
// from the same endpoint on the marketing site's API.
//
// It is the hub's screen with one deliberate difference: **the drawing does not
// take taps.** On the web you click a block on the partner's own venue map. On
// a phone that map is 360dp wide and one of ihjoz's tables is about seven of
// them across — a target nobody can hit, and a target that punishes a near-miss
// by selecting the wrong table. So here the drawing shows you where things are,
// with what you have picked outlined on it, and the list underneath is what you
// actually press. Everything else — what a block costs, what is left, what the
// WhatsApp message says — is identical.
//
// And, as everywhere else this feature appears: picking holds nothing. Only the
// partner's own system can hold a seat. The button says Request, the note says
// what happens next, and staff confirm every one by hand.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useTheme, useThemedStyles } from '@/src/theme';
import { openUrl } from '@/src/lib/whatsapp';
import { formatEventDate } from '@/src/lib/format';
import Text from '@/src/ui/Text';
import Icon from '@/src/ui/Icon';
import Button from '@/src/ui/Button';
import Skeleton from '@/src/ui/Skeleton';
import Boundary from '@/src/components/Boundary';
import { isNumberedSeat, paintSections, seatMoney, seatPlace, seatmapSectionUrl, seatmapUrl, svgDocument, whatsappSeatsUrl } from '@/src/lib/seatmap';

const MAX_SEATS = 10;
// Seat squares. Small enough that a 40-seat row fits two screens of sideways
// scroll, big enough to hit — the grid scrolls horizontally either way.
const SEAT = 20;
const SEAT_GAP = 3;
const ROW_H = 24;
const LABEL_W = 26;
const SOLD = '#bebebe';

export default function SeatMap({ event, whatsappNumber }) {
  return (
    <Boundary name="event:seatmap" label="The seat map didn't load.">
      <SeatMapInner event={event} whatsappNumber={whatsappNumber} />
    </Boundary>
  );
}

function SeatMapInner({ event, whatsappNumber }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  // The app's event object keys on the slug (mapEvent sets id: e.slug), which
  // is exactly what the seatmap endpoint wants.
  const nights = useMemo(() => (event?.dates || []).filter(d => d?.date).sort((a, b) => a.date.localeCompare(b.date)), [event]);
  const [night, setNight] = useState(nights[0] || null);
  const [state, setState] = useState({ status: 'loading', data: null });
  const [selected, setSelected] = useState(new Map());
  const [qty, setQty] = useState(new Map());
  const [openSid, setOpenSid] = useState('');
  const [block, setBlock] = useState({ status: 'idle', data: null });

  const load = useCallback(
    async signal => {
      setState(s => ({ status: s.data ? 'refreshing' : 'loading', data: s.data }));
      try {
        const res = await fetch(seatmapUrl(event.id, night), { signal });
        const data = await res.json();
        setState(data?.available ? { status: 'ready', data } : { status: 'unavailable', data: null });
      } catch (err) {
        if (err.name !== 'AbortError') setState({ status: 'error', data: null });
      }
    },
    [event, night]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    // A different night is a different hall — anything picked on the last one
    // would be a seat in another room.
    setSelected(new Map());
    setQty(new Map());
    setOpenSid('');
    setBlock({ status: 'idle', data: null });
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // A block's seats are fetched when it is opened, not with the map: one hall
  // has six of them and most people look at one.
  useEffect(() => {
    if (!openSid) {
      setBlock({ status: 'idle', data: null });
      return undefined;
    }
    const ctrl = new AbortController();
    setBlock({ status: 'loading', data: null });
    (async () => {
      try {
        const res = await fetch(seatmapSectionUrl(event.id, openSid, night), { signal: ctrl.signal });
        const data = await res.json();
        setBlock(data?.available ? { status: 'ready', data } : { status: 'empty', data: null });
      } catch (err) {
        if (err.name !== 'AbortError') setBlock({ status: 'error', data: null });
      }
    })();
    return () => ctrl.abort();
  }, [event, openSid, night]);

  const data = state.data;
  const map = data?.map || null;
  const rows = (openSid ? block.data?.rows : data?.rows) || [];
  const currency = block.data?.currency || data?.currency || 'USD';
  // Memoised because it feeds two more memos below: `data?.zones || []` hands
  // back a fresh [] on every render when there are none, which would rebuild
  // the chosen-zones list and the picked-id set on every keystroke of a scroll.
  const zones = useMemo(() => data?.zones || [], [data]);

  const seatsChosen = [...selected.values()];
  const zonesChosen = useMemo(() => zones.map(z => ({ ...z, qty: qty.get(z.id) || 0 })).filter(z => z.qty > 0), [zones, qty]);

  const total = seatsChosen.reduce((s, x) => s + x.price, 0) + zonesChosen.reduce((s, z) => s + z.price * z.qty, 0);
  const count = seatsChosen.length + zonesChosen.reduce((n, z) => n + z.qty, 0);
  const full = seatsChosen.length >= MAX_SEATS;

  // Seat ids are only unique inside the block they came from, so the block is
  // part of the key — otherwise opening a second zone would silently replace
  // the seats already chosen in the first.
  const keyOf = seat => `${openSid || 'hall'}:${seat.id}`;

  const toggleSeat = (row, seat) => {
    if (seat.state !== 'free') return;
    const key = keyOf(seat);
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_SEATS) next.set(key, { id: key, num: seat.num, price: seat.price, row: row.label, section: row.section });
      return next;
    });
  };

  const setZone = (zone, value) => {
    const v = Math.max(0, Math.min(value, zone.max || MAX_SEATS));
    setQty(prev => {
      const next = new Map(prev);
      if (v > 0) next.set(zone.id, v);
      else next.delete(zone.id);
      return next;
    });
  };

  // Keyed on the hall alone, so the drawing is parsed once and a tap never
  // re-parses 60 KB of SVG. See paintSections for the whole reasoning.
  const xml = useMemo(() => (map ? svgDocument({ ...map, svg: paintSections(map.svg, map.sections) }) : ''), [map]);

  const reserve = whatsappSeatsUrl(whatsappNumber, { event, date: night?.date, seats: seatsChosen, zones: zonesChosen, currency });

  if (state.status === 'loading') {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <Skeleton height={18} style={{ width: '45%' }} />
        <Skeleton height={140} radius="2xl" />
      </View>
    );
  }
  // Nothing at all when there is no hall: most events on all three sites sell
  // one kind of ticket, and a heading that then removes itself would promise a
  // seat picker to almost everyone who will never get one.
  if (!data) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text variant="h3">{rows.length ? 'Choose your seats' : map ? 'Choose your area' : 'Tickets'}</Text>
          <Text variant="caption" muted style={{ marginTop: 2 }}>
            Live availability from the ticket office.
          </Text>
        </View>
        <Pressable onPress={() => load()} hitSlop={theme.layout.hitSlop} style={styles.refresh}>
          <Icon name="refresh" size={14} color={theme.colors.textMuted} />
          <Text variant="caption" muted>
            {state.status === 'refreshing' ? 'Checking…' : 'Refresh'}
          </Text>
        </Pressable>
      </View>

      {/* One hall per night: every one of the three sells each night separately,
          with its own seats already gone. */}
      {nights.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nights}>
          {nights.map(n => {
            const on = n === night;
            return (
              <Pressable key={`${n.date}|${n.time || ''}`} onPress={() => setNight(n)} style={[styles.night, on && styles.nightOn]}>
                <Text variant="caption" style={{ fontWeight: '700', color: on ? theme.colors.white : theme.colors.textMuted }}>
                  {formatEventDate(n.date)}
                  {n.time ? ` · ${n.time}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* The partner's own drawing of the room. Display only — see the note at
          the top of this file for why the list below is what takes the tap. */}
      {xml ? (
        <View style={styles.venue}>
          <SvgXml xml={xml} width="100%" height={200} />
          <Text variant="caption" faint style={{ textAlign: 'center', marginTop: 4 }}>
            {(map.sections || []).filter(s => s.inStock).length} of {(map.sections || []).length} areas on sale · choose below
          </Text>
        </View>
      ) : null}

      {/* Seats — the whole hall for the box office, one block at a time for a
          drawn map. */}
      {openSid ? (
        <View style={styles.blockHead}>
          <Text variant="overline" faint>
            {block.data?.section?.name || 'SEATS'}
          </Text>
          <Pressable onPress={() => setOpenSid('')} hitSlop={theme.layout.hitSlop}>
            <Text variant="caption" color="primary" style={{ fontWeight: '700' }}>
              Back to the map
            </Text>
          </Pressable>
        </View>
      ) : null}

      {openSid && block.status === 'loading' ? (
        <Skeleton height={120} radius="xl" style={{ marginHorizontal: theme.spacing.lg }} />
      ) : rows.length > 0 ? (
        <SeatGrid rows={rows} selected={selected} full={full} keyOf={keyOf} onToggle={toggleSeat} />
      ) : null}

      {openSid && block.status === 'empty' ? (
        <Text variant="caption" muted style={{ paddingHorizontal: theme.spacing.lg }}>
          We couldn’t read the seats in this block. Pick another, or ask us on WhatsApp and we’ll check by hand.
        </Text>
      ) : null}

      {/* Areas: the blocks with seats to open, and the zones and tables sold by
          quantity. This is the picker on a phone. */}
      {!openSid ? <AreaList map={map} zones={zones} qty={qty} currency={currency} onOpen={setOpenSid} onZone={setZone} /> : null}

      <View style={styles.foot}>
        {count > 0 ? (
          <>
            <View style={styles.chips}>
              {seatsChosen.map(s => (
                <Pressable key={s.id} onPress={() => toggleSeat({ label: s.row, section: s.section }, { id: s.id.split(':').pop(), state: 'free', num: s.num, price: s.price })} style={styles.chip}>
                  <Text variant="caption" color="primary" style={{ fontWeight: '700' }}>
                    {[seatPlace(s), isNumberedSeat(s.num) ? `#${s.num}` : null].filter(Boolean).join(' · ')} ×
                  </Text>
                </Pressable>
              ))}
              {zonesChosen.map(z => (
                <Pressable key={z.id} onPress={() => setZone(z, 0)} style={styles.chip}>
                  <Text variant="caption" color="primary" style={{ fontWeight: '700' }}>
                    {z.qty} × {z.name} ×
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text variant="body" style={{ fontWeight: '700', marginBottom: theme.spacing.sm }}>
              {count} {count === 1 ? 'ticket' : 'tickets'} · {seatMoney(total, currency)}
            </Text>
            <Button label="Request on WhatsApp" icon="whatsapp" onPress={() => reserve && openUrl(reserve)} disabled={!reserve} fullWidth />
          </>
        ) : (
          <Text variant="caption" muted>
            {rows.length ? 'Tap the seats you want.' : 'Choose an area to get started.'}
          </Text>
        )}
        {/* The honest bit, and it stays. */}
        <Text variant="caption" faint style={{ marginTop: theme.spacing.md, lineHeight: 16 }}>
          Seats aren’t held until we confirm. We check with the ticket office and reply on WhatsApp — if one has just gone, we’ll offer you the closest we can get.
          {full ? ` You can request up to ${MAX_SEATS} seats at a time.` : ''}
        </Text>
      </View>
    </View>
  );
}

/**
 * The hall, rebuilt.
 *
 * Rows are centred, not left-aligned: a theatre fans out — one hall here runs
 * 25 seats at the front to 47 at the back — and pinning every row to the left
 * draws it as a staircase with its aisles smeared into diagonals. The box
 * office centres each row and so does the web picker.
 */
function SeatGrid({ rows, selected, full, keyOf, onToggle }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const widest = rows.reduce((m, r) => Math.max(m, r.seats.length), 0);
  const width = LABEL_W + widest * (SEAT + SEAT_GAP);

  return (
    <View style={{ paddingVertical: theme.spacing.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}>
        <View style={{ width }}>
          <View style={styles.stage}>
            <Text variant="caption" style={{ color: theme.colors.white, letterSpacing: 3, fontWeight: '800', fontSize: 9 }}>
              STAGE
            </Text>
          </View>
          {rows.map(row => (
            <View key={row.id} style={{ height: ROW_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="caption" faint style={{ width: LABEL_W - 4, fontSize: 9, textAlign: 'right', paddingRight: 4 }} numberOfLines={1}>
                {row.label}
              </Text>
              {row.seats.map(seat => {
                if (seat.state === 'gap') return <View key={seat.id} style={{ width: SEAT + SEAT_GAP, height: SEAT }} />;
                const sold = seat.state === 'sold';
                const picked = selected.has(keyOf(seat));
                return (
                  <Pressable
                    key={seat.id}
                    disabled={sold || (full && !picked)}
                    onPress={() => onToggle(row, seat)}
                    accessibilityLabel={`${seatPlace({ section: row.section, row: row.label })}${isNumberedSeat(seat.num) ? `, seat ${seat.num}` : ''} — ${sold ? 'sold' : seatMoney(seat.price)}`}
                    style={{ width: SEAT + SEAT_GAP, height: SEAT, paddingRight: SEAT_GAP }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 3,
                        backgroundColor: sold ? SOLD : seat.color || theme.colors.primary,
                        opacity: full && !picked && !sold ? 0.4 : 1,
                        borderWidth: picked ? 2 : 0,
                        borderColor: theme.colors.text
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      <Text variant="caption" faint style={{ paddingHorizontal: theme.spacing.lg, marginTop: 4 }}>
        Scroll sideways to see the whole hall.
      </Text>
    </View>
  );
}

/**
 * Every area, priced: the ones with numbered seats open a grid, the rest take a
 * quantity. A block sold whole — a table of four, min 4 / max 4 — is one choice
 * rather than a counter, because there is no such thing as three of it.
 */
function AreaList({ map, zones, qty, currency, onOpen, onZone }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const seated = (map?.sections || []).filter(s => s.kind === 'seats');
  const list = [...zones].sort((a, b) => Number(b.inStock) - Number(a.inStock));
  if (!seated.length && !list.length) return null;

  return (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: theme.spacing.sm }}>
      {seated.map(s => (
        <Pressable key={s.id} disabled={!s.inStock} onPress={() => onOpen(s.id)} style={[styles.row, !s.inStock && { opacity: 0.4 }]}>
          <View style={{ flex: 1 }}>
            <Text variant="body" style={{ fontWeight: '700' }}>
              {s.name}
            </Text>
            <Text variant="caption" muted>
              {s.inStock ? `${seatMoney(s.price, currency)} · pick your seats` : 'not on sale'}
            </Text>
          </View>
          <Icon name="chevronRight" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ))}

      {list.map(z => {
        const picked = qty.get(z.id) || 0;
        const whole = z.min > 1 && z.min === z.max;
        return (
          <View key={z.id} style={[styles.row, !z.inStock && { opacity: 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
                {z.name}
              </Text>
              <Text variant="caption" muted>
                {z.inStock ? seatMoney(z.price, currency) : 'not on sale'}
                {whole && z.inStock ? ` · table of ${z.min}` : ''}
                {z.left > 0 && z.left <= 10 && z.inStock ? ` · ${z.left} left` : ''}
              </Text>
            </View>
            {whole ? (
              <Pressable disabled={!z.inStock} onPress={() => onZone(z, picked ? 0 : z.min)} style={[styles.pick, picked ? styles.pickOn : null]}>
                <Text variant="caption" style={{ fontWeight: '700', color: picked ? theme.colors.white : theme.colors.textMuted }}>
                  {picked ? 'Chosen' : 'Choose'}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.stepper}>
                <Pressable disabled={!z.inStock || picked === 0} onPress={() => onZone(z, picked - 1)} style={styles.step} hitSlop={6}>
                  <Text variant="body" style={{ fontWeight: '800', opacity: picked === 0 ? 0.3 : 1 }}>
                    −
                  </Text>
                </Pressable>
                <Text variant="body" style={{ fontWeight: '700', minWidth: 16, textAlign: 'center' }}>
                  {picked}
                </Text>
                <Pressable disabled={!z.inStock || picked >= Math.min(z.max || MAX_SEATS, MAX_SEATS)} onPress={() => onZone(z, picked + 1)} style={styles.step} hitSlop={6}>
                  <Text variant="body" style={{ fontWeight: '800' }}>
                    +
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = t => ({
  card: { borderRadius: t.radii['2xl'], borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.lg, borderBottomWidth: 1, borderBottomColor: t.colors.border },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nights: { gap: t.spacing.sm, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md },
  night: { paddingHorizontal: t.spacing.md, paddingVertical: 6, borderRadius: t.radii.pill, backgroundColor: t.colors.surfaceAlt },
  nightOn: { backgroundColor: t.colors.primary },
  venue: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing.sm },
  stage: { height: 16, borderRadius: 4, backgroundColor: t.colors.inverse, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, borderRadius: t.radii.xl, backgroundColor: t.colors.surfaceAlt, paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.sm },
  pick: { paddingHorizontal: t.spacing.md, paddingVertical: 6, borderRadius: t.radii.pill, borderWidth: 1, borderColor: t.colors.border },
  pickOn: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  step: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: t.colors.border },
  foot: { padding: t.spacing.lg, borderTopWidth: 1, borderTopColor: t.colors.border, backgroundColor: t.colors.surfaceAlt },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: t.spacing.sm },
  chip: { paddingHorizontal: t.spacing.sm, paddingVertical: 4, borderRadius: t.radii.pill, backgroundColor: t.colors.primaryWash }
});
