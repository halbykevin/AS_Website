// Renders the light markdown the catalog keeps in product copy: blocks
// separated by blank lines, headings prefixed with #/##/###, bullets with "- ".
// This mirrors the web store's renderer (as_store ProductTabs) so a product
// reads the same on both, instead of arriving as one grey wall with literal
// "##" and "-" characters in it.
//
// Anything unrecognised falls through as a paragraph, so hand-typed plain text
// still looks right.

import { useMemo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/src/theme';
import Text from './Text';

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+/;

function parse(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const heading = block.match(HEADING);
      if (heading) return { type: 'heading', level: heading[1].length, text: heading[2].trim() };

      const lines = block
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      if (lines.length && lines.every(line => BULLET.test(line))) {
        return { type: 'list', items: lines.map(line => line.replace(BULLET, '')) };
      }

      return { type: 'paragraph', text: block };
    });
}

export default function Markdown({ text, muted = true, style }) {
  const theme = useTheme();
  const blocks = useMemo(() => parse(text), [text]);

  if (!blocks.length) return null;

  return (
    <View style={[{ gap: theme.spacing.md }, style]}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            // A heading needs more air above it than the block gap gives — it
            // opens a new topic rather than continuing the previous one.
            <Text key={i} variant={block.level <= 2 ? 'h3' : 'title'} style={i > 0 ? { marginTop: theme.spacing.sm } : null}>
              {block.text}
            </Text>
          );
        }

        if (block.type === 'list') {
          return (
            <View key={i} style={{ gap: theme.spacing.sm }}>
              {block.items.map((item, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  {/* Nudged down to sit on the first line's optical centre. */}
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, marginTop: 8, backgroundColor: theme.colors.primary }} />
                  <Text variant="body" muted={muted} style={{ flex: 1 }}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        return (
          <Text key={i} variant="body" muted={muted}>
            {block.text}
          </Text>
        );
      })}
    </View>
  );
}
