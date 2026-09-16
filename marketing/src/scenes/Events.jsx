// Beat 6 — the half nobody expects.
//
// Most people meet AS as an electronics shop, so the events half is the
// surprise in the reel and it goes late, once the store has done its work.
// These are real listings pulled from the live events API.
//
// The poster artwork is deliberately *not* used. It belongs to the promoters,
// and an advert is a different use from a listing page — so the cards are drawn
// from the facts (what, when, where) instead. They read better at this size
// anyway: four posters at 500px wide are four illegible rectangles.
//
// The message that slides up is the app's actual pre-filled reservation text
// from `whatsappBookingUrl`, minus the ticket-URL line, which is noise on
// screen. Booking really does hand over to WhatsApp — there is no in-app
// checkout for events — so the scene says exactly what happens.

import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { brand, type } from '../brand';
import { events, shortDate } from '../lib/catalogue';
import { fadeUp, SPRING, SPRING_HEAVY, useEnter, useSceneFade } from '../lib/anim';
import AppHeader from '../components/AppHeader';
import AppTabBar from '../components/AppTabBar';
import Caption from '../components/Caption';
import Icon from '../components/Icon';
import Phone from '../components/Phone';

const TAP_AT = 30;
const SHEET_AT = 36;
const CHOSEN = 1;

function EventCard({ event, delay, picked }) {
  const enter = useEnter(delay, SPRING);
  return (
    <div
      style={{
        ...fadeUp(enter, 26),
        background: brand.white,
        borderRadius: 18,
        border: `1.5px solid ${picked ? brand.red : 'rgba(21,24,26,0.08)'}`,
        boxShadow: picked ? '0 10px 26px rgba(164,30,34,0.20)' : '0 4px 14px rgba(21,24,26,0.05)',
        padding: 15,
        transform: `${fadeUp(enter, 26).transform} scale(${picked ? 0.985 : 1})`
      }}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '4px 11px',
          borderRadius: 999,
          background: brand.blush,
          color: brand.redDark,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 0.7,
          textTransform: 'uppercase'
        }}
      >
        {event.category}
      </span>
      <div
        style={{
          marginTop: 9,
          fontSize: 22,
          lineHeight: 1.22,
          fontWeight: 700,
          color: brand.ink,
          letterSpacing: -0.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          height: 22 * 1.22 * 2
        }}
      >
        {event.title}
      </div>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: brand.red }}>
          <Icon name="calendar" size={17} color={brand.red} />
          {shortDate(event.date)}
          {event.time ? ` · ${event.time}` : ''}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 16,
            fontWeight: 500,
            color: 'rgba(21,24,26,0.55)'
          }}
        >
          <Icon name="pin" size={17} color="rgba(21,24,26,0.45)" />
          {[event.venue, event.city].filter(Boolean).join(', ')}
        </div>
      </div>
    </div>
  );
}

function WhatsAppSheet({ event, progress }) {
  const lines = [
    "Hello 👋 I'd like more details about this event:",
    '',
    `🎫 ${event.title}`,
    `📅 ${shortDate(event.date)}${event.time ? ` · ${event.time}` : ''}`,
    `📍 ${[event.venue, event.city].filter(Boolean).join(', ')}`,
    '',
    'Is it still available, and how can I reserve a spot?'
  ];

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '64%',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
        background: '#ECE5DD',
        boxShadow: '0 -20px 50px rgba(0,0,0,0.30)',
        transform: `translateY(${interpolate(progress, [0, 1], [100, 0])}%)`
      }}
    >
      <div
        style={{
          height: 74,
          background: brand.whatsappDark,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 20px',
          color: brand.white
        }}
      >
        <Icon name="chat" size={26} color={brand.white} filled />
        <div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>AS Company</div>
          <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.8 }}>WhatsApp</div>
        </div>
      </div>

      <div style={{ padding: 18, display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '88%',
            background: '#DCF8C6',
            borderRadius: 16,
            borderTopRightRadius: 5,
            padding: '13px 16px',
            fontSize: 17,
            lineHeight: 1.45,
            color: '#111B21',
            whiteSpace: 'pre-wrap',
            boxShadow: '0 1px 2px rgba(0,0,0,0.12)'
          }}
        >
          {lines.join('\n')}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 22,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}
      >
        <div
          style={{
            flex: 1,
            height: 52,
            borderRadius: 26,
            background: brand.white,
            display: 'flex',
            alignItems: 'center',
            padding: '0 18px',
            fontSize: 17,
            color: 'rgba(17,27,33,0.45)'
          }}
        >
          Message
        </div>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            background: brand.whatsapp,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Icon name="arrowRight" size={24} color={brand.white} strokeWidth={2.4} />
        </div>
      </div>
    </div>
  );
}

export default function Events({ duration }) {
  const frame = useCurrentFrame();
  const opacity = useSceneFade(duration);
  const enter = useEnter(0, SPRING_HEAVY);

  const list = events.slice(0, 4);
  const chosen = list[CHOSEN] || list[0];
  const sheet = interpolate(frame, [SHEET_AT, SHEET_AT + 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic)
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <Caption
        kicker="Events"
        lines={["What's on tonight.", 'Booked on WhatsApp.']}
        accent={1}
        size={type.headline}
      />

      <Phone enter={enter}>
        <AppHeader title="Events" />
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: brand.fog }}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {list.map((event, i) => (
              <EventCard
                key={event.title}
                event={event}
                delay={4 + i * 4}
                picked={i === CHOSEN && frame >= TAP_AT}
              />
            ))}
          </div>
          <WhatsAppSheet event={chosen} progress={sheet} />
        </div>
        <AppTabBar active="events" />
      </Phone>
    </AbsoluteFill>
  );
}
